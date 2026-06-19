import type { BrowserWindow } from "electron";
import type { PlaybackSessionInfo } from "../../shared/app-contracts.js";
import type { PlaybackAudioSink } from "./playback-service.js";
import type { PlaybackOverlayController } from "./playback-overlay-controller.js";

export class ElectronAudioSink implements PlaybackAudioSink {
  constructor(
    private readonly getPlaybackWindow: () => BrowserWindow | undefined,
    private readonly overlay: PlaybackOverlayController
  ) {}

  startSession(session: PlaybackSessionInfo): void {
    if (isClipboardPlayback(session)) this.overlay.show();
    this.send("playback:start-session", session);
  }

  audioChunk(sessionId: number, bytes: Uint8Array): void {
    this.send("playback:audio-chunk", { sessionId, bytes });
  }

  endSegment(sessionId: number): void {
    this.send("playback:end-segment", { sessionId });
  }

  finishSession(sessionId: number): void {
    this.send("playback:finish-session", { sessionId });
  }

  failSession(sessionId: number): void {
    this.overlay.fail();
    this.send("playback:fail-session", { sessionId });
  }

  stopSession(sessionId: number): void {
    this.overlay.stop();
    this.send("playback:stop-session", { sessionId });
  }

  private send(channel: string, payload: unknown): void {
    const window = this.getPlaybackWindow();
    if (!window || window.isDestroyed()) return;
    window.webContents.send(channel, payload);
  }
}

function isClipboardPlayback(session: PlaybackSessionInfo): boolean {
  return session.target.title === "Clipboard" && !session.target.url.startsWith("history:");
}
