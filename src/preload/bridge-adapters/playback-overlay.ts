import type { OverlayMetric } from "../../shared/app-contracts.js";
import {
  PLAYBACK_OVERLAY_COMMAND_CHANNELS,
  PLAYBACK_OVERLAY_EVENT_CHANNELS,
  type PlaybackOverlayBridge
} from "../../shared/bridge-contracts.js";
import { invoke, subscribe, subscribeVoid, type PreloadIpc } from "./ipc.js";

export function createPlaybackOverlayBridge(ipc: PreloadIpc): PlaybackOverlayBridge {
  return {
    onOverlayShow: (listener: () => void) =>
      subscribeVoid(ipc, PLAYBACK_OVERLAY_EVENT_CHANNELS.show, listener),
    onOverlayMetric: (listener: (metric: OverlayMetric) => void) =>
      subscribe(ipc, PLAYBACK_OVERLAY_EVENT_CHANNELS.metric, listener),
    onOverlayFinish: (listener: () => void) =>
      subscribeVoid(ipc, PLAYBACK_OVERLAY_EVENT_CHANNELS.finish, listener),
    onOverlayFail: (listener: () => void) =>
      subscribeVoid(ipc, PLAYBACK_OVERLAY_EVENT_CHANNELS.fail, listener),
    onOverlayStop: (listener: () => void) =>
      subscribeVoid(ipc, PLAYBACK_OVERLAY_EVENT_CHANNELS.stop, listener),
    notifyOverlayReady: () => invoke<void>(ipc, PLAYBACK_OVERLAY_COMMAND_CHANNELS.ready)
  };
}
