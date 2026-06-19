import type { DetectedLanguage, MiniMaxVoice } from "../shared/types.js";

export type AppRoute = "home" | "history" | "settings";

export interface BootstrapState {
  hasCompletedOnboarding: boolean;
  lastRoute: AppRoute;
}

export type HistoryRetention = "7d" | "1m" | "3m" | "forever";

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

export interface ReadingHistoryRecord {
  id: string;
  createdAt: number;
  text: string;
  preview: string;
  durationEstimateSeconds: number;
  languageSummary: string;
  source: "clipboard";
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

export interface ShortcutUpdateResult {
  ok: boolean;
  settings: AppSettings;
  error?: string;
}

export interface PlaybackSessionInfo {
  sessionId: number;
  target: {
    title: string;
    url: string;
    source: "clipboard";
    text: string;
  };
  speechRate: number;
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

export interface VoiceReaderBridge {
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
  playClipboard: () => Promise<PlaybackStartResult>;
  playHistoryRecord: (id: string) => Promise<PlaybackStartResult>;
  stopPlayback: () => Promise<void>;
  notifyPlaybackIdle: (sessionId: number) => Promise<void>;
  copyText: (text: string) => Promise<void>;
  onPlaybackStart: (listener: (session: PlaybackSessionInfo) => void) => () => void;
  onAudioChunk: (listener: (payload: AudioChunkPayload) => void) => () => void;
  onSegmentEnd: (listener: (payload: SessionPayload) => void) => () => void;
  onPlaybackFinish: (listener: (payload: SessionPayload) => void) => () => void;
  onPlaybackFail: (listener: (payload: SessionPayload) => void) => () => void;
  onPlaybackStop: (listener: (payload: SessionPayload) => void) => () => void;
  sendOverlayMetric: (metric: OverlayMetric) => Promise<void>;
  finishOverlayPlayback: () => Promise<void>;
  onOverlayShow: (listener: () => void) => () => void;
  onOverlayMetric: (listener: (metric: OverlayMetric) => void) => () => void;
  onOverlayFinish: (listener: () => void) => () => void;
  onOverlayFail: (listener: () => void) => () => void;
  onOverlayStop: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    voiceReader: VoiceReaderBridge;
  }
}
