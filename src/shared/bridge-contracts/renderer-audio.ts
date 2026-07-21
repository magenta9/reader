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
