import { describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../../src/renderer/bridge.js";
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
} {
  return {
    getSettings: vi.fn(async () => settings),
    hasMiniMaxApiKey: vi.fn(async () => hasMiniMaxApiKey)
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function settlePromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
