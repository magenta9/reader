import { streamMiniMaxTts } from "../../shared/minimax.js";
import {
  type PlaybackAudioSession,
  type PlaybackStartResult
} from "../../shared/app-contracts.js";
import type { ReadingTargetInput } from "../../shared/types.js";
import type { PlaybackDataStore, RuntimeErrorCategory } from "../data/app-data-store.js";
import {
  type PlaybackTtsStreamer,
  type PlaybackSessionPlan,
  PlaybackRequestResolver,
  type ResolvePlaybackRequestResult
} from "./playback-request-resolver.js";

export interface PlaybackAudioSink {
  startSession: (session: PlaybackAudioSession) => void;
  audioChunk: (sessionId: number, bytes: Uint8Array) => void;
  endSegment: (sessionId: number) => void;
  finishSession: (sessionId: number) => void;
  failSession: (sessionId: number) => void;
  stopSession: (sessionId: number) => void;
  handleRendererIdle?: (sessionId: number) => void;
}

export class PlaybackService {
  private sessionCounter = 0;
  private active:
    | {
        sessionId: number;
        abortController: AbortController;
        done: Promise<void>;
      }
    | undefined;

  constructor(
    private readonly store: PlaybackDataStore,
    private readonly sink: PlaybackAudioSink,
    private readonly streamTts: PlaybackTtsStreamer = streamMiniMaxTts,
    private readonly resolver: PlaybackRequestResolver = new PlaybackRequestResolver(store)
  ) {}

  async playReadingTarget(input: ReadingTargetInput): Promise<PlaybackStartResult> {
    return this.startResolvedPlaybackRequest(this.resolver.resolveReadingTarget(input));
  }

  async playHistoryRecord(recordId: string): Promise<PlaybackStartResult> {
    return this.startResolvedPlaybackRequest(this.resolver.resolveHistoryReplay(recordId));
  }

  async playFavoriteRecord(recordId: string): Promise<PlaybackStartResult> {
    return this.startResolvedPlaybackRequest(this.resolver.resolveFavoriteReplay(recordId));
  }

  stop(): void {
    if (!this.active) return;
    const { sessionId, abortController } = this.active;
    abortController.abort();
    this.stopAudioSession(sessionId);
    this.active = undefined;
  }

  stopSession(sessionId: number | undefined): void {
    if (!sessionId) {
      this.stop();
      return;
    }
    if (this.active?.sessionId === sessionId) {
      this.stop();
      return;
    }
    this.stopAudioSession(sessionId);
  }

  handleRendererIdle(sessionId: number): void {
    this.sink.handleRendererIdle?.(sessionId);
  }

  waitForCurrentSession(): Promise<void> {
    return this.active?.done ?? Promise.resolve();
  }

  private startResolvedPlaybackRequest(resolved: ResolvePlaybackRequestResult): PlaybackStartResult {
    return resolved.ok ? this.startPlannedPlayback(resolved.plan) : resolved.result;
  }

  private startPlannedPlayback(plan: PlaybackSessionPlan): PlaybackStartResult {
    this.stop();
    const sessionId = ++this.sessionCounter;
    const abortController = new AbortController();
    const audioSession: PlaybackAudioSession = {
      sessionId,
      ...plan.audioSession
    };
    try {
      this.sink.startSession(audioSession);
    } catch (error) {
      this.recordPlaybackError(error);
      return { started: false };
    }
    const done = this.runSession(sessionId, plan, abortController);
    this.active = { sessionId, abortController, done };
    return { started: true, sessionId };
  }

  private async runSession(
    sessionId: number,
    plan: PlaybackSessionPlan,
    abortController: AbortController
  ): Promise<void> {
    try {
      for (const segment of plan.segments) {
        if (abortController.signal.aborted) return;
        if (!segment.stream) {
          this.store.addErrorLog({
            category: "playback_runtime",
            message: `No Voice is available for ${segment.missingVoiceLanguage}.`
          });
          this.sink.failSession(sessionId);
          return;
        }

        await segment.stream(this.streamTts, {
          signal: abortController.signal,
          onAudioHex: (audioHex) => {
            if (!abortController.signal.aborted) {
              this.sink.audioChunk(sessionId, hexToBytes(audioHex));
            }
          }
        });
        if (abortController.signal.aborted) return;
        this.sink.endSegment(sessionId);
      }

      this.sink.finishSession(sessionId);
    } catch (error) {
      if (abortController.signal.aborted) return;
      this.recordPlaybackError(error);
      try {
        this.sink.failSession(sessionId);
      } catch {
        // The original output failure is already recorded; do not reject the session while reporting it.
      }
    } finally {
      if (this.active?.sessionId === sessionId) this.active = undefined;
    }
  }

  private stopAudioSession(sessionId: number): void {
    try {
      this.sink.stopSession(sessionId);
    } catch (error) {
      this.recordPlaybackError(error);
    }
  }

  private recordPlaybackError(error: unknown): void {
    this.store.addErrorLog({
      category: runtimeErrorCategory(error),
      message: safePlaybackErrorMessage(error)
    });
  }
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const bytes = new Uint8Array(Math.floor(clean.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function safePlaybackErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 160) : "Playback runtime failure";
}

function runtimeErrorCategory(error: unknown): RuntimeErrorCategory {
  const message = error instanceof Error ? error.message : String(error);
  if (/fetch|network|ENOTFOUND|ECONN|timeout/i.test(message)) return "network_runtime";
  if (/MiniMax|api|voice|model/i.test(message)) return "minimax_runtime";
  return "playback_runtime";
}
