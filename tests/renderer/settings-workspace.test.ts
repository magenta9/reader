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
    workspace.requestClearHistoryConfirmation();
    workspace.setFeedback("setup", "saved");
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
});

function createCapabilities() {
  return {
    getSettings: vi.fn<SettingsWorkspaceCapabilities["getSettings"]>(async () => SETTINGS),
    hasMiniMaxApiKey: vi.fn<SettingsWorkspaceCapabilities["hasMiniMaxApiKey"]>(async () => true),
    getErrorLogCount: vi.fn<SettingsWorkspaceCapabilities["getErrorLogCount"]>(async () => 3),
    getReadingHistoryCount: vi.fn<SettingsWorkspaceCapabilities["getReadingHistoryCount"]>(async () => 7)
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
