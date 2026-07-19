import type { OverlayMetric } from "../app-contracts.js";

export const PLAYBACK_OVERLAY_EVENT_CHANNELS = {
  show: "overlay:show",
  metric: "overlay:metric",
  finish: "overlay:finish",
  fail: "overlay:fail",
  stop: "overlay:stop"
} as const;

export const PLAYBACK_OVERLAY_COMMAND_CHANNELS = {
  metric: "overlay:metric",
  ready: "overlay:ready"
} as const;

export const PLAYBACK_OVERLAY_TIMING = {
  transitionMs: 170,
  outcomeHoldMs: {
    finish: 360,
    fail: 1_400,
    stop: 240
  },
  controllerBufferMs: 30
} as const;

export interface PlaybackOverlayBridge {
  onOverlayShow: (listener: () => void) => () => void;
  onOverlayMetric: (listener: (metric: OverlayMetric) => void) => () => void;
  onOverlayFinish: (listener: () => void) => () => void;
  onOverlayFail: (listener: () => void) => () => void;
  onOverlayStop: (listener: () => void) => () => void;
  notifyOverlayReady: () => Promise<void>;
}
