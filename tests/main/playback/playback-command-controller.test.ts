import { describe, expect, it, vi } from "vitest";

import {
  normalizeShortcutInput,
  PlaybackCommandController,
  type PlaybackSessionPort,
  type PlaybackShortcutRegistry
} from "../../../src/main/playback/playback-command-controller.js";
import {
  DEFAULT_ACTIVATION_SHORTCUT,
  PLAYBACK_AUDIO_OUTCOMES,
  type PlaybackStartResult
} from "../../../src/shared/app-contracts.js";
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
    const result = await commands.startReadingTargetPlayback("menu_bar");

    expect(result.started).toBe(true);
    expect(shortcuts.handlers.has("Escape")).toBe(true);
    playback.acceptAudioOutcomes = false;
    commands.handleAudioOutcome({
      sessionId: result.sessionId ?? 0,
      status: PLAYBACK_AUDIO_OUTCOMES.completed
    });
    expect(shortcuts.handlers.has("Escape")).toBe(true);
    playback.acceptAudioOutcomes = true;
    commands.handleAudioOutcome({
      sessionId: result.sessionId ?? 0,
      status: PLAYBACK_AUDIO_OUTCOMES.completed
    });
    expect(playback.events.at(-1)).toEqual([
      "audio-outcome",
      result.sessionId,
      PLAYBACK_AUDIO_OUTCOMES.completed
    ]);
    expect(shortcuts.handlers.has("Escape")).toBe(false);

    const failed = await commands.startReadingTargetPlayback("menu_bar");
    expect(shortcuts.handlers.has("Escape")).toBe(true);
    playback.emitTerminal(failed.sessionId ?? 0);
    expect(shortcuts.handlers.has("Escape")).toBe(false);

    const stopped = await commands.startReadingTargetPlayback("menu_bar");
    commands.stopPlayback();
    expect(playback.events.at(-1)).toEqual(["stop", stopped.sessionId]);
    expect(shortcuts.handlers.has("Escape")).toBe(false);
  });

  it("routes the Activation Shortcut through acquisition and coalesces duplicate pending starts", async () => {
    const store = createCommandStore();
    const playback = createPlaybackPort();
    const shortcuts = createShortcutRegistry();
    const triggers: string[] = [];
    let resolveInput: ((input: ReadingTargetInput) => void) | undefined;
    const commands = new PlaybackCommandController(store, playback.port, shortcuts, (trigger) => {
      triggers.push(trigger);
      return new Promise((resolve) => {
        resolveInput = resolve;
      });
    });

    commands.registerActivationShortcut();
    shortcuts.handlers.get(DEFAULT_ACTIVATION_SHORTCUT)?.();
    shortcuts.handlers.get(DEFAULT_ACTIVATION_SHORTCUT)?.();
    expect(triggers).toEqual(["activation_shortcut"]);

    resolveInput?.(selectedTextTargetInput("并发快捷键播放。"));
    await vi.waitFor(() => {
      expect(playback.events.filter((event) => event[0] === "play-reading-target")).toHaveLength(1);
    });
  });

  it("lets the first trigger own a cross-entry acquisition single-flight", async () => {
    const store = createCommandStore();
    const playback = createPlaybackPort();
    const shortcuts = createShortcutRegistry();
    const triggers: string[] = [];
    let resolveInput: ((input: ReadingTargetInput) => void) | undefined;
    const commands = new PlaybackCommandController(store, playback.port, shortcuts, (trigger) => {
      triggers.push(trigger);
      return new Promise((resolve) => {
        resolveInput = resolve;
      });
    });

    const readerStart = commands.startReadingTargetPlayback("reader_window");
    const menuStart = commands.startReadingTargetPlayback("menu_bar");
    expect(triggers).toEqual(["reader_window"]);
    resolveInput?.(selectedTextTargetInput("跨入口并发播放。"));

    await expect(readerStart).resolves.toMatchObject({ started: true });
    await expect(menuStart).resolves.toMatchObject({ started: true });
    expect(playback.events.filter((event) => event[0] === "play-reading-target")).toHaveLength(1);
  });

  it("reports an unavailable Stop Shortcut while preserving the explicit stop fallback", async () => {
    const store = createCommandStore();
    const playback = createPlaybackPort();
    const shortcuts = createShortcutRegistry();
    shortcuts.failures.add("Escape");
    const commands = new PlaybackCommandController(
      store,
      playback.port,
      shortcuts,
      async () => selectedTextTargetInput("停止快捷键不可用。")
    );

    const result = await commands.startReadingTargetPlayback("menu_bar");

    expect(result).toMatchObject({ started: true, stopShortcutAvailable: false });
    expect(shortcuts.handlers.has("Escape")).toBe(false);
    commands.stopPlayback();
    expect(playback.events.at(-1)).toEqual(["stop", result.sessionId]);
  });

  it("does not register the Stop Shortcut when a session terminates before start returns", async () => {
    const store = createCommandStore();
    const playback = createPlaybackPort();
    const shortcuts = createShortcutRegistry();
    playback.terminateBeforeStartReturns = true;
    const commands = new PlaybackCommandController(
      store,
      playback.port,
      shortcuts,
      async () => selectedTextTargetInput("同步终态。")
    );

    const result = await commands.startReadingTargetPlayback("menu_bar");

    expect(result).toMatchObject({ started: true, stopShortcutAvailable: false });
    expect(shortcuts.handlers.has("Escape")).toBe(false);
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
  | ["audio-outcome", number, "completed" | "failed"];

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

interface PlaybackPortHarness {
  port: PlaybackSessionPort;
  events: PlaybackPortEvent[];
  acceptAudioOutcomes: boolean;
  emitTerminal: (sessionId: number) => void;
  terminateBeforeStartReturns: boolean;
}

function createPlaybackPort(): PlaybackPortHarness {
  let nextSessionId = 0;
  const terminalListeners = new Set<(sessionId: number) => void>();
  const events: PlaybackPortEvent[] = [];
  const startResult = (): PlaybackStartResult => {
    const resultValue = { started: true as const, sessionId: ++nextSessionId };
    if (result.terminateBeforeStartReturns) result.emitTerminal(resultValue.sessionId);
    return resultValue;
  };
  const result: PlaybackPortHarness = {
    events,
    acceptAudioOutcomes: true,
    terminateBeforeStartReturns: false,
    emitTerminal: (sessionId) => {
      for (const listener of terminalListeners) listener(sessionId);
    },
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
      handleAudioOutcome: (outcome) => {
        events.push(["audio-outcome", outcome.sessionId, outcome.status]);
        if (result.acceptAudioOutcomes) result.emitTerminal(outcome.sessionId);
        return result.acceptAudioOutcomes;
      },
      onSessionTerminal: (listener) => {
        terminalListeners.add(listener);
        return () => terminalListeners.delete(listener);
      }
    }
  };
  return result;
}

function selectedTextTargetInput(text: string): ReadingTargetInput {
  return { text, source: "selected_text" };
}
