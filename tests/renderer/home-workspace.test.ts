import { describe, expect, it, vi } from "vitest";
import type {
  AppSettings,
  MiniMaxSetupResult,
  PlaybackStartResult
} from "../../src/renderer/bridge.js";
import {
  HomeWorkspace,
  type HomeWorkspaceCapabilities
} from "../../src/renderer/home-workspace.js";

describe("HomeWorkspace", () => {
  it("publishes one ready setup snapshot with the existing readiness projection", async () => {
    const capabilities = createCapabilities();
    const workspace = new HomeWorkspace(capabilities);

    workspace.start();
    await settlePromises();

    expect(workspace.getSnapshot()).toMatchObject({
      setup: {
        status: "ready",
        value: { hasMiniMaxApiKey: true, settings: SETTINGS }
      },
      disposed: false,
      activeLanguage: "zh",
      activeLanguageLabel: "中文",
      canPlay: true,
      recoveryAction: undefined,
      statusLabel: "",
      selectedVoice: { voice_id: "voice-zh", display_name: "中文 Voice" }
    });
  });

  it("fails the core setup atomically and recovers through retry", async () => {
    const capabilities = createCapabilities();
    capabilities.hasMiniMaxApiKey.mockRejectedValueOnce(new Error("credential unavailable"));
    const workspace = new HomeWorkspace(capabilities);

    workspace.start();
    await settlePromises();

    expect(workspace.getSnapshot()).toMatchObject({
      setup: { status: "error", message: "无法读取朗读配置" },
      canPlay: false,
      recoveryAction: { kind: "retry-setup", label: "重试" },
      statusLabel: "无法读取朗读配置"
    });

    workspace.retrySetup();
    expect(workspace.getSnapshot().setup).toEqual({ status: "loading" });
    await settlePromises();

    expect(capabilities.getSettings).toHaveBeenCalledTimes(2);
    expect(capabilities.hasMiniMaxApiKey).toHaveBeenCalledTimes(2);
    expect(workspace.getSnapshot()).toMatchObject({
      setup: { status: "ready" },
      canPlay: true
    });
  });

  it.each([
    {
      hasMiniMaxApiKey: false,
      settings: SETTINGS,
      recoveryAction: { kind: "open-settings", label: "去设置 API Key" },
      statusLabel: "需要 API Key"
    },
    {
      hasMiniMaxApiKey: true,
      settings: { ...SETTINGS, apiKeyStatus: "failed" as const },
      recoveryAction: { kind: "verify-key", label: "验证连接" },
      statusLabel: "需要验证连接"
    },
    {
      hasMiniMaxApiKey: true,
      settings: { ...SETTINGS, voices: [] },
      recoveryAction: { kind: "refresh-voices", label: "刷新 Voice" },
      statusLabel: "需要 Voice 列表"
    }
  ])("preserves the existing $statusLabel blocker presentation", async (scenario) => {
    const capabilities = createCapabilities(scenario.settings, scenario.hasMiniMaxApiKey);
    const workspace = new HomeWorkspace(capabilities);

    workspace.start();
    await settlePromises();

    expect(workspace.getSnapshot()).toMatchObject({
      canPlay: false,
      recoveryAction: scenario.recoveryAction,
      statusLabel: scenario.statusLabel
    });
  });

  it("keeps language selection visit-scoped and falls back to the first available language", async () => {
    const capabilities = createCapabilities({
      ...SETTINGS,
      voices: [
        { voice_id: "voice-en", display_name: "English Voice", language: "en" },
        { voice_id: "voice-ja", display_name: "日本語 Voice", language: "ja" }
      ],
      preferredVoicesByLanguage: { ja: "voice-ja" }
    });
    const workspace = new HomeWorkspace(capabilities);

    workspace.start();
    await settlePromises();
    expect(workspace.getSnapshot().activeLanguage).toBe("en");

    workspace.selectLanguage("ja");
    expect(workspace.getSnapshot()).toMatchObject({
      activeLanguage: "ja",
      activeLanguageLabel: "日文",
      selectedVoice: { voice_id: "voice-ja" }
    });

    workspace.dispose();
    workspace.start();
    await settlePromises();
    expect(workspace.getSnapshot().activeLanguage).toBe("en");
  });

  it("survives StrictMode replay without accepting a late setup from the disposed generation", async () => {
    const oldSettings = deferred<AppSettings>();
    const capabilities = createCapabilities({ ...SETTINGS, model: "speech-2.8-hd" });
    capabilities.getSettings
      .mockReturnValueOnce(oldSettings.promise)
      .mockResolvedValueOnce({ ...SETTINGS, model: "speech-2.8-hd" });
    const workspace = new HomeWorkspace(capabilities);

    workspace.start();
    workspace.dispose();
    workspace.start();
    await settlePromises();

    oldSettings.resolve({ ...SETTINGS, model: "stale-model" });
    await settlePromises();

    const setup = workspace.getSnapshot().setup;
    expect(setup.status).toBe("ready");
    if (setup.status !== "ready") throw new Error("expected setup to be ready");
    expect(setup.value.settings.model).toBe("speech-2.8-hd");
  });

  it("deeply freezes the authoritative setup snapshot", async () => {
    const capabilities = createCapabilities();
    const workspace = new HomeWorkspace(capabilities);

    workspace.start();
    await settlePromises();

    const setup = workspace.getSnapshot().setup;
    expect(setup.status).toBe("ready");
    if (setup.status !== "ready") throw new Error("expected setup to be ready");
    expect(setup.value.settings).not.toBe(SETTINGS);
    expect(Object.isFrozen(setup.value.settings)).toBe(true);
    expect(Object.isFrozen(setup.value.settings.voices)).toBe(true);
    expect(() => {
      (setup.value.settings as AppSettings).model = "mutated";
    }).toThrow(TypeError);
    expect(SETTINGS.model).toBe("speech-2.8-turbo");
  });

  it("optimistically presents the latest Voice while coalescing writes", async () => {
    const firstWrite = deferred<AppSettings>();
    const lastWrite = deferred<AppSettings>();
    const capabilities = createCapabilities();
    capabilities.setPreferredVoice
      .mockReturnValueOnce(firstWrite.promise)
      .mockReturnValueOnce(lastWrite.promise);
    const workspace = new HomeWorkspace(capabilities);
    workspace.start();
    await settlePromises();

    workspace.selectPreferredVoice("voice-zh-alt");
    workspace.selectPreferredVoice("voice-zh");
    workspace.selectPreferredVoice("voice-zh-last");

    expect(capabilities.setPreferredVoice).toHaveBeenCalledTimes(1);
    expect(capabilities.setPreferredVoice).toHaveBeenNthCalledWith(1, "zh", "voice-zh-alt");
    expect(workspace.getSnapshot()).toMatchObject({
      selectedVoice: { voice_id: "voice-zh-last" },
      pending: { preferredVoice: true }
    });

    firstWrite.resolve(withPreferredVoice("voice-zh-alt"));
    await settlePromises();
    expect(capabilities.setPreferredVoice).toHaveBeenCalledTimes(2);
    expect(capabilities.setPreferredVoice).toHaveBeenNthCalledWith(2, "zh", "voice-zh-last");
    expect(workspace.getSnapshot()).toMatchObject({
      selectedVoice: { voice_id: "voice-zh-last" },
      pending: { preferredVoice: true }
    });

    lastWrite.resolve(withPreferredVoice("voice-zh-last"));
    await settlePromises();
    expect(workspace.getSnapshot()).toMatchObject({
      selectedVoice: { voice_id: "voice-zh-last" },
      pending: { preferredVoice: false },
      feedback: ""
    });
  });

  it("rolls back a failed Voice write and permits a later retry", async () => {
    const failedWrite = deferred<AppSettings>();
    const capabilities = createCapabilities();
    capabilities.setPreferredVoice
      .mockReturnValueOnce(failedWrite.promise)
      .mockResolvedValueOnce(withPreferredVoice("voice-zh-last"));
    const workspace = new HomeWorkspace(capabilities);
    workspace.start();
    await settlePromises();

    workspace.selectPreferredVoice("voice-zh-alt");
    failedWrite.reject(new Error("write unavailable"));
    await settlePromises();

    expect(workspace.getSnapshot()).toMatchObject({
      selectedVoice: { voice_id: "voice-zh" },
      pending: { preferredVoice: false },
      feedback: "Voice 更新失败，请稍后重试。"
    });

    workspace.selectPreferredVoice("voice-zh-last");
    await settlePromises();
    expect(capabilities.setPreferredVoice).toHaveBeenCalledTimes(2);
    expect(workspace.getSnapshot()).toMatchObject({
      selectedVoice: { voice_id: "voice-zh-last" },
      pending: { preferredVoice: false },
      feedback: ""
    });
  });

  it("does not let a previous visit Voice completion update or unlock the active visit", async () => {
    const oldWrite = deferred<AppSettings>();
    const newWrite = deferred<AppSettings>();
    const capabilities = createCapabilities();
    capabilities.setPreferredVoice
      .mockReturnValueOnce(oldWrite.promise)
      .mockReturnValueOnce(newWrite.promise);
    const workspace = new HomeWorkspace(capabilities);
    workspace.start();
    await settlePromises();

    workspace.selectPreferredVoice("voice-zh-alt");
    workspace.dispose();
    workspace.start();
    await settlePromises();
    workspace.selectPreferredVoice("voice-zh-last");

    oldWrite.resolve(withPreferredVoice("voice-zh-alt"));
    await settlePromises();
    expect(workspace.getSnapshot()).toMatchObject({
      selectedVoice: { voice_id: "voice-zh-last" },
      pending: { preferredVoice: true }
    });

    newWrite.resolve(withPreferredVoice("voice-zh-last"));
    await settlePromises();
    expect(workspace.getSnapshot()).toMatchObject({
      selectedVoice: { voice_id: "voice-zh-last" },
      pending: { preferredVoice: false }
    });
  });

  it("runs setup recovery commands single-flight with the existing feedback", async () => {
    const verifyResult = deferred<MiniMaxSetupResult>();
    const capabilities = createCapabilities({ ...SETTINGS, apiKeyStatus: "failed" });
    capabilities.verifyMiniMaxKey.mockReturnValueOnce(verifyResult.promise);
    const workspace = new HomeWorkspace(capabilities);
    workspace.start();
    await settlePromises();

    void workspace.runRecovery();
    void workspace.runRecovery();
    expect(capabilities.verifyMiniMaxKey).toHaveBeenCalledOnce();
    expect(workspace.getSnapshot()).toMatchObject({
      pending: { setup: true },
      feedback: "正在验证连接"
    });

    verifyResult.resolve({ ok: true, settings: SETTINGS });
    await settlePromises();
    expect(workspace.getSnapshot()).toMatchObject({
      pending: { setup: false },
      feedback: "连接验证成功",
      canPlay: true
    });
  });

  it("preserves cached Voice refresh and playback result feedback while coalescing duplicate intents", async () => {
    const refreshResult = deferred<MiniMaxSetupResult>();
    const playbackResult = deferred<PlaybackStartResult>();
    const capabilities = createCapabilities({ ...SETTINGS, voices: [] });
    capabilities.refreshVoices.mockReturnValueOnce(refreshResult.promise);
    capabilities.playReadingTarget.mockReturnValueOnce(playbackResult.promise);
    const workspace = new HomeWorkspace(capabilities);
    workspace.start();
    await settlePromises();

    void workspace.runRecovery();
    void workspace.runRecovery();
    expect(capabilities.refreshVoices).toHaveBeenCalledOnce();
    refreshResult.resolve({
      ok: false,
      settings: SETTINGS,
      error: "network unavailable",
      usedCachedVoices: true
    });
    await settlePromises();
    expect(workspace.getSnapshot()).toMatchObject({
      feedback: "刷新失败，继续使用本地 Voice 缓存：network unavailable",
      canPlay: true
    });

    void workspace.playReadingTarget();
    void workspace.playReadingTarget();
    expect(capabilities.playReadingTarget).toHaveBeenCalledOnce();
    playbackResult.resolve({ started: true, sessionId: 9, stopShortcutAvailable: false });
    await settlePromises();
    expect(workspace.getSnapshot()).toMatchObject({
      pending: { playback: false },
      feedback: "已开始朗读；Esc 不可用，请从菜单栏停止"
    });
  });

  it("preserves newer and unrelated command feedback when a Voice write completes", async () => {
    const voiceWrite = deferred<AppSettings>();
    const playbackResult = deferred<PlaybackStartResult>();
    const capabilities = createCapabilities();
    capabilities.setPreferredVoice.mockReturnValueOnce(voiceWrite.promise);
    capabilities.playReadingTarget.mockReturnValueOnce(playbackResult.promise);
    const workspace = new HomeWorkspace(capabilities);
    workspace.start();
    await settlePromises();

    workspace.selectPreferredVoice("voice-zh-alt");
    void workspace.playReadingTarget();
    playbackResult.resolve({ started: true, sessionId: 2 });
    await settlePromises();
    expect(workspace.getSnapshot().feedback).toBe("已开始朗读");

    voiceWrite.resolve(withPreferredVoice("voice-zh-alt"));
    await settlePromises();
    expect(workspace.getSnapshot()).toMatchObject({
      selectedVoice: { voice_id: "voice-zh-alt" },
      feedback: "已开始朗读",
      pending: { preferredVoice: false, playback: false }
    });

    workspace.selectPreferredVoice("voice-zh-last");
    await settlePromises();
    expect(workspace.getSnapshot().feedback).toBe("已开始朗读");
  });

  it("lets an in-flight playback publish its result after a successful Voice intent", async () => {
    const playbackResult = deferred<PlaybackStartResult>();
    const capabilities = createCapabilities();
    capabilities.playReadingTarget.mockReturnValueOnce(playbackResult.promise);
    const workspace = new HomeWorkspace(capabilities);
    workspace.start();
    await settlePromises();

    void workspace.playReadingTarget();
    workspace.selectPreferredVoice("voice-zh-alt");
    await settlePromises();
    expect(workspace.getSnapshot().feedback).toBe("正在读取选区");

    playbackResult.resolve({ started: true, sessionId: 3 });
    await settlePromises();
    expect(workspace.getSnapshot()).toMatchObject({
      feedback: "已开始朗读",
      pending: { preferredVoice: false, playback: false }
    });
  });

  it("accepts verified Settings before a credential presence refresh fails", async () => {
    const initialSettings = { ...SETTINGS, apiKeyStatus: "failed" as const };
    const verifiedSettings = {
      ...SETTINGS,
      preferredVoicesByLanguage: { zh: "voice-zh-alt" }
    };
    const capabilities = createCapabilities(initialSettings);
    capabilities.verifyMiniMaxKey.mockResolvedValueOnce({ ok: true, settings: verifiedSettings });
    capabilities.hasMiniMaxApiKey
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error("credential lookup unavailable"));
    const workspace = new HomeWorkspace(capabilities);
    workspace.start();
    await settlePromises();

    await workspace.runRecovery();

    expect(workspace.getSnapshot()).toMatchObject({
      setup: {
        status: "ready",
        value: {
          settings: {
            apiKeyStatus: "verified",
            preferredVoicesByLanguage: { zh: "voice-zh-alt" }
          }
        }
      },
      selectedVoice: { voice_id: "voice-zh-alt" },
      feedback: "处理失败，请前往设置重试",
      pending: { setup: false }
    });
  });

  it("preserves a newer Voice write when credential presence refresh completes", async () => {
    const verifyResult = deferred<MiniMaxSetupResult>();
    const credentialPresence = deferred<boolean>();
    const initialSettings = { ...SETTINGS, apiKeyStatus: "failed" as const };
    const capabilities = createCapabilities(initialSettings);
    capabilities.verifyMiniMaxKey.mockReturnValueOnce(verifyResult.promise);
    capabilities.hasMiniMaxApiKey
      .mockResolvedValueOnce(true)
      .mockReturnValueOnce(credentialPresence.promise);
    const workspace = new HomeWorkspace(capabilities);
    workspace.start();
    await settlePromises();

    const recovery = workspace.runRecovery();
    verifyResult.resolve({ ok: true, settings: SETTINGS });
    await settlePromises();
    workspace.selectPreferredVoice("voice-zh-alt");
    await settlePromises();
    expect(workspace.getSnapshot().selectedVoice?.voice_id).toBe("voice-zh-alt");

    credentialPresence.resolve(true);
    await recovery;
    expect(workspace.getSnapshot()).toMatchObject({
      setup: {
        status: "ready",
        value: {
          settings: { preferredVoicesByLanguage: { zh: "voice-zh-alt" } },
          hasMiniMaxApiKey: true
        }
      },
      selectedVoice: { voice_id: "voice-zh-alt" },
      feedback: "连接验证成功"
    });
  });
});

const SETTINGS: AppSettings = {
  hasCompletedOnboarding: true,
  lastRoute: "home",
  launchAtLogin: false,
  activationShortcut: "Command+J",
  speechRate: 1,
  model: "speech-2.8-turbo",
  historyRetention: "1m",
  apiKeyStatus: "verified",
  voices: [
    { voice_id: "voice-zh", display_name: "中文 Voice", language: "zh" },
    { voice_id: "voice-zh-alt", display_name: "中文 Voice 2", language: "zh" },
    { voice_id: "voice-zh-last", display_name: "中文 Voice 3", language: "zh" },
    { voice_id: "voice-en", display_name: "English Voice", language: "en" }
  ],
  preferredVoicesByLanguage: { zh: "voice-zh" }
};

function createCapabilities(
  settings: AppSettings = SETTINGS,
  hasMiniMaxApiKey = true
): HomeWorkspaceCapabilities & {
  getSettings: ReturnType<typeof vi.fn<() => Promise<AppSettings>>>;
  hasMiniMaxApiKey: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  setPreferredVoice: ReturnType<
    typeof vi.fn<(language: string, voiceId: string) => Promise<AppSettings>>
  >;
  verifyMiniMaxKey: ReturnType<typeof vi.fn<() => Promise<MiniMaxSetupResult>>>;
  refreshVoices: ReturnType<typeof vi.fn<() => Promise<MiniMaxSetupResult>>>;
  playReadingTarget: ReturnType<typeof vi.fn<() => Promise<PlaybackStartResult>>>;
} {
  return {
    getSettings: vi.fn(async () => settings),
    hasMiniMaxApiKey: vi.fn(async () => hasMiniMaxApiKey),
    setPreferredVoice: vi.fn(async (_language, voiceId) => withPreferredVoice(voiceId)),
    verifyMiniMaxKey: vi.fn(async () => ({ ok: true, settings })),
    refreshVoices: vi.fn(async () => ({ ok: true, settings })),
    playReadingTarget: vi.fn(async () => ({ started: true, sessionId: 1 }))
  };
}

function withPreferredVoice(voiceId: string): AppSettings {
  return { ...SETTINGS, preferredVoicesByLanguage: { ...SETTINGS.preferredVoicesByLanguage, zh: voiceId } };
}

function deferred<T>(): {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function settlePromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
