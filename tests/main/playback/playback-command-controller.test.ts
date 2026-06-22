import { describe, expect, it, vi } from "vitest";

import {
  normalizeShortcutInput,
  PlaybackCommandController,
  type PlaybackSessionPort,
  type PlaybackShortcutRegistry
} from "../../../src/main/playback/playback-command-controller.js";
import { DEFAULT_ACTIVATION_SHORTCUT, type PlaybackStartResult } from "../../../src/shared/app-contracts.js";
import type { AppSettings, ShortcutUpdateResult } from "../../../src/shared/app-contracts.js";
import type { ReadingTargetInput } from "../../../src/shared/types.js";

describe("PlaybackCommandController", () => {
  it("registers and cleans up the Stop Shortcut around active Playback Sessions", async () => {
    const store = createCommandStore();
    const playback = createPlaybackPort();
    const shortcuts = createShortcutRegistry();
    const commands = new PlaybackCommandController(
      store,
      playback.port,
      shortcuts,
      async () => selectedTextTargetInput("命令播放文本。")
    );

    commands.registerActivationShortcut();
    expect(shortcuts.handlers.has(DEFAULT_ACTIVATION_SHORTCUT)).toBe(true);
    const result = await commands.startReadingTargetPlayback();

    expect(result.started).toBe(true);
    expect(shortcuts.handlers.has("Escape")).toBe(true);
    commands.handleRendererIdle(result.sessionId ?? 0);
    expect(shortcuts.handlers.has("Escape")).toBe(false);

    const stopped = await commands.startReadingTargetPlayback();
    commands.stopPlayback();
    expect(playback.events.at(-1)).toEqual(["stop", stopped.sessionId]);
    expect(shortcuts.handlers.has("Escape")).toBe(false);
  });

  it("starts playback from the Activation Shortcut and coalesces duplicate pending starts", async () => {
    vi.useFakeTimers();
    try {
      const store = createCommandStore();
      const playback = createPlaybackPort();
      const shortcuts = createShortcutRegistry();
      let readCount = 0;
      let resolveInput: ((input: ReadingTargetInput) => void) | undefined;
      const commands = new PlaybackCommandController(store, playback.port, shortcuts, () => {
        readCount += 1;
        return new Promise((resolve) => {
          resolveInput = resolve;
        });
      });

      commands.registerActivationShortcut();
      shortcuts.handlers.get(DEFAULT_ACTIVATION_SHORTCUT)?.();
      shortcuts.handlers.get(DEFAULT_ACTIVATION_SHORTCUT)?.();
      await vi.advanceTimersByTimeAsync(350);
      expect(readCount).toBe(1);

      const first = commands.startReadingTargetPlayback();
      const second = commands.startReadingTargetPlayback();
      expect(readCount).toBe(1);
      resolveInput?.(selectedTextTargetInput("并发快捷键播放。"));

      await expect(first).resolves.toMatchObject({ started: true });
      await expect(second).resolves.toMatchObject({ started: true });
      expect(readCount).toBe(1);
      expect(playback.events.filter((event) => event[0] === "play-reading-target")).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("normalizes Activation Shortcut updates and preserves the previous shortcut on registration failure", () => {
    const store = createCommandStore();
    const playback = createPlaybackPort();
    const shortcuts = createShortcutRegistry();
    const commands = new PlaybackCommandController(
      store,
      playback.port,
      shortcuts,
      async () => selectedTextTargetInput("命令播放文本。")
    );

    expect(normalizeShortcutInput(" Command + Shift + R ")).toBe("Command+Shift+R");
    expect(normalizeShortcutInput("R")).toBeUndefined();

    shortcuts.failures.add("Control+Shift+R");
    const failed = commands.setActivationShortcut("Control+Shift+R");
    expect(failed.ok).toBe(false);
    expect(store.getSettings().activationShortcut).toBe(DEFAULT_ACTIVATION_SHORTCUT);

    shortcuts.failures.clear();
    const updated = commands.setActivationShortcut("Control+Shift+R");
    expect(updated.ok).toBe(true);
    expect(store.getSettings().activationShortcut).toBe("Control+Shift+R");
  });

  it("routes History and Favorite replay commands through the playback port", async () => {
    const store = createCommandStore();
    const playback = createPlaybackPort();
    const shortcuts = createShortcutRegistry();
    const commands = new PlaybackCommandController(
      store,
      playback.port,
      shortcuts,
      async () => selectedTextTargetInput("unused")
    );

    const history = await commands.startHistoryReplay("history-id");
    const favorite = await commands.startFavoriteReplay("favorite-id");

    expect(history.started).toBe(true);
    expect(favorite.started).toBe(true);
    expect(playback.events).toEqual([
      ["play-history", "history-id"],
      ["play-favorite", "favorite-id"]
    ]);
    expect(shortcuts.handlers.has("Escape")).toBe(true);
  });
});

interface CommandStore {
  getSettings(): AppSettings;
  updateSettings(patch: Partial<AppSettings>): AppSettings;
}

interface ShortcutRegistryForTest extends PlaybackShortcutRegistry {
  failures: Set<string>;
  handlers: Map<string, () => void>;
}

type PlaybackPortEvent =
  | ["play-reading-target", ReadingTargetInput]
  | ["play-history", string]
  | ["play-favorite", string]
  | ["stop", number | undefined]
  | ["renderer-idle", number];

function createCommandStore(): CommandStore {
  let settings: AppSettings = {
    hasCompletedOnboarding: false,
    lastRoute: "home",
    launchAtLogin: false,
    activationShortcut: DEFAULT_ACTIVATION_SHORTCUT,
    speechRate: 1,
    model: "speech-2.8-turbo",
    historyRetention: "1m",
    apiKeyStatus: "missing",
    voices: [],
    preferredVoicesByLanguage: {}
  };
  return {
    getSettings: () => settings,
    updateSettings: (patch) => {
      settings = { ...settings, ...patch };
      return settings;
    }
  };
}

function createShortcutRegistry(): ShortcutRegistryForTest {
  const handlers = new Map<string, () => void>();
  const failures = new Set<string>();
  return {
    handlers,
    failures,
    register: (shortcut, callback) => {
      if (failures.has(shortcut)) return false;
      handlers.set(shortcut, callback);
      return true;
    },
    unregister: (shortcut) => {
      handlers.delete(shortcut);
    }
  };
}

function createPlaybackPort(): { port: PlaybackSessionPort; events: PlaybackPortEvent[] } {
  let nextSessionId = 0;
  const events: PlaybackPortEvent[] = [];
  const startResult = (): PlaybackStartResult => ({ started: true, sessionId: ++nextSessionId });
  return {
    events,
    port: {
      playReadingTarget: async (input) => {
        events.push(["play-reading-target", input]);
        return startResult();
      },
      playHistoryRecord: async (recordId) => {
        events.push(["play-history", recordId]);
        return startResult();
      },
      playFavoriteRecord: async (recordId) => {
        events.push(["play-favorite", recordId]);
        return startResult();
      },
      stopSession: (sessionId) => {
        events.push(["stop", sessionId]);
      },
      handleRendererIdle: (sessionId) => {
        events.push(["renderer-idle", sessionId]);
      }
    }
  };
}

function selectedTextTargetInput(text: string): ReadingTargetInput {
  return { text, source: "selected_text" };
}
