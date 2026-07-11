import type { BrowserWindow } from "electron";
import { usesPlaybackOverlayFeedback, type PlaybackAudioSession } from "../../shared/app-contracts.js";
import { RENDERER_AUDIO_CHANNELS } from "../../shared/bridge-contracts.js";
import type { PlaybackAudioSink } from "./playback-service.js";
import type { PlaybackOverlayController } from "./playback-overlay-controller.js";

type PlaybackOverlayOutput = Pick<PlaybackOverlayController, "dismiss" | "fail" | "show" | "stop">;

export interface ElectronPlaybackOutputOptions {
  createPlaybackRenderer: () => BrowserWindow;
  getReaderWindow: () => BrowserWindow | undefined;
  overlay: PlaybackOverlayOutput;
  playbackRendererEntry: string;
}

export class ElectronPlaybackOutput implements PlaybackAudioSink {
  private activeOverlaySessionId: number | undefined;
  private activeReaderFeedbackSessionId: number | undefined;

  static async create(options: ElectronPlaybackOutputOptions): Promise<ElectronPlaybackOutput> {
    const playbackRenderer = options.createPlaybackRenderer();
    try {
      await playbackRenderer.loadFile(options.playbackRendererEntry);
      if (playbackRenderer.isDestroyed()) {
        throw new Error("Playback Renderer was destroyed before it became ready.");
      }
      return new ElectronPlaybackOutput(
        playbackRenderer,
        options.getReaderWindow,
        options.overlay
      );
    } catch (error) {
      if (!playbackRenderer.isDestroyed()) playbackRenderer.destroy();
      throw error;
    }
  }

  private constructor(
    private readonly playbackRenderer: BrowserWindow,
    private readonly getReaderWindow: () => BrowserWindow | undefined,
    private readonly overlay: PlaybackOverlayOutput
  ) {}

  startSession(session: PlaybackAudioSession): void {
    const usesOverlay = usesPlaybackOverlayFeedback(session.feedbackSurface);
    this.dismissActiveOverlayBeforeNextSession(session.sessionId, usesOverlay);
    this.sendToPlaybackRenderer(RENDERER_AUDIO_CHANNELS.startSession, session);
    if (!usesOverlay) {
      this.activeReaderFeedbackSessionId = session.sessionId;
      return;
    }
    this.activeReaderFeedbackSessionId = undefined;
    this.activeOverlaySessionId = session.sessionId;
    this.overlay.show(session.sessionId);
  }

  audioChunk(sessionId: number, bytes: Uint8Array): void {
    this.sendToPlaybackRenderer(RENDERER_AUDIO_CHANNELS.audioChunk, { sessionId, bytes });
  }

  endSegment(sessionId: number): void {
    this.sendToPlaybackRenderer(RENDERER_AUDIO_CHANNELS.endSegment, { sessionId });
  }

  finishSession(sessionId: number): void {
    this.sendToPlaybackRenderer(RENDERER_AUDIO_CHANNELS.finishSession, { sessionId });
    this.sendTerminalFeedback(RENDERER_AUDIO_CHANNELS.finishSession, sessionId);
  }

  failSession(sessionId: number): void {
    if (this.consumeActiveOverlaySession(sessionId)) this.overlay.fail(sessionId);
    this.sendTerminalFeedback(RENDERER_AUDIO_CHANNELS.failSession, sessionId);
    this.sendToPlaybackRenderer(RENDERER_AUDIO_CHANNELS.failSession, { sessionId });
  }

  stopSession(sessionId: number): void {
    if (this.consumeActiveOverlaySession(sessionId)) this.overlay.stop(sessionId);
    this.sendTerminalFeedback(RENDERER_AUDIO_CHANNELS.stopSession, sessionId);
    this.sendToPlaybackRenderer(RENDERER_AUDIO_CHANNELS.stopSession, { sessionId });
  }

  handleRendererIdle(sessionId: number): void {
    this.consumeActiveOverlaySession(sessionId);
  }

  destroy(): void {
    this.activeOverlaySessionId = undefined;
    this.activeReaderFeedbackSessionId = undefined;
    if (!this.playbackRenderer.isDestroyed()) this.playbackRenderer.destroy();
  }

  private dismissActiveOverlayBeforeNextSession(nextSessionId: number, nextUsesOverlay: boolean): void {
    if (this.activeOverlaySessionId === undefined || this.activeOverlaySessionId === nextSessionId) return;
    this.activeOverlaySessionId = undefined;
    if (!nextUsesOverlay) this.overlay.dismiss();
  }

  private consumeActiveOverlaySession(sessionId: number): boolean {
    if (this.activeOverlaySessionId !== sessionId) return false;
    this.activeOverlaySessionId = undefined;
    return true;
  }

  private sendTerminalFeedback(channel: string, sessionId: number): void {
    if (this.activeReaderFeedbackSessionId !== sessionId) return;
    this.activeReaderFeedbackSessionId = undefined;
    const readerWindow = this.getReaderWindow();
    if (!readerWindow || readerWindow.isDestroyed()) return;
    readerWindow.webContents.send(channel, { sessionId });
  }

  private sendToPlaybackRenderer(channel: string, payload: unknown): void {
    if (this.playbackRenderer.isDestroyed()) {
      throw new Error("Playback Renderer is unavailable.");
    }
    this.playbackRenderer.webContents.send(channel, payload);
  }
}
