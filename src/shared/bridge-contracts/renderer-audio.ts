import type {
  AudioChunkPayload,
  PlaybackAudioOutcome,
  PlaybackAudioSession,
  SessionOverlayMetric,
  SessionPayload
} from "../app-contracts.js";

export const RENDERER_AUDIO_CHANNELS = {
  startSession: "playback:start-session",
  audioChunk: "playback:audio-chunk",
  endSegment: "playback:end-segment",
  endSessionAudio: "playback:end-session-audio",
  failSession: "playback:fail-session",
  stopSession: "playback:stop-session"
} as const;

export const PLAYBACK_FEEDBACK_CHANNELS = {
  finishSession: "playback:feedback-finish-session",
  failSession: "playback:feedback-fail-session",
  stopSession: "playback:feedback-stop-session"
} as const;

export interface PlaybackFeedbackBridge {
  onPlaybackFinish: (listener: (payload: SessionPayload) => void) => () => void;
  onPlaybackFail: (listener: (payload: SessionPayload) => void) => () => void;
  onPlaybackStop: (listener: (payload: SessionPayload) => void) => () => void;
}

export interface PlaybackRendererBridge {
  onPlaybackStart: (listener: (session: PlaybackAudioSession) => void) => () => void;
  onAudioChunk: (listener: (payload: AudioChunkPayload) => void) => () => void;
  onSegmentEnd: (listener: (payload: SessionPayload) => void) => () => void;
  onAudioInputEnd: (listener: (payload: SessionPayload) => void) => () => void;
  onPlaybackFail: (listener: (payload: SessionPayload) => void) => () => void;
  onPlaybackStop: (listener: (payload: SessionPayload) => void) => () => void;
  reportAudioOutcome: (outcome: PlaybackAudioOutcome) => Promise<void>;
  sendOverlayMetric: (metric: SessionOverlayMetric) => Promise<void>;
}
