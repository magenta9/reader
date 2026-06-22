import type { OverlayDragDelta, OverlayMetric } from "../app-contracts.js";

export const PLAYBACK_OVERLAY_EVENT_CHANNELS = {
  show: "overlay:show",
  metric: "overlay:metric",
  finish: "overlay:finish",
  fail: "overlay:fail",
  stop: "overlay:stop"
} as const;

export const PLAYBACK_OVERLAY_COMMAND_CHANNELS = {
  metric: "overlay:metric",
  moveBy: "overlay:move-by",
  finishPlayback: "overlay:finish-playback"
} as const;

export interface PlaybackOverlayBridge {
  onOverlayShow: (listener: () => void) => () => void;
  onOverlayMetric: (listener: (metric: OverlayMetric) => void) => () => void;
  onOverlayFinish: (listener: () => void) => () => void;
  onOverlayFail: (listener: () => void) => () => void;
  onOverlayStop: (listener: () => void) => () => void;
  moveOverlayBy: (delta: OverlayDragDelta) => Promise<void>;
}
