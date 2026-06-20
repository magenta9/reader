import { createReadingSegments, normalizeReadableText } from "../../shared/segments.js";
import { streamMiniMaxTts, type MiniMaxTtsRequest } from "../../shared/minimax.js";
import { selectVoiceId } from "../../shared/voices.js";
import {
  PLAYBACK_FEEDBACK_SURFACES,
  type AppSettings,
  type PlaybackFeedbackSurface,
  type PlaybackAudioSession,
  type ReadingHistoryRecord,
  type PlaybackStartResult
} from "../../shared/app-contracts.js";
import type { ReadingTarget, ReadingTargetInput } from "../../shared/types.js";
import type { PlaybackDataStore, RuntimeErrorCategory } from "../data/app-data-store.js";

export interface PlaybackAudioSink {
  startSession: (session: PlaybackAudioSession) => void;
  audioChunk: (sessionId: number, bytes: Uint8Array) => void;
  endSegment: (sessionId: number) => void;
  finishSession: (sessionId: number) => void;
  failSession: (sessionId: number) => void;
  stopSession: (sessionId: number) => void;
  handleRendererIdle?: (sessionId: number) => void;
}

type StreamTts = (request: MiniMaxTtsRequest) => Promise<void>;
type PlaybackReadiness =
  | { ok: true; settings: AppSettings; apiKey: string }
  | { ok: false; result: PlaybackStartResult };

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
    private readonly streamTts: StreamTts = streamMiniMaxTts
  ) {}

  async playReadingTarget(input: ReadingTargetInput): Promise<PlaybackStartResult> {
    const text = normalizeReadableText(input.text);
    if (!text) {
      this.store.recordSkippedPlaybackInput("empty_clipboard");
      return { started: false, skipped: "empty_clipboard" };
    }

    const readiness = this.readPlaybackReadiness();
    if (!readiness.ok) return readiness.result;

    const target = createReadingTarget({ text, source: input.source });
    if (!target.segments.length) return { started: false, skipped: "empty_clipboard" };
    this.store.saveOrReuseReadingHistoryRecord({
      text: target.text,
      source: target.source,
      segments: target.segments
    });

    return this.startTargetPlayback(
      target,
      readiness.settings,
      readiness.apiKey,
      PLAYBACK_FEEDBACK_SURFACES.playbackOverlay
    );
  }

  async playHistoryRecord(recordId: string): Promise<PlaybackStartResult> {
    const record = this.store.getReadingHistoryRecord(recordId);
    if (!record) return { started: false, skipped: "missing_history_record" };

    const readiness = this.readPlaybackReadiness();
    if (!readiness.ok) return readiness.result;

    const target = createHistoryReadingTarget(record);
    if (!target.segments.length) return { started: false, skipped: "empty_clipboard" };
    return this.startTargetPlayback(
      target,
      readiness.settings,
      readiness.apiKey,
      PLAYBACK_FEEDBACK_SURFACES.historyDetail
    );
  }

  stop(): void {
    if (!this.active) return;
    const { sessionId, abortController } = this.active;
    abortController.abort();
    this.sink.stopSession(sessionId);
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
    this.sink.stopSession(sessionId);
  }

  handleRendererIdle(sessionId: number): void {
    this.sink.handleRendererIdle?.(sessionId);
  }

  waitForCurrentSession(): Promise<void> {
    return this.active?.done ?? Promise.resolve();
  }

  private readPlaybackReadiness(): PlaybackReadiness {
    const settings = this.store.getSettings();
    if (!this.store.hasMiniMaxApiKey()) {
      return { ok: false, result: { started: false, skipped: "missing_api_key" } };
    }
    if (settings.apiKeyStatus !== "verified") {
      return { ok: false, result: { started: false, skipped: "unverified_api_key" } };
    }
    if (!settings.voices.length) {
      return { ok: false, result: { started: false, skipped: "missing_voice" } };
    }

    const apiKey = this.store.readMiniMaxApiKey();
    if (!apiKey) {
      return { ok: false, result: { started: false, skipped: "missing_api_key" } };
    }
    return { ok: true, settings, apiKey };
  }

  private startTargetPlayback(
    target: ReadingTarget,
    settings: AppSettings,
    apiKey: string,
    feedbackSurface: PlaybackFeedbackSurface
  ): PlaybackStartResult {
    this.stop();
    const sessionId = ++this.sessionCounter;
    const abortController = new AbortController();
    const audioSession: PlaybackAudioSession = {
      sessionId,
      speechRate: settings.speechRate,
      feedbackSurface,
      segmentWeights: target.segments.map((segment) => Math.max(1, segment.text.length))
    };
    const done = this.runSession(audioSession, target, settings, apiKey, abortController);
    this.active = { sessionId, abortController, done };
    return { started: true, sessionId };
  }

  private async runSession(
    audioSession: PlaybackAudioSession,
    target: ReadingTarget,
    settings: AppSettings,
    apiKey: string,
    abortController: AbortController
  ): Promise<void> {
    this.sink.startSession(audioSession);
    const { sessionId } = audioSession;

    try {
      for (const segment of target.segments) {
        if (abortController.signal.aborted) return;
        const voiceId = selectVoiceId(settings.voices, settings.preferredVoicesByLanguage, segment.language);
        if (!voiceId) {
          this.store.addErrorLog({
            category: "playback_runtime",
            message: `No Voice is available for ${segment.language}.`
          });
          this.sink.failSession(sessionId);
          return;
        }

        await this.streamTts({
          apiKey,
          model: settings.model,
          voiceId,
          text: segment.text,
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
      this.store.addErrorLog({
        category: runtimeErrorCategory(error),
        message: safePlaybackErrorMessage(error)
      });
      this.sink.failSession(sessionId);
    } finally {
      if (this.active?.sessionId === sessionId) this.active = undefined;
    }
  }
}

function createReadingTarget(input: ReadingTargetInput): ReadingTarget {
  return {
    title: input.source === "selected_text" ? "Selected Text" : "Clipboard",
    url: "",
    source: input.source,
    text: input.text,
    segments: createReadingSegments(input.text)
  };
}

function createHistoryReadingTarget(record: Pick<ReadingHistoryRecord, "id" | "text" | "source">): ReadingTarget {
  return {
    title: "History Replay",
    url: `history:${record.id}`,
    source: record.source,
    text: record.text,
    segments: createReadingSegments(record.text)
  };
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
