export type ReadingSource = "clipboard";

export type DetectedLanguage = "zh" | "en" | "ja" | "ko" | "latin" | "unknown";

export type PlaybackPhase =
  | "idle"
  | "extracting"
  | "starting"
  | "streaming"
  | "playing"
  | "stopping"
  | "error";

export interface ReadingSegment {
  id: string;
  text: string;
  language: DetectedLanguage;
}

export interface ReadingTarget {
  title: string;
  url: string;
  source: ReadingSource;
  text: string;
  segments: ReadingSegment[];
}

export interface MiniMaxVoice {
  voice_id: string;
  display_name: string;
  language: DetectedLanguage;
  raw?: unknown;
}

export interface ReaderSettings {
  apiKey: string;
  apiKeyVerifiedAt?: number;
  apiKeyStatus?: "missing" | "verified" | "failed";
  apiKeyError?: string;
  model: string;
  speechRate: number;
  voices: MiniMaxVoice[];
  preferredVoicesByLanguage: Partial<Record<DetectedLanguage, string>>;
}

export interface PlaybackStatus {
  phase: PlaybackPhase;
  title?: string;
  source?: ReadingSource;
  segmentIndex?: number;
  segmentCount?: number;
  language?: DetectedLanguage;
  voiceId?: string;
  error?: string;
}

export type MessageResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
