import type { BrowserWindow } from "electron";
import {
  usesPlaybackOverlayFeedback,
  type PlaybackFeedbackSurface,
  type PlaybackAudioSession
} from "../../shared/app-contracts.js";
import {
  playbackFeedbackRoleContract,
  playbackRendererRoleContract
} from "../../shared/role-bridge-contracts.js";
import {
  createRoleEventEmitter,
  type EventEmitterFromContract
} from "../../shared/role-bridge-registry.js";
import { createElectronMainRoleEventTransport } from "../electron-main-role-transport.js";
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
  private readonly playbackRendererEvents: EventEmitterFromContract<
    typeof playbackRendererRoleContract
  >;

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
  ) {
    this.playbackRendererEvents = createRoleEventEmitter(
      playbackRendererRoleContract,
      createElectronMainRoleEventTransport(playbackRenderer.webContents)
    );
  }

  startSession(session: PlaybackAudioSession): void {
    const usesOverlay = usesPlaybackOverlayFeedback(session.feedbackSurface);
    this.dismissActiveOverlayBeforeNextSession(session.sessionId, usesOverlay);
    this.getPlaybackRendererEvents().emitPlaybackStart(session);
    this.activeFeedback = {
      sessionId: session.sessionId,
      feedbackSurface: session.feedbackSurface
    };
    if (usesOverlay) this.overlay.show(session.sessionId);
  }

  audioChunk(sessionId: number, bytes: Uint8Array): void {
    this.getPlaybackRendererEvents().emitAudioChunk({ sessionId, bytes });
  }

  endSegment(sessionId: number): void {
    this.getPlaybackRendererEvents().emitSegmentEnd({ sessionId });
  }

  finishGeneration(sessionId: number): void {
    this.getPlaybackRendererEvents().emitAudioInputEnd({ sessionId });
  }

  completeSession(sessionId: number): void {
    this.sendTerminalFeedback(
      sessionId,
      () => this.overlay.finish(sessionId),
      (events) => events.emitPlaybackFinish({ sessionId })
    );
  }

  failSession(sessionId: number): void {
    this.sendTerminalFeedback(
      sessionId,
      () => this.overlay.fail(sessionId),
      (events) => events.emitPlaybackFail({ sessionId })
    );
    this.getPlaybackRendererEvents().emitPlaybackFail({ sessionId });
  }

  stopSession(sessionId: number): void {
    this.sendTerminalFeedback(
      sessionId,
      () => this.overlay.stop(sessionId),
      (events) => events.emitPlaybackStop({ sessionId })
    );
    this.getPlaybackRendererEvents().emitPlaybackStop({ sessionId });
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

  private sendTerminalFeedback(
    sessionId: number,
    sendOverlay: () => void,
    sendReaderFeedback: (
      events: EventEmitterFromContract<typeof playbackFeedbackRoleContract>
    ) => void
  ): void {
    const active = this.activeFeedback;
    if (!active || active.sessionId !== sessionId) return;
    this.activeFeedback = undefined;
    if (usesPlaybackOverlayFeedback(active.feedbackSurface)) {
      sendOverlay();
      return;
    }
    const readerWindow = this.getReaderWindow();
    if (!readerWindow || readerWindow.isDestroyed()) return;
    sendReaderFeedback(
      createRoleEventEmitter(
        playbackFeedbackRoleContract,
        createElectronMainRoleEventTransport(readerWindow.webContents)
      )
    );
  }

  private getPlaybackRendererEvents(): EventEmitterFromContract<
    typeof playbackRendererRoleContract
  > {
    if (this.playbackRenderer.isDestroyed()) {
      throw new Error("Playback Renderer is unavailable.");
    }
    return this.playbackRendererEvents;
  }
}
