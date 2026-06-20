import type { DetectedLanguage, MiniMaxVoice, ReadingSource } from "./types.js";

export type AppRoute = "home" | "history" | "settings";

export type HistoryRetention = "7d" | "1m" | "3m" | "forever";

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

export interface MiniMaxSetupResult {
  ok: boolean;
  settings: AppSettings;
  error?: string;
  usedCachedVoices?: boolean;
}

export interface PlaybackStartResult {
  started: boolean;
  skipped?: "empty_clipboard" | "missing_api_key" | "unverified_api_key" | "missing_voice" | "missing_history_record";
  sessionId?: number;
}

export const PLAYBACK_FEEDBACK_SURFACES = {
  playbackOverlay: "playback_overlay",
  historyDetail: "history_detail"
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
  progress: number;
}

export interface ReaderWindowBridge {
  getBootstrapState: () => Promise<BootstrapState>;
  setOnboardingComplete: (complete: boolean) => Promise<void>;
  setRoute: (route: AppRoute) => Promise<void>;
  onNavigate: (listener: (route: AppRoute) => void) => () => void;
  getSettings: () => Promise<AppSettings>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  setLaunchAtLogin: (launchAtLogin: boolean) => Promise<AppSettings>;
  setActivationShortcut: (shortcut: string) => Promise<ShortcutUpdateResult>;
  setMiniMaxApiKey: (apiKey: string) => Promise<void>;
  clearMiniMaxApiKey: () => Promise<void>;
  hasMiniMaxApiKey: () => Promise<boolean>;
  verifyMiniMaxKey: () => Promise<MiniMaxSetupResult>;
  refreshVoices: () => Promise<MiniMaxSetupResult>;
  setPreferredVoice: (language: DetectedLanguage, voiceId: string) => Promise<AppSettings>;
  getErrorLogCount: () => Promise<number>;
  clearErrorLog: () => Promise<void>;
  getReadingHistoryCount: () => Promise<number>;
  listReadingHistory: () => Promise<ReadingHistoryRecord[]>;
  deleteReadingHistoryRecord: (id: string) => Promise<void>;
  clearReadingHistory: () => Promise<void>;
  playReadingTarget: () => Promise<PlaybackStartResult>;
  playHistoryRecord: (id: string) => Promise<PlaybackStartResult>;
  stopPlayback: () => Promise<void>;
  copyText: (text: string) => Promise<void>;
}

export interface RendererAudioBridge {
  onPlaybackStart: (listener: (session: PlaybackAudioSession) => void) => () => void;
  onAudioChunk: (listener: (payload: AudioChunkPayload) => void) => () => void;
  onSegmentEnd: (listener: (payload: SessionPayload) => void) => () => void;
  onPlaybackFinish: (listener: (payload: SessionPayload) => void) => () => void;
  onPlaybackFail: (listener: (payload: SessionPayload) => void) => () => void;
  onPlaybackStop: (listener: (payload: SessionPayload) => void) => () => void;
  notifyPlaybackIdle: (sessionId: number) => Promise<void>;
  sendOverlayMetric: (metric: OverlayMetric) => Promise<void>;
  finishOverlayPlayback: () => Promise<void>;
}

export interface PlaybackOverlayBridge {
  stopPlayback: () => Promise<void>;
  onOverlayShow: (listener: () => void) => () => void;
  onOverlayMetric: (listener: (metric: OverlayMetric) => void) => () => void;
  onOverlayFinish: (listener: () => void) => () => void;
  onOverlayFail: (listener: () => void) => () => void;
  onOverlayStop: (listener: () => void) => () => void;
}

export type VoiceReaderBridge = ReaderWindowBridge & RendererAudioBridge & PlaybackOverlayBridge;
