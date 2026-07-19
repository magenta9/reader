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
  finishSession: "playback:finish-session",
  failSession: "playback:fail-session",
  stopSession: "playback:stop-session"
} as const;

export interface PlaybackFeedbackBridge {
  onPlaybackFinish: (listener: (payload: SessionPayload) => void) => () => void;
  onPlaybackFail: (listener: (payload: SessionPayload) => void) => () => void;
  onPlaybackStop: (listener: (payload: SessionPayload) => void) => () => void;
}

export interface PlaybackRendererBridge extends PlaybackFeedbackBridge {
  onPlaybackStart: (listener: (session: PlaybackAudioSession) => void) => () => void;
  onAudioChunk: (listener: (payload: AudioChunkPayload) => void) => () => void;
  onSegmentEnd: (listener: (payload: SessionPayload) => void) => () => void;
  reportAudioOutcome: (outcome: PlaybackAudioOutcome) => Promise<void>;
  notifyPlaybackIdle: (sessionId: number) => Promise<void>;
  sendOverlayMetric: (metric: SessionOverlayMetric) => Promise<void>;
  finishOverlayPlayback: (sessionId: number) => Promise<void>;
}
