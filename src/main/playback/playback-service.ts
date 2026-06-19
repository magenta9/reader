import { createReadingSegments, normalizeReadableText } from "../../shared/segments.js";
import { streamMiniMaxTts, type MiniMaxTtsRequest } from "../../shared/minimax.js";
import { selectVoiceId } from "../../shared/voices.js";
import {
  PLAYBACK_FEEDBACK_SURFACES,
  type AppSettings,
  type PlaybackFeedbackSurface,
  type PlaybackSessionInfo,
  type PlaybackStartResult
} from "../../shared/app-contracts.js";
import type { ReadingTarget } from "../../shared/types.js";
import type { PlaybackDataStore, RuntimeErrorCategory } from "../data/app-data-store.js";

export interface PlaybackAudioSink {
  startSession: (session: PlaybackSessionInfo) => void;
  audioChunk: (sessionId: number, bytes: Uint8Array) => void;
  endSegment: (sessionId: number) => void;
  finishSession: (sessionId: number) => void;
  failSession: (sessionId: number) => void;
  stopSession: (sessionId: number) => void;
  handleRendererIdle?: (sessionId: number) => void;
}

type StreamTts = (request: MiniMaxTtsRequest) => Promise<void>;

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

  async playClipboardText(rawText: string): Promise<PlaybackStartResult> {
    const text = normalizeReadableText(rawText);
    if (!text) {
      this.store.recordSkippedPlaybackInput("empty_clipboard");
      return { started: false, skipped: "empty_clipboard" };
    }

    const settings = this.store.getSettings();
    if (!this.store.hasMiniMaxApiKey()) return { started: false, skipped: "missing_api_key" };
    if (settings.apiKeyStatus !== "verified") return { started: false, skipped: "unverified_api_key" };
    if (!settings.voices.length) return { started: false, skipped: "missing_voice" };

    const apiKey = this.store.readMiniMaxApiKey();
    if (!apiKey) return { started: false, skipped: "missing_api_key" };

    const target = createClipboardReadingTarget(text);
    if (!target.segments.length) return { started: false, skipped: "empty_clipboard" };
    this.store.saveOrReuseReadingHistoryRecord({
      text: target.text,
      segments: target.segments
    });

    return this.startTargetPlayback(
      target,
      settings,
      apiKey,
      PLAYBACK_FEEDBACK_SURFACES.playbackOverlay
    );
  }

  async playHistoryRecord(recordId: string): Promise<PlaybackStartResult> {
    const record = this.store.getReadingHistoryRecord(recordId);
    if (!record) return { started: false, skipped: "missing_history_record" };

    const settings = this.store.getSettings();
    if (!this.store.hasMiniMaxApiKey()) return { started: false, skipped: "missing_api_key" };
    if (settings.apiKeyStatus !== "verified") return { started: false, skipped: "unverified_api_key" };
    if (!settings.voices.length) return { started: false, skipped: "missing_voice" };

    const apiKey = this.store.readMiniMaxApiKey();
    if (!apiKey) return { started: false, skipped: "missing_api_key" };

    const target = createHistoryReadingTarget(record.id, record.text);
    if (!target.segments.length) return { started: false, skipped: "empty_clipboard" };
    return this.startTargetPlayback(
      target,
      settings,
      apiKey,
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

  private startTargetPlayback(
    target: ReadingTarget,
    settings: AppSettings,
    apiKey: string,
    feedbackSurface: PlaybackFeedbackSurface
  ): PlaybackStartResult {
    this.stop();
    const sessionId = ++this.sessionCounter;
    const abortController = new AbortController();
    const session: PlaybackSessionInfo = {
      sessionId,
      target,
      speechRate: settings.speechRate,
      feedbackSurface
    };
    const done = this.runSession(session, settings, apiKey, abortController);
    this.active = { sessionId, abortController, done };
    return { started: true, sessionId };
  }

  private async runSession(
    session: PlaybackSessionInfo,
    settings: AppSettings,
    apiKey: string,
    abortController: AbortController
  ): Promise<void> {
    this.sink.startSession(session);
    const { sessionId, target } = session;

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

function createClipboardReadingTarget(text: string): ReadingTarget {
  return {
    title: "Clipboard",
    url: "",
    source: "clipboard",
    text,
    segments: createReadingSegments(text)
  };
}

function createHistoryReadingTarget(recordId: string, text: string): ReadingTarget {
  return {
    title: "History Replay",
    url: `history:${recordId}`,
    source: "clipboard",
    text,
    segments: createReadingSegments(text)
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
