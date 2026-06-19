import type { PlaybackCommandDataStore } from "../data/app-data-store.js";
import type { PlaybackSessionLifecycle } from "./playback-session-lifecycle.js";
import type { PlaybackStartResult, ShortcutUpdateResult } from "../../shared/app-contracts.js";
import type { ReadingTargetInput } from "../../shared/types.js";

export interface PlaybackShortcutRegistry {
  register(shortcut: string, callback: () => void): boolean;
  unregister(shortcut: string): void;
}

const SHORTCUT_REGISTRATION_ERROR = "快捷键注册失败，可能已被其他应用占用。";

export class PlaybackCommandController {
  constructor(
    private readonly store: PlaybackCommandDataStore,
    private readonly lifecycle: PlaybackSessionLifecycle,
    private readonly shortcuts: PlaybackShortcutRegistry,
    private readonly readReadingTargetInput: () => Promise<ReadingTargetInput>
  ) {}

  async startReadingTargetPlayback(): Promise<PlaybackStartResult> {
    return this.lifecycle.startReadingTargetPlayback(await this.readReadingTargetInput());
  }

  async startHistoryReplay(recordId: string): Promise<PlaybackStartResult> {
    return this.lifecycle.startHistoryReplay(recordId);
  }

  stopPlayback(): void {
    this.lifecycle.stopPlayback();
  }

  handleRendererIdle(sessionId: number): void {
    this.lifecycle.handleRendererIdle(sessionId);
  }

  registerActivationShortcut(): void {
    const shortcut = this.store.getSettings().activationShortcut;
    this.shortcuts.unregister(shortcut);
    const registered = this.shortcuts.register(shortcut, this.startReadingTargetPlaybackFromShortcut);
    this.store.updateSettings({
      shortcutRegistrationError: registered ? undefined : SHORTCUT_REGISTRATION_ERROR
    });
  }

  setActivationShortcut(shortcut: string): ShortcutUpdateResult {
    const nextShortcut = normalizeShortcutInput(shortcut);
    if (!nextShortcut) {
      const settings = this.store.updateSettings({
        shortcutRegistrationError: "快捷键需要包含 Command、Option、Control 或 Shift，并搭配一个按键。"
      });
      return { ok: false, settings, error: settings.shortcutRegistrationError };
    }

    const previousShortcut = this.store.getSettings().activationShortcut;
    this.shortcuts.unregister(previousShortcut);
    const registered = this.shortcuts.register(nextShortcut, this.startReadingTargetPlaybackFromShortcut);

    if (!registered) {
      this.shortcuts.register(previousShortcut, this.startReadingTargetPlaybackFromShortcut);
      const settings = this.store.updateSettings({
        shortcutRegistrationError: SHORTCUT_REGISTRATION_ERROR
      });
      return { ok: false, settings, error: settings.shortcutRegistrationError };
    }

    const settings = this.store.updateSettings({
      activationShortcut: nextShortcut,
      shortcutRegistrationError: undefined
    });
    return { ok: true, settings };
  }

  private readonly startReadingTargetPlaybackFromShortcut = (): void => {
    void this.startReadingTargetPlayback();
  };
}

export function normalizeShortcutInput(shortcut: string): string | undefined {
  const parts = shortcut
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return undefined;
  const key = parts.at(-1);
  const modifiers = parts.slice(0, -1);
  if (!key || !modifiers.some((part) => ["Command", "CommandOrControl", "Control", "Option", "Alt", "Shift"].includes(part))) {
    return undefined;
  }
  return [...new Set(modifiers), key].join("+");
}
