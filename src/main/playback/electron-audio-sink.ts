import type { BrowserWindow } from "electron";
import { usesPlaybackOverlayFeedback, type PlaybackAudioSession } from "../../shared/app-contracts.js";
import { RENDERER_AUDIO_CHANNELS } from "../../shared/bridge-contracts.js";
import type { PlaybackAudioSink } from "./playback-service.js";
import type { PlaybackOverlayController } from "./playback-overlay-controller.js";

export class ElectronAudioSink implements PlaybackAudioSink {
  private activeOverlaySession: { sessionId: number } | undefined;
  private rendererSessionId: number | undefined;

  constructor(
    private readonly getPlaybackWindow: () => BrowserWindow | undefined,
    private readonly overlay: PlaybackOverlayController
  ) {}

  startSession(session: PlaybackAudioSession): void {
    this.stopActiveOverlayBeforeNextSession(session.sessionId);
    const usesPlaybackOverlay = usesPlaybackOverlayFeedback(session.feedbackSurface);
    const deliveredToPlaybackWindow = this.sendToPlaybackWindow(RENDERER_AUDIO_CHANNELS.startSession, session);
    this.rendererSessionId = deliveredToPlaybackWindow ? session.sessionId : undefined;
    this.activeOverlaySession = usesPlaybackOverlay ? { sessionId: session.sessionId } : undefined;
    if (usesPlaybackOverlay) this.overlay.show();
  }

  audioChunk(sessionId: number, bytes: Uint8Array): void {
    this.sendToPlaybackWindow(RENDERER_AUDIO_CHANNELS.audioChunk, { sessionId, bytes });
  }

  endSegment(sessionId: number): void {
    this.sendToPlaybackWindow(RENDERER_AUDIO_CHANNELS.endSegment, { sessionId });
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
    this.sendToPlaybackWindow(RENDERER_AUDIO_CHANNELS.failSession, { sessionId });
  }

  stopSession(sessionId: number): void {
    if (this.consumeActiveOverlaySession(sessionId)) {
      this.overlay.stop();
    }
    this.sendToPlaybackWindow(RENDERER_AUDIO_CHANNELS.stopSession, { sessionId });
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
    const deliveredToPlaybackWindow = this.sendToPlaybackWindow(RENDERER_AUDIO_CHANNELS.finishSession, { sessionId });
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
