import type { PlaybackStartResult } from "../app-contracts.js";

export const PLAYBACK_CONTROL_CHANNELS = {
  playReadingTarget: "playback:play-reading-target",
  playHistoryRecord: "playback:play-history-record",
  playFavoriteRecord: "playback:play-favorite-record",
  stop: "playback:stop",
  rendererOutcome: "playback:renderer-outcome",
  rendererIdle: "playback:renderer-idle"
} as const;

export interface PlaybackControlBridge {
  playReadingTarget: () => Promise<PlaybackStartResult>;
  playHistoryRecord: (id: string) => Promise<PlaybackStartResult>;
  playFavoriteRecord: (id: string) => Promise<PlaybackStartResult>;
  stopPlayback: () => Promise<void>;
}
