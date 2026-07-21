import { createReadingSegments, normalizeReadableText } from "../../shared/segments.js";
import { selectVoiceId } from "../../shared/voices.js";
import type {
  SpeechAudioStreamPort,
  SpeechAudioStreamRequest
} from "../../shared/speech-audio-stream.js";
import {
  PLAYBACK_FEEDBACK_SURFACES,
  type AppSettings,
  type PlaybackAudioSession,
  type PlaybackFeedbackSurface,
  type PlaybackStartResult
} from "../../shared/app-contracts.js";
import type { DetectedLanguage, ReadingSegment, ReadingTargetInput } from "../../shared/types.js";
import type { PlaybackDataStore } from "../data/app-data-store.js";

type PlaybackReadiness =
  | { ok: true; settings: AppSettings; apiKey: string }
  | { ok: false; result: PlaybackStartResult };
type StoredReplaySkipped = Extract<PlaybackStartResult["skipped"], "missing_history_record" | "missing_favorite_record">;
type PlaybackReadinessSkipped = Extract<
  PlaybackStartResult["skipped"],
  "missing_api_key" | "unverified_api_key" | "missing_voice"
>;

export interface PlaybackSessionPlan {
  audioSession: Omit<PlaybackAudioSession, "sessionId">;
  segments: PlannedPlaybackSegment[];
}

export type PlannedPlaybackSegment =
  | { stream: PlannedSpeechAudioStream; missingVoiceLanguage?: undefined }
  | { stream?: undefined; missingVoiceLanguage: DetectedLanguage };

type PlannedSpeechAudioRequest = Pick<
  SpeechAudioStreamRequest,
  "apiKey" | "model" | "voiceId" | "text"
>;
type PlannedSpeechAudioRuntime = Pick<SpeechAudioStreamRequest, "signal" | "onAudioChunk">;
type PlannedSpeechAudioStream = (
  streamAudio: SpeechAudioStreamPort,
  runtime: PlannedSpeechAudioRuntime
) => Promise<void>;

export type ResolvePlaybackRequestResult =
  | { ok: true; plan: PlaybackSessionPlan }
  | { ok: false; result: PlaybackStartResult };

interface StoredRecordReplayConfig {
  feedbackSurface: PlaybackFeedbackSurface;
  missingSkipped: StoredReplaySkipped;
}

const HISTORY_REPLAY_CONFIG: StoredRecordReplayConfig = {
  feedbackSurface: PLAYBACK_FEEDBACK_SURFACES.historyDetail,
  missingSkipped: "missing_history_record"
};

const FAVORITE_REPLAY_CONFIG: StoredRecordReplayConfig = {
  feedbackSurface: PLAYBACK_FEEDBACK_SURFACES.favoriteDetail,
  missingSkipped: "missing_favorite_record"
};

export class PlaybackRequestResolver {
  constructor(private readonly store: PlaybackDataStore) {}

  resolveReadingTarget(input: ReadingTargetInput): ResolvePlaybackRequestResult {
    const text = normalizeReadableText(input.text);
    if (!text) {
      this.store.recordSkippedPlaybackInput("empty_clipboard");
      return skipped("empty_clipboard");
    }

    const readiness = this.readPlaybackReadiness();
    if (!readiness.ok) return readiness;

    const segments = createReadingSegments(text);
    if (!segments.length) return skipped("empty_clipboard");

    this.store.saveOrReuseReadingHistoryRecord({
      text,
      source: input.source,
      segments
    });

    return resolved(segments, readiness, PLAYBACK_FEEDBACK_SURFACES.playbackOverlay);
  }

  resolveHistoryReplay(recordId: string): ResolvePlaybackRequestResult {
    return this.resolveStoredRecord(this.store.getReadingHistoryRecord(recordId), HISTORY_REPLAY_CONFIG);
  }

  resolveFavoriteReplay(recordId: string): ResolvePlaybackRequestResult {
    return this.resolveStoredRecord(this.store.getFavoriteRecord(recordId), FAVORITE_REPLAY_CONFIG);
  }

  private resolveStoredRecord(
    record: { text: string } | undefined,
    config: StoredRecordReplayConfig
  ): ResolvePlaybackRequestResult {
    if (!record) return skipped(config.missingSkipped);

    const readiness = this.readPlaybackReadiness();
    if (!readiness.ok) return readiness;

    const segments = createReadingSegments(record.text);
    if (!segments.length) return skipped("empty_clipboard");

    return resolved(segments, readiness, config.feedbackSurface);
  }

  private readPlaybackReadiness(): PlaybackReadiness {
    const settings = this.store.getSettings();
    if (!this.store.hasMiniMaxApiKey()) {
      return unready("missing_api_key");
    }
    if (settings.apiKeyStatus !== "verified") {
      return unready("unverified_api_key");
    }
    if (!settings.voices.length) {
      return unready("missing_voice");
    }

    const apiKey = this.store.readMiniMaxApiKey();
    if (!apiKey) {
      return unready("missing_api_key");
    }
    return { ok: true, settings, apiKey };
  }
}

function resolved(
  segments: ReadingSegment[],
  readiness: Extract<PlaybackReadiness, { ok: true }>,
  feedbackSurface: PlaybackFeedbackSurface
): ResolvePlaybackRequestResult {
  return {
    ok: true,
    plan: createPlaybackSessionPlan(segments, readiness.settings, readiness.apiKey, feedbackSurface)
  };
}

function createPlaybackSessionPlan(
  segments: ReadingSegment[],
  settings: AppSettings,
  apiKey: string,
  feedbackSurface: PlaybackFeedbackSurface
): PlaybackSessionPlan {
  const segmentWeights: number[] = [];
  const plannedSegments: PlannedPlaybackSegment[] = [];

  for (const segment of segments) {
    segmentWeights.push(Math.max(1, segment.text.length));
    const voiceId = selectVoiceId(settings.voices, settings.preferredVoicesByLanguage, segment.language);
    if (!voiceId) {
      plannedSegments.push({ missingVoiceLanguage: segment.language });
      continue;
    }
    plannedSegments.push({ stream: createPlannedTtsStream({ apiKey, model: settings.model, voiceId, text: segment.text }) });
  }

  return {
    audioSession: {
      speechRate: settings.speechRate,
      feedbackSurface,
      segmentWeights
    },
    segments: plannedSegments
  };
}

function createPlannedTtsStream(request: PlannedSpeechAudioRequest): PlannedSpeechAudioStream {
  return (streamAudio, runtime) => streamAudio({ ...request, ...runtime });
}

function skipped(skippedReason: NonNullable<PlaybackStartResult["skipped"]>): ResolvePlaybackRequestResult {
  return { ok: false, result: { started: false, skipped: skippedReason } };
}

function unready(skippedReason: PlaybackReadinessSkipped): PlaybackReadiness {
  return { ok: false, result: { started: false, skipped: skippedReason } };
}
