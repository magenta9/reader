import type { PlaybackCommandDataStore } from "../data/app-data-store.js";
import type {
  PlaybackAudioOutcome,
  PlaybackStartResult,
  ShortcutUpdateResult
} from "../../shared/app-contracts.js";
import type { ReadingTargetInput } from "../../shared/types.js";

export interface PlaybackShortcutRegistry {
  register(shortcut: string, callback: () => void): boolean;
  unregister(shortcut: string): void;
}

export interface PlaybackSessionPort {
  playReadingTarget(input: ReadingTargetInput): Promise<PlaybackStartResult>;
  playHistoryRecord(recordId: string): Promise<PlaybackStartResult>;
  playFavoriteRecord(recordId: string): Promise<PlaybackStartResult>;
  stopSession(sessionId: number | undefined): void;
  handleAudioOutcome(outcome: PlaybackAudioOutcome): boolean;
  handleRendererIdle(sessionId: number): void;
}

const SHORTCUT_REGISTRATION_ERROR = "快捷键注册失败，可能已被其他应用占用。";
const GLOBAL_SHORTCUT_SELECTION_CAPTURE_DELAY_MS = 350;
const STOP_SHORTCUT = "Escape";

export class PlaybackCommandController {
  private pendingReadingTargetPlayback: Promise<PlaybackStartResult> | undefined;
  private pendingShortcutPlaybackTimer: ReturnType<typeof setTimeout> | undefined;
  private stopShortcutSessionId: number | undefined;

  constructor(
    private readonly store: PlaybackCommandDataStore,
    private readonly playback: PlaybackSessionPort,
    private readonly shortcuts: PlaybackShortcutRegistry,
    private readonly readReadingTargetInput: () => Promise<ReadingTargetInput>
  ) {}

  async startReadingTargetPlayback(): Promise<PlaybackStartResult> {
    if (this.pendingReadingTargetPlayback) return this.pendingReadingTargetPlayback;
    this.pendingReadingTargetPlayback = this.startReadingTargetPlaybackOnce();
    try {
      return await this.pendingReadingTargetPlayback;
    } finally {
      this.pendingReadingTargetPlayback = undefined;
    }
  }

  async startHistoryReplay(recordId: string): Promise<PlaybackStartResult> {
    return this.startPlaybackSession(() => this.playback.playHistoryRecord(recordId));
  }

  async startFavoriteReplay(recordId: string): Promise<PlaybackStartResult> {
    return this.startPlaybackSession(() => this.playback.playFavoriteRecord(recordId));
  }

  stopPlayback(): void {
    this.playback.stopSession(this.stopShortcutSessionId);
    this.unregisterStopShortcut();
  }

  handleRendererIdle(sessionId: number): void {
    this.playback.handleRendererIdle(sessionId);
    if (this.stopShortcutSessionId === sessionId) this.unregisterStopShortcut();
  }

  handleAudioOutcome(outcome: PlaybackAudioOutcome): void {
    const accepted = this.playback.handleAudioOutcome(outcome);
    if (accepted && this.stopShortcutSessionId === outcome.sessionId) this.unregisterStopShortcut();
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
    if (this.pendingShortcutPlaybackTimer) return;
    this.pendingShortcutPlaybackTimer = setTimeout(() => {
      this.pendingShortcutPlaybackTimer = undefined;
      void this.startReadingTargetPlayback();
    }, GLOBAL_SHORTCUT_SELECTION_CAPTURE_DELAY_MS);
  };

  private async startReadingTargetPlaybackOnce(): Promise<PlaybackStartResult> {
    const input = await this.readReadingTargetInput();
    return this.startPlaybackSession(() => this.playback.playReadingTarget(input));
  }

  private async startPlaybackSession(
    play: () => Promise<PlaybackStartResult>
  ): Promise<PlaybackStartResult> {
    const result = await play();
    if (!result.started) return result;
    return {
      ...result,
      stopShortcutAvailable: this.registerStopShortcut(result.sessionId)
    };
  }

  private registerStopShortcut(sessionId: number | undefined): boolean {
    this.stopShortcutSessionId = sessionId;
    this.shortcuts.unregister(STOP_SHORTCUT);
    return this.shortcuts.register(STOP_SHORTCUT, this.stopPlaybackFromShortcut);
  }

  private unregisterStopShortcut(): void {
    this.stopShortcutSessionId = undefined;
    this.shortcuts.unregister(STOP_SHORTCUT);
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
