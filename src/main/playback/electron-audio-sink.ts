import type { BrowserWindow } from "electron";
import { usesPlaybackOverlayFeedback, type PlaybackSessionInfo } from "../../shared/app-contracts.js";
import type { PlaybackAudioSink } from "./playback-service.js";
import type { PlaybackOverlayController } from "./playback-overlay-controller.js";

export class ElectronAudioSink implements PlaybackAudioSink {
  private activeOverlaySession: { sessionId: number } | undefined;
  private rendererSessionId: number | undefined;

  constructor(
    private readonly getPlaybackWindow: () => BrowserWindow | undefined,
    private readonly overlay: PlaybackOverlayController
  ) {}

  startSession(session: PlaybackSessionInfo): void {
    this.stopActiveOverlayBeforeNextSession(session.sessionId);
    const usesPlaybackOverlay = usesPlaybackOverlayFeedback(session.feedbackSurface);
    const deliveredToPlaybackWindow = this.sendToPlaybackWindow("playback:start-session", session);
    this.rendererSessionId = deliveredToPlaybackWindow ? session.sessionId : undefined;
    this.activeOverlaySession = usesPlaybackOverlay ? { sessionId: session.sessionId } : undefined;
    if (usesPlaybackOverlay) this.overlay.show();
  }

  audioChunk(sessionId: number, bytes: Uint8Array): void {
    this.sendToPlaybackWindow("playback:audio-chunk", { sessionId, bytes });
  }

  endSegment(sessionId: number): void {
    this.sendToPlaybackWindow("playback:end-segment", { sessionId });
  }

  finishSession(sessionId: number): void {
    if (!this.sendFinishToPlaybackWindow(sessionId) && this.consumeActiveOverlaySession(sessionId)) {
      this.overlay.finish();
    }
  }

  failSession(sessionId: number): void {
    if (this.consumeActiveOverlaySession(sessionId)) {
      this.overlay.fail();
    }
    this.sendToPlaybackWindow("playback:fail-session", { sessionId });
  }

  stopSession(sessionId: number): void {
    if (this.consumeActiveOverlaySession(sessionId)) {
      this.overlay.stop();
    }
    this.sendToPlaybackWindow("playback:stop-session", { sessionId });
  }

  handleRendererIdle(sessionId: number): void {
    if (this.rendererSessionId === sessionId) this.rendererSessionId = undefined;
    this.consumeActiveOverlaySession(sessionId);
  }

  private stopActiveOverlayBeforeNextSession(nextSessionId: number): void {
    if (this.activeOverlaySession === undefined || this.activeOverlaySession.sessionId === nextSessionId) return;
    if (this.rendererSessionId === this.activeOverlaySession.sessionId) this.rendererSessionId = undefined;
    this.activeOverlaySession = undefined;
    this.overlay.stop();
  }

  private consumeActiveOverlaySession(sessionId: number): boolean {
    if (this.activeOverlaySession?.sessionId !== sessionId) return false;
    this.activeOverlaySession = undefined;
    return true;
  }

  private sendFinishToPlaybackWindow(sessionId: number): boolean {
    if (this.rendererSessionId !== sessionId) return false;
    const deliveredToPlaybackWindow = this.sendToPlaybackWindow("playback:finish-session", { sessionId });
    if (!deliveredToPlaybackWindow) this.rendererSessionId = undefined;
    return deliveredToPlaybackWindow;
  }

  private sendToPlaybackWindow(channel: string, payload: unknown): boolean {
    const window = this.getPlaybackWindow();
    if (!window || window.isDestroyed()) return false;
    window.webContents.send(channel, payload);
    return true;
  }
}
