import type { DetectedLanguage, MiniMaxVoice, ReadingSource } from "./types.js";

export type AppRoute = "home" | "history" | "favorites" | "settings";

export type HistoryRetention = "7d" | "1m" | "3m" | "forever";

export interface HistoryRetentionImpact {
  historyRetention: HistoryRetention;
  deleteCount: number;
  remainingCount: number;
}

export interface HistoryRetentionChangeResult {
  applied: boolean;
  impact: HistoryRetentionImpact;
  settings: AppSettings;
}

export const DEFAULT_ACTIVATION_SHORTCUT = "Control+Command+R";
export const LEGACY_DEFAULT_ACTIVATION_SHORTCUT = "Command+Shift+R";

export interface AppSettings {
  hasCompletedOnboarding: boolean;
  lastRoute: AppRoute;
  launchAtLogin: boolean;
  activationShortcut: string;
  shortcutRegistrationError?: string;
  speechRate: number;
  model: string;
  historyRetention: HistoryRetention;
  apiKeyStatus: "missing" | "verified" | "failed";
  apiKeyVerifiedAt?: number;
  apiKeyError?: string;
  voiceRefreshError?: string;
  voices: MiniMaxVoice[];
  preferredVoicesByLanguage: Partial<Record<DetectedLanguage, string>>;
}

export type AppSettingsPatch = Partial<Omit<AppSettings, "historyRetention">>;

export interface BootstrapState {
  hasCompletedOnboarding: boolean;
  lastRoute: AppRoute;
}

export interface ReadingHistoryRecord {
  id: string;
  createdAt: number;
  text: string;
  preview: string;
  durationEstimateSeconds: number;
  languageSummary: string;
  source: ReadingSource;
}

export interface FavoriteRecord {
  id: string;
  favoritedAt: number;
  sourceCreatedAt: number;
  text: string;
  preview: string;
  durationEstimateSeconds: number;
  languageSummary: string;
  source: ReadingSource;
}

export interface MiniMaxSetupResult {
  ok: boolean;
  settings: AppSettings;
  error?: string;
  usedCachedVoices?: boolean;
}

export interface PlaybackStartResult {
  started: boolean;
  skipped?:
    | "empty_clipboard"
    | "missing_api_key"
    | "unverified_api_key"
    | "missing_voice"
    | "missing_history_record"
    | "missing_favorite_record";
  sessionId?: number;
  stopShortcutAvailable?: boolean;
}

export const PLAYBACK_FEEDBACK_SURFACES = {
  playbackOverlay: "playback_overlay",
  historyDetail: "history_detail",
  favoriteDetail: "favorite_detail"
} as const;

export type PlaybackFeedbackSurface =
  (typeof PLAYBACK_FEEDBACK_SURFACES)[keyof typeof PLAYBACK_FEEDBACK_SURFACES];

export function usesPlaybackOverlayFeedback(surface: PlaybackFeedbackSurface): boolean {
  return surface === PLAYBACK_FEEDBACK_SURFACES.playbackOverlay;
}

export interface ShortcutUpdateResult {
  ok: boolean;
  settings: AppSettings;
  error?: string;
}

export interface PlaybackAudioSession {
  sessionId: number;
  speechRate: number;
  feedbackSurface: PlaybackFeedbackSurface;
  segmentWeights: number[];
}

export interface AudioChunkPayload {
  sessionId: number;
  bytes: Uint8Array;
}

export interface SessionPayload {
  sessionId: number;
}

export interface OverlayMetric {
  amplitude: number;
  levels?: number[];
  progress: number;
}

export interface SessionOverlayMetric extends OverlayMetric {
  sessionId: number;
}
