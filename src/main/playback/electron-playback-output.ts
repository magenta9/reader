import type { BrowserWindow } from "electron";
import {
  usesPlaybackOverlayFeedback,
  type PlaybackFeedbackSurface,
  type PlaybackAudioSession
} from "../../shared/app-contracts.js";
import {
  PLAYBACK_FEEDBACK_CHANNELS,
  RENDERER_AUDIO_CHANNELS
} from "../../shared/bridge-contracts.js";
import type { PlaybackAudioSink } from "./playback-service.js";
import type { PlaybackOverlayController } from "./playback-overlay-controller.js";

type PlaybackOverlayOutput = Pick<
  PlaybackOverlayController,
  "dismiss" | "fail" | "finish" | "show" | "stop"
>;

export interface ElectronPlaybackOutputOptions {
  createPlaybackRenderer: () => BrowserWindow;
  getReaderWindow: () => BrowserWindow | undefined;
  overlay: PlaybackOverlayOutput;
  playbackRendererEntry: string;
}

export class ElectronPlaybackOutput implements PlaybackAudioSink {
  private activeFeedback:
    | { sessionId: number; feedbackSurface: PlaybackFeedbackSurface }
    | undefined;

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
    this.activeFeedback = {
      sessionId: session.sessionId,
      feedbackSurface: session.feedbackSurface
    };
    if (usesOverlay) this.overlay.show(session.sessionId);
  }

  audioChunk(sessionId: number, bytes: Uint8Array): void {
    this.sendToPlaybackRenderer(RENDERER_AUDIO_CHANNELS.audioChunk, { sessionId, bytes });
  }

  endSegment(sessionId: number): void {
    this.sendToPlaybackRenderer(RENDERER_AUDIO_CHANNELS.endSegment, { sessionId });
  }

  finishGeneration(sessionId: number): void {
    this.sendToPlaybackRenderer(RENDERER_AUDIO_CHANNELS.endSessionAudio, { sessionId });
  }

  completeSession(sessionId: number): void {
    this.sendTerminalFeedback(PLAYBACK_FEEDBACK_CHANNELS.finishSession, sessionId, () => {
      this.overlay.finish(sessionId);
    });
  }

  failSession(sessionId: number): void {
    this.sendTerminalFeedback(PLAYBACK_FEEDBACK_CHANNELS.failSession, sessionId, () => {
      this.overlay.fail(sessionId);
    });
    this.sendToPlaybackRenderer(RENDERER_AUDIO_CHANNELS.failSession, { sessionId });
  }

  stopSession(sessionId: number): void {
    this.sendTerminalFeedback(PLAYBACK_FEEDBACK_CHANNELS.stopSession, sessionId, () => {
      this.overlay.stop(sessionId);
    });
    this.sendToPlaybackRenderer(RENDERER_AUDIO_CHANNELS.stopSession, { sessionId });
  }

  destroy(): void {
    this.activeFeedback = undefined;
    if (!this.playbackRenderer.isDestroyed()) this.playbackRenderer.destroy();
  }

  private dismissActiveOverlayBeforeNextSession(nextSessionId: number, nextUsesOverlay: boolean): void {
    const active = this.activeFeedback;
    if (!active || active.sessionId === nextSessionId) return;
    if (usesPlaybackOverlayFeedback(active.feedbackSurface) && !nextUsesOverlay) this.overlay.dismiss();
  }

  private sendTerminalFeedback(channel: string, sessionId: number, sendOverlay: () => void): void {
    const active = this.activeFeedback;
    if (!active || active.sessionId !== sessionId) return;
    this.activeFeedback = undefined;
    if (usesPlaybackOverlayFeedback(active.feedbackSurface)) {
      sendOverlay();
      return;
    }
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
