import type { PlaybackStartResult } from "../../shared/app-contracts.js";

export interface PlaybackSessionRunner {
  playClipboardText(rawText: string): Promise<PlaybackStartResult>;
  playHistoryRecord(recordId: string): Promise<PlaybackStartResult>;
  stopSession(sessionId: number | undefined): void;
  handleRendererIdle(sessionId: number): void;
}

export interface StopShortcutRegistry {
  register(shortcut: "Escape", callback: () => void): void;
  unregister(shortcut: "Escape"): void;
}

export class PlaybackSessionLifecycle {
  private stopShortcutSessionId: number | undefined;

  constructor(
    private readonly playback: PlaybackSessionRunner,
    private readonly stopShortcuts: StopShortcutRegistry
  ) {}

  async startClipboardPlayback(rawText: string): Promise<PlaybackStartResult> {
    const result = await this.playback.playClipboardText(rawText);
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

  private registerStopShortcutIfStarted(result: PlaybackStartResult): void {
    if (result.started) this.registerStopShortcut(result.sessionId);
  }

  private registerStopShortcut(sessionId: number | undefined): void {
    this.stopShortcutSessionId = sessionId;
    this.stopShortcuts.unregister("Escape");
    this.stopShortcuts.register("Escape", this.stopPlaybackFromShortcut);
  }

  private unregisterStopShortcut(): void {
    this.stopShortcutSessionId = undefined;
    this.stopShortcuts.unregister("Escape");
  }

  private readonly stopPlaybackFromShortcut = (): void => {
    this.stopPlayback();
  };
}
