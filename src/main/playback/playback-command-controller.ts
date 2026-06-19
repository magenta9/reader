import type { AppDataStore } from "../data/app-data-store.js";
import type { PlaybackService } from "./playback-service.js";
import type { PlaybackStartResult, ShortcutUpdateResult } from "../../shared/app-contracts.js";

export interface PlaybackShortcutRegistry {
  register(shortcut: string, callback: () => void): boolean;
  unregister(shortcut: string): void;
}

const SHORTCUT_REGISTRATION_ERROR = "快捷键注册失败，可能已被其他应用占用。";

export class PlaybackCommandController {
  private stopShortcutSessionId: number | undefined;

  constructor(
    private readonly store: AppDataStore,
    private readonly playback: PlaybackService,
    private readonly shortcuts: PlaybackShortcutRegistry,
    private readonly readClipboardText: () => Promise<string>
  ) {}

  async startClipboardPlayback(): Promise<PlaybackStartResult> {
    const result = await this.playback.playClipboardText(await this.readClipboardText());
    this.registerStopShortcutIfStarted(result);
    return result;
  }

  async startHistoryReplay(recordId: string): Promise<PlaybackStartResult> {
    const result = await this.playback.playHistoryRecord(recordId);
    this.registerStopShortcutIfStarted(result);
    return result;
  }

  stopPlayback(): void {
    this.playback.stopSession(this.stopShortcutSessionId);
    this.unregisterStopShortcut();
  }

  handleRendererIdle(sessionId: number): void {
    this.playback.handleRendererIdle(sessionId);
    if (this.stopShortcutSessionId === sessionId) this.unregisterStopShortcut();
  }

  registerActivationShortcut(): void {
    const shortcut = this.store.getSettings().activationShortcut;
    this.shortcuts.unregister(shortcut);
    const registered = this.shortcuts.register(shortcut, this.startClipboardPlaybackFromShortcut);
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
    const registered = this.shortcuts.register(nextShortcut, this.startClipboardPlaybackFromShortcut);

    if (!registered) {
      this.shortcuts.register(previousShortcut, this.startClipboardPlaybackFromShortcut);
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

  private registerStopShortcutIfStarted(result: PlaybackStartResult): void {
    if (result.started) this.registerStopShortcut(result.sessionId);
  }

  private readonly startClipboardPlaybackFromShortcut = (): void => {
    void this.startClipboardPlayback();
  };

  private registerStopShortcut(sessionId: number | undefined): void {
    this.stopShortcutSessionId = sessionId;
    this.shortcuts.unregister("Escape");
    this.shortcuts.register("Escape", this.stopPlaybackFromShortcut);
  }

  private unregisterStopShortcut(): void {
    this.stopShortcutSessionId = undefined;
    this.shortcuts.unregister("Escape");
  }

  private readonly stopPlaybackFromShortcut = (): void => {
    this.stopPlayback();
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
