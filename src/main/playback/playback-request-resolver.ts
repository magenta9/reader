import { createReadingSegments, normalizeReadableText } from "../../shared/segments.js";
import {
  PLAYBACK_FEEDBACK_SURFACES,
  type AppSettings,
  type FavoriteRecord,
  type PlaybackFeedbackSurface,
  type PlaybackStartResult,
  type ReadingHistoryRecord
} from "../../shared/app-contracts.js";
import type { ReadingTarget, ReadingTargetInput } from "../../shared/types.js";
import type { PlaybackDataStore } from "../data/app-data-store.js";

type PlaybackReadiness =
  | { ok: true; settings: AppSettings; apiKey: string }
  | { ok: false; result: PlaybackStartResult };
type StoredReplaySkipped = Extract<PlaybackStartResult["skipped"], "missing_history_record" | "missing_favorite_record">;
type PlaybackReadinessSkipped = Extract<
  PlaybackStartResult["skipped"],
  "missing_api_key" | "unverified_api_key" | "missing_voice"
>;

export interface ResolvedPlaybackRequest {
  target: ReadingTarget;
  settings: AppSettings;
  apiKey: string;
  feedbackSurface: PlaybackFeedbackSurface;
}

export type ResolvePlaybackRequestResult =
  | { ok: true; request: ResolvedPlaybackRequest }
  | { ok: false; result: PlaybackStartResult };

interface StoredRecordReplayConfig {
  title: string;
  urlPrefix: "history" | "favorite";
  feedbackSurface: PlaybackFeedbackSurface;
  missingSkipped: StoredReplaySkipped;
}

const HISTORY_REPLAY_CONFIG: StoredRecordReplayConfig = {
  title: "History Replay",
  urlPrefix: "history",
  feedbackSurface: PLAYBACK_FEEDBACK_SURFACES.historyDetail,
  missingSkipped: "missing_history_record"
};

const FAVORITE_REPLAY_CONFIG: StoredRecordReplayConfig = {
  title: "Favorite Replay",
  urlPrefix: "favorite",
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

    const target = createReadingTarget({ text, source: input.source });
    if (!target.segments.length) return skipped("empty_clipboard");

    this.store.saveOrReuseReadingHistoryRecord({
      text: target.text,
      source: target.source,
      segments: target.segments
    });

    return resolved(target, readiness, PLAYBACK_FEEDBACK_SURFACES.playbackOverlay);
  }

  resolveHistoryReplay(recordId: string): ResolvePlaybackRequestResult {
    return this.resolveStoredRecord(this.store.getReadingHistoryRecord(recordId), HISTORY_REPLAY_CONFIG);
  }

  resolveFavoriteReplay(recordId: string): ResolvePlaybackRequestResult {
    return this.resolveStoredRecord(this.store.getFavoriteRecord(recordId), FAVORITE_REPLAY_CONFIG);
  }

  private resolveStoredRecord(
    record: Pick<ReadingHistoryRecord | FavoriteRecord, "id" | "text" | "source"> | undefined,
    config: StoredRecordReplayConfig
  ): ResolvePlaybackRequestResult {
    if (!record) return skipped(config.missingSkipped);

    const readiness = this.readPlaybackReadiness();
    if (!readiness.ok) return readiness;

    const target = createStoredRecordReadingTarget(record, config);
    if (!target.segments.length) return skipped("empty_clipboard");

    return resolved(target, readiness, config.feedbackSurface);
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
  target: ReadingTarget,
  readiness: Extract<PlaybackReadiness, { ok: true }>,
  feedbackSurface: PlaybackFeedbackSurface
): ResolvePlaybackRequestResult {
  return {
    ok: true,
    request: {
      target,
      settings: readiness.settings,
      apiKey: readiness.apiKey,
      feedbackSurface
    }
  };
}

function skipped(skippedReason: NonNullable<PlaybackStartResult["skipped"]>): ResolvePlaybackRequestResult {
  return { ok: false, result: { started: false, skipped: skippedReason } };
}

function unready(skippedReason: PlaybackReadinessSkipped): PlaybackReadiness {
  return { ok: false, result: { started: false, skipped: skippedReason } };
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

function createStoredRecordReadingTarget(
  record: Pick<ReadingHistoryRecord | FavoriteRecord, "id" | "text" | "source">,
  config: Pick<StoredRecordReplayConfig, "title" | "urlPrefix">
): ReadingTarget {
  return {
    title: config.title,
    url: `${config.urlPrefix}:${record.id}`,
    source: record.source,
    text: record.text,
    segments: createReadingSegments(record.text)
  };
}
