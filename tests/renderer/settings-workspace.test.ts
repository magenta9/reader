import { describe, expect, it, vi } from "vitest";
import type { AppSettings } from "../../src/renderer/bridge.js";
import {
  SettingsWorkspace,
  type SettingsWorkspaceCapabilities
} from "../../src/renderer/settings-workspace.js";

describe("SettingsWorkspace", () => {
  it("keeps core settings usable when an auxiliary resource fails", async () => {
    const capabilities = createCapabilities();
    capabilities.getErrorLogCount.mockRejectedValueOnce(new Error("log unavailable"));
    const workspace = new SettingsWorkspace(capabilities);

    workspace.start();
    await settlePromises();

    expect(workspace.getSnapshot()).toMatchObject({
      settings: { status: "ready", value: SETTINGS },
      canWrite: true,
      miniMaxCredential: { status: "ready", value: true },
      errorLogCount: { status: "error", message: "log unavailable" },
      readingHistoryCount: { status: "ready", value: 7 }
    });
  });

  it("blocks writes after a core failure and recovers through core retry", async () => {
    const capabilities = createCapabilities();
    capabilities.getSettings.mockRejectedValueOnce(new Error("settings unavailable"));
    const workspace = new SettingsWorkspace(capabilities);

    workspace.start();
    await settlePromises();

    expect(workspace.getSnapshot()).toMatchObject({
      settings: { status: "error", message: "settings unavailable" },
      canWrite: false,
      miniMaxCredential: { status: "ready", value: true }
    });

    workspace.retrySettings();
    expect(workspace.getSnapshot()).toMatchObject({ settings: { status: "loading" }, canWrite: false });
    await settlePromises();

    expect(capabilities.getSettings).toHaveBeenCalledTimes(2);
    expect(workspace.getSnapshot()).toMatchObject({ settings: { status: "ready", value: SETTINGS }, canWrite: true });
  });

  it("retries one auxiliary resource without resetting successful resources", async () => {
    const capabilities = createCapabilities();
    capabilities.getReadingHistoryCount.mockRejectedValueOnce(new Error("history unavailable"));
    const workspace = new SettingsWorkspace(capabilities);

    workspace.start();
    await settlePromises();
    workspace.retryReadingHistoryCount();

    expect(workspace.getSnapshot()).toMatchObject({
      settings: { status: "ready", value: SETTINGS },
      miniMaxCredential: { status: "ready", value: true },
      errorLogCount: { status: "ready", value: 3 },
      readingHistoryCount: { status: "loading" }
    });

    await settlePromises();
    expect(capabilities.getReadingHistoryCount).toHaveBeenCalledTimes(2);
    expect(workspace.getSnapshot()).toMatchObject({
      settings: { status: "ready", value: SETTINGS },
      errorLogCount: { status: "ready", value: 3 },
      readingHistoryCount: { status: "ready", value: 7 }
    });
  });

  it("clears visit state and ignores late reads after disposal", async () => {
    const lateSettings = deferred<AppSettings>();
    const capabilities = createCapabilities();
    capabilities.getSettings.mockReturnValueOnce(lateSettings.promise);
    const workspace = new SettingsWorkspace(capabilities);
    const listener = vi.fn();
    workspace.subscribe(listener);

    workspace.start();
    workspace.updateApiKeyDraft("secret");
    workspace.updateCustomModelDraft("custom-model");
    workspace.beginShortcutRecording();
    await workspace.clearReadingHistory();
    expect(capabilities.clearReadingHistory).not.toHaveBeenCalled();
    workspace.requestClearHistoryConfirmation();
    workspace.cancelShortcutRecording();
    workspace.beginShortcutRecording();
    workspace.dispose();
    const notificationCountAfterDispose = listener.mock.calls.length;

    expect(workspace.getSnapshot()).toMatchObject({
      disposed: true,
      visit: {
        apiKeyDraft: "",
        customModelDraft: "",
        isRecordingShortcut: false,
        confirmClearHistory: false,
        feedback: {}
      }
    });

    lateSettings.resolve(SETTINGS);
    await settlePromises();

    expect(listener).toHaveBeenCalledTimes(notificationCountAfterDispose);
    expect(workspace.getSnapshot()).toMatchObject({ settings: { status: "loading" }, disposed: true });
  });

  it("copies and deeply freezes the authoritative settings snapshot", async () => {
    const capabilities = createCapabilities();
    const workspace = new SettingsWorkspace(capabilities);

    workspace.start();
    await settlePromises();

    const settings = workspace.getSnapshot().settings;
    expect(settings.status).toBe("ready");
    if (settings.status !== "ready") throw new Error("expected settings to be ready");
    expect(settings.value).not.toBe(SETTINGS);
    expect(Object.isFrozen(settings.value)).toBe(true);
    expect(Object.isFrozen(settings.value.voices)).toBe(true);
    expect(Object.isFrozen(settings.value.preferredVoicesByLanguage)).toBe(true);
    expect(() => {
      (settings.value as AppSettings).speechRate = 2;
    }).toThrow(TypeError);
    expect(SETTINGS.speechRate).toBe(1);
  });

  it("presents the latest speech rate while coalescing writes into one in-flight request", async () => {
    const firstWrite = deferred<AppSettings>();
    const secondWrite = deferred<AppSettings>();
    const capabilities = createCapabilities();
    capabilities.setSpeechRate
      .mockReturnValueOnce(firstWrite.promise)
      .mockReturnValueOnce(secondWrite.promise);
    const workspace = new SettingsWorkspace(capabilities);
    workspace.start();
    await settlePromises();

    workspace.updateSpeechRate(1.1);
    workspace.updateSpeechRate(1.2);
    workspace.updateSpeechRate(1.3);

    expect(workspace.getSnapshot().presentation.speechRate).toBe(1.3);
    expect(capabilities.setSpeechRate).toHaveBeenCalledTimes(1);
    expect(capabilities.setSpeechRate).toHaveBeenLastCalledWith(1.1);

    firstWrite.resolve({ ...SETTINGS, speechRate: 1.1 });
    await settlePromises();

    expect(capabilities.setSpeechRate).toHaveBeenCalledTimes(2);
    expect(capabilities.setSpeechRate).toHaveBeenLastCalledWith(1.3);
    expect(workspace.getSnapshot().presentation.speechRate).toBe(1.3);

    secondWrite.resolve({ ...SETTINGS, speechRate: 1.3 });
    await settlePromises();

    expect(workspace.getSnapshot()).toMatchObject({
      settings: { status: "ready", value: { speechRate: 1.3 } },
      presentation: { speechRate: 1.3 },
      pending: { speechRate: false }
    });
  });

  it("confirms discrete settings one control at a time and preserves values on failure", async () => {
    const launchWrite = deferred<AppSettings>();
    const capabilities = createCapabilities();
    capabilities.setLaunchAtLogin.mockReturnValueOnce(launchWrite.promise);
    capabilities.setModel.mockRejectedValueOnce(new Error("model unavailable"));
    const workspace = new SettingsWorkspace(capabilities);
    workspace.start();
    await settlePromises();

    const firstLaunch = workspace.setLaunchAtLogin(true);
    const ignoredLaunch = workspace.setLaunchAtLogin(false);

    expect(capabilities.setLaunchAtLogin).toHaveBeenCalledTimes(1);
    expect(workspace.getSnapshot()).toMatchObject({
      settings: { status: "ready", value: { launchAtLogin: false } },
      pending: { launchAtLogin: true }
    });

    launchWrite.resolve({ ...SETTINGS, launchAtLogin: true });
    await Promise.all([firstLaunch, ignoredLaunch]);

    expect(workspace.getSnapshot()).toMatchObject({
      settings: { status: "ready", value: { launchAtLogin: true } },
      pending: { launchAtLogin: false }
    });

    await workspace.setModel("speech-2.8-hd");
    expect(workspace.getSnapshot()).toMatchObject({
      settings: { status: "ready", value: { model: SETTINGS.model } },
      pending: { model: false },
      visit: { feedback: { model: "模型更新失败，请稍后重试。" } }
    });
  });

  it("keeps API key, custom model and shortcut writes validated and semantic", async () => {
    const capabilities = createCapabilities();
    capabilities.setActivationShortcut.mockResolvedValueOnce({
      ok: false,
      settings: { ...SETTINGS, shortcutRegistrationError: "快捷键已被占用" },
      error: "快捷键已被占用"
    });
    const workspace = new SettingsWorkspace(capabilities);
    workspace.start();
    await settlePromises();

    await workspace.saveApiKey();
    expect(capabilities.setMiniMaxApiKey).not.toHaveBeenCalled();

    workspace.updateApiKeyDraft(" local-secret ");
    await workspace.saveApiKey();
    expect(capabilities.setMiniMaxApiKey).toHaveBeenCalledWith(" local-secret ");
    expect(workspace.getSnapshot().visit).toMatchObject({
      apiKeyDraft: "",
      feedback: { setup: "API Key 已保存到本机 SQLite，等待验证" }
    });

    workspace.updateCustomModelDraft("  custom-model-v2  ");
    await workspace.saveCustomModel();
    expect(capabilities.setModel).toHaveBeenCalledWith("custom-model-v2");
    expect(workspace.getSnapshot()).toMatchObject({
      settings: { status: "ready", value: { model: "custom-model-v2" } }
    });

    await workspace.setActivationShortcut("Control+Shift+R");
    expect(workspace.getSnapshot()).toMatchObject({
      settings: {
        status: "ready",
        value: { shortcutRegistrationError: "快捷键已被占用" }
      },
      visit: { feedback: { shortcut: "快捷键已被占用" } }
    });

    workspace.beginShortcutRecording();
    expect(workspace.getSnapshot().visit.feedback.shortcut).toBe("请按新的开始朗读快捷键");
    workspace.rejectShortcutCandidate();
    expect(workspace.getSnapshot().visit.feedback.shortcut).toBe("请按下包含修饰键的组合键");
  });

  it("keeps retention and destructive maintenance as validated two-phase commands", async () => {
    const capabilities = createCapabilities();
    capabilities.previewReadingHistoryRetention.mockResolvedValueOnce({
      historyRetention: "7d",
      deleteCount: 1,
      remainingCount: 6
    });
    capabilities.applyReadingHistoryRetention
      .mockResolvedValueOnce({
        applied: false,
        impact: { historyRetention: "7d", deleteCount: 2, remainingCount: 5 },
        settings: SETTINGS
      })
      .mockResolvedValueOnce({
        applied: true,
        impact: { historyRetention: "7d", deleteCount: 2, remainingCount: 5 },
        settings: { ...SETTINGS, historyRetention: "7d" }
      });
    capabilities.clearReadingHistory.mockResolvedValueOnce(5);
    const workspace = new SettingsWorkspace(capabilities);
    workspace.start();
    await settlePromises();

    await workspace.requestRetentionChange("7d");
    expect(capabilities.applyReadingHistoryRetention).not.toHaveBeenCalled();
    expect(workspace.getSnapshot().visit.retentionImpact).toEqual({
      historyRetention: "7d",
      deleteCount: 1,
      remainingCount: 6
    });

    await workspace.confirmRetentionChange();
    expect(workspace.getSnapshot()).toMatchObject({
      readingHistoryCount: { status: "ready", value: 7 },
      visit: {
        retentionImpact: { deleteCount: 2, remainingCount: 5 },
        retentionPhase: "awaiting-confirmation",
        feedback: { historyAction: "历史记录数量已变化，请按最新数量再次确认。" }
      }
    });

    await workspace.confirmRetentionChange();
    expect(workspace.getSnapshot()).toMatchObject({
      settings: { status: "ready", value: { historyRetention: "7d" } },
      readingHistoryCount: { status: "ready", value: 5 },
      visit: { retentionDraft: "7d", confirmClearHistory: false }
    });
    expect(workspace.getSnapshot().visit.retentionImpact).toBeUndefined();

    workspace.requestClearHistoryConfirmation();
    await workspace.clearReadingHistory();
    expect(workspace.getSnapshot()).toMatchObject({
      readingHistoryCount: { status: "ready", value: 0 },
      visit: {
        confirmClearHistory: false,
        feedback: { historyAction: "已清空 5 条历史记录，收藏仍然保留。" }
      }
    });

    await workspace.clearErrorLog();
    expect(workspace.getSnapshot().errorLogCount).toEqual({ status: "ready", value: 0 });
  });

  it("restores failed continuous presentation and ignores command responses after disposal", async () => {
    const modelWrite = deferred<AppSettings>();
    const capabilities = createCapabilities();
    capabilities.setSpeechRate.mockRejectedValueOnce(new Error("rate unavailable"));
    capabilities.setModel.mockReturnValueOnce(modelWrite.promise);
    const workspace = new SettingsWorkspace(capabilities);
    workspace.start();
    await settlePromises();

    workspace.updateSpeechRate(1.8);
    await settlePromises();
    expect(workspace.getSnapshot()).toMatchObject({
      presentation: { speechRate: 1 },
      pending: { speechRate: false },
      visit: { feedback: { speechRate: "语速更新失败，请稍后重试。" } }
    });

    const pendingModel = workspace.setModel("late-model");
    workspace.dispose();
    modelWrite.resolve({ ...SETTINGS, model: "late-model" });
    await pendingModel;

    expect(workspace.getSnapshot()).toMatchObject({
      disposed: true,
      settings: { status: "ready", value: { model: SETTINGS.model } },
      pending: { model: false, speechRate: false },
      visit: { feedback: {} }
    });
  });

  it("does not let an account refresh replace a newer speech-rate presentation", async () => {
    const accountRefresh = deferred<AppSettings>();
    const speechWrite = deferred<AppSettings>();
    const capabilities = createCapabilities();
    capabilities.getSettings
      .mockResolvedValueOnce(SETTINGS)
      .mockReturnValueOnce(accountRefresh.promise);
    capabilities.setSpeechRate.mockReturnValueOnce(speechWrite.promise);
    const workspace = new SettingsWorkspace(capabilities);
    workspace.start();
    await settlePromises();

    workspace.updateSpeechRate(1.7);
    workspace.updateApiKeyDraft("secret");
    const save = workspace.saveApiKey();
    await settlePromises();
    accountRefresh.resolve(SETTINGS);
    await save;

    expect(workspace.getSnapshot().presentation.speechRate).toBe(1.7);

    speechWrite.resolve({ ...SETTINGS, speechRate: 1.7 });
    await settlePromises();
    expect(workspace.getSnapshot()).toMatchObject({
      settings: { status: "ready", value: { speechRate: 1.7 } },
      presentation: { speechRate: 1.7 }
    });
  });

  it("invalidates retention preview and apply responses when the user changes course", async () => {
    const preview = deferred<{ historyRetention: "7d"; deleteCount: number; remainingCount: number }>();
    const apply = deferred<{
      applied: boolean;
      impact: { historyRetention: "7d"; deleteCount: number; remainingCount: number };
      settings: AppSettings;
    }>();
    const capabilities = createCapabilities();
    capabilities.previewReadingHistoryRetention.mockReturnValueOnce(preview.promise);
    capabilities.applyReadingHistoryRetention.mockReturnValueOnce(apply.promise);
    const workspace = new SettingsWorkspace(capabilities);
    workspace.start();
    await settlePromises();

    const previewRequest = workspace.requestRetentionChange("7d");
    workspace.requestClearHistoryConfirmation();
    preview.resolve({ historyRetention: "7d", deleteCount: 1, remainingCount: 6 });
    await previewRequest;

    expect(workspace.getSnapshot().visit).toMatchObject({
      confirmClearHistory: true,
      retentionDraft: "1m"
    });
    expect(workspace.getSnapshot().visit.retentionImpact).toBeUndefined();

    const automaticApply = workspace.requestRetentionChange("7d");
    await settlePromises();
    const ignoredNewSelection = workspace.requestRetentionChange("3m");
    workspace.cancelRetentionChange();
    apply.resolve({
      applied: true,
      impact: { historyRetention: "7d", deleteCount: 0, remainingCount: 7 },
      settings: { ...SETTINGS, historyRetention: "7d" }
    });
    await Promise.all([automaticApply, ignoredNewSelection]);

    expect(workspace.getSnapshot()).toMatchObject({
      settings: { status: "ready", value: { historyRetention: "7d" } },
      pending: { retention: false },
      visit: { retentionDraft: "7d", retentionPhase: "idle" }
    });
  });

  it("reports account refresh failure without misreporting a successful key save", async () => {
    const capabilities = createCapabilities();
    capabilities.getSettings
      .mockResolvedValueOnce(SETTINGS)
      .mockRejectedValueOnce(new Error("refresh unavailable"));
    const workspace = new SettingsWorkspace(capabilities);
    workspace.start();
    await settlePromises();

    workspace.updateApiKeyDraft("saved-secret");
    await workspace.saveApiKey();

    expect(capabilities.setMiniMaxApiKey).toHaveBeenCalledWith("saved-secret");
    expect(workspace.getSnapshot().visit).toMatchObject({
      apiKeyDraft: "",
      feedback: { setup: "账户状态刷新失败，请稍后重试。" }
    });
  });

  it("keeps account refresh inside the account command lane", async () => {
    const refresh = deferred<AppSettings>();
    const capabilities = createCapabilities();
    capabilities.getSettings
      .mockResolvedValueOnce(SETTINGS)
      .mockReturnValueOnce(refresh.promise);
    const workspace = new SettingsWorkspace(capabilities);
    workspace.start();
    await settlePromises();

    workspace.updateApiKeyDraft("secret");
    const save = workspace.saveApiKey();
    await settlePromises();
    await workspace.clearApiKey();

    expect(capabilities.clearMiniMaxApiKey).not.toHaveBeenCalled();
    expect(workspace.getSnapshot().pending.account).toBe(true);

    refresh.resolve(SETTINGS);
    await save;
    await workspace.clearApiKey();

    expect(capabilities.clearMiniMaxApiKey).toHaveBeenCalledTimes(1);
    expect(workspace.getSnapshot().pending.account).toBe(false);
  });

  it("does not let stale count reads overwrite maintenance command results", async () => {
    const oldErrorLogCount = deferred<number>();
    const oldHistoryCount = deferred<number>();
    const capabilities = createCapabilities();
    capabilities.getErrorLogCount.mockReturnValueOnce(oldErrorLogCount.promise);
    capabilities.getReadingHistoryCount.mockReturnValueOnce(oldHistoryCount.promise);
    const workspace = new SettingsWorkspace(capabilities);
    workspace.start();
    await settlePromises();

    await workspace.clearErrorLog();
    workspace.requestClearHistoryConfirmation();
    await workspace.clearReadingHistory();
    oldErrorLogCount.resolve(9);
    oldHistoryCount.resolve(11);
    await settlePromises();

    expect(workspace.getSnapshot().errorLogCount).toEqual({ status: "ready", value: 0 });
    expect(workspace.getSnapshot().readingHistoryCount).toEqual({ status: "ready", value: 0 });
  });

  it("keeps a confirmed retention impact available after apply failure", async () => {
    const capabilities = createCapabilities();
    capabilities.previewReadingHistoryRetention.mockResolvedValueOnce({
      historyRetention: "7d",
      deleteCount: 2,
      remainingCount: 5
    });
    capabilities.applyReadingHistoryRetention.mockRejectedValueOnce(new Error("apply unavailable"));
    const workspace = new SettingsWorkspace(capabilities);
    workspace.start();
    await settlePromises();

    await workspace.requestRetentionChange("7d");
    await workspace.confirmRetentionChange();

    expect(workspace.getSnapshot().visit).toMatchObject({
      retentionDraft: "7d",
      retentionImpact: { historyRetention: "7d", deleteCount: 2 },
      retentionPhase: "awaiting-confirmation",
      feedback: { historyError: "保留期限更新失败，现有历史记录未变更。" }
    });
  });

  it("clears stale command feedback after a later success", async () => {
    const capabilities = createCapabilities();
    capabilities.setSpeechRate
      .mockRejectedValueOnce(new Error("rate unavailable"))
      .mockResolvedValueOnce({ ...SETTINGS, speechRate: 1.4 });
    capabilities.setModel
      .mockRejectedValueOnce(new Error("model unavailable"))
      .mockResolvedValueOnce({ ...SETTINGS, model: "speech-2.8-hd" });
    const workspace = new SettingsWorkspace(capabilities);
    workspace.start();
    await settlePromises();

    workspace.updateSpeechRate(1.2);
    await settlePromises();
    workspace.updateSpeechRate(1.4);
    await settlePromises();
    await workspace.setModel("failed-model");
    await workspace.setModel("speech-2.8-hd");

    expect(workspace.getSnapshot().visit.feedback.speechRate).toBeUndefined();
    expect(workspace.getSnapshot().visit.feedback.model).toBeUndefined();
  });
});

function createCapabilities() {
  return {
    getSettings: vi.fn<SettingsWorkspaceCapabilities["getSettings"]>(async () => SETTINGS),
    hasMiniMaxApiKey: vi.fn<SettingsWorkspaceCapabilities["hasMiniMaxApiKey"]>(async () => true),
    getErrorLogCount: vi.fn<SettingsWorkspaceCapabilities["getErrorLogCount"]>(async () => 3),
    getReadingHistoryCount: vi.fn<SettingsWorkspaceCapabilities["getReadingHistoryCount"]>(async () => 7),
    setSpeechRate: vi.fn<SettingsWorkspaceCapabilities["setSpeechRate"]>(async (speechRate) => ({
      ...SETTINGS,
      speechRate
    })),
    setLaunchAtLogin: vi.fn(async (launchAtLogin: boolean) => ({ ...SETTINGS, launchAtLogin })),
    setModel: vi.fn(async (model: string) => ({ ...SETTINGS, model })),
    setMiniMaxApiKey: vi.fn<SettingsWorkspaceCapabilities["setMiniMaxApiKey"]>(async () => undefined),
    clearMiniMaxApiKey: vi.fn<SettingsWorkspaceCapabilities["clearMiniMaxApiKey"]>(async () => undefined),
    verifyMiniMaxKey: vi.fn<SettingsWorkspaceCapabilities["verifyMiniMaxKey"]>(async () => ({
      ok: true,
      settings: SETTINGS
    })),
    refreshVoices: vi.fn<SettingsWorkspaceCapabilities["refreshVoices"]>(async () => ({
      ok: true,
      settings: SETTINGS
    })),
    setActivationShortcut: vi.fn<SettingsWorkspaceCapabilities["setActivationShortcut"]>(async (activationShortcut) => ({
      ok: true,
      settings: { ...SETTINGS, activationShortcut }
    })),
    clearErrorLog: vi.fn(async () => undefined),
    previewReadingHistoryRetention: vi.fn(async (historyRetention: "7d" | "1m" | "3m" | "forever") => ({
      historyRetention,
      deleteCount: 0,
      remainingCount: 7
    })),
    applyReadingHistoryRetention: vi.fn(async (historyRetention: "7d" | "1m" | "3m" | "forever") => ({
      applied: true,
      impact: { historyRetention, deleteCount: 0, remainingCount: 7 },
      settings: { ...SETTINGS, historyRetention }
    })),
    clearReadingHistory: vi.fn(async () => 7)
  };
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

async function settlePromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

const SETTINGS: AppSettings = {
  hasCompletedOnboarding: true,
  lastRoute: "settings",
  launchAtLogin: false,
  activationShortcut: "Control+Command+R",
  speechRate: 1,
  model: "speech-2.8-turbo",
  historyRetention: "1m",
  apiKeyStatus: "verified",
  voices: [],
  preferredVoicesByLanguage: {}
};
