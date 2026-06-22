import type { PlaybackStartResult } from "../../shared/app-contracts.js";
import { PLAYBACK_CONTROL_CHANNELS, type PlaybackControlBridge } from "../../shared/bridge-contracts.js";
import { invoke, type PreloadIpc } from "./ipc.js";

export function createPlaybackControlBridge(ipc: PreloadIpc): PlaybackControlBridge {
  return {
    playReadingTarget: () => invoke<PlaybackStartResult>(ipc, PLAYBACK_CONTROL_CHANNELS.playReadingTarget),
    playHistoryRecord: (id: string) =>
      invoke<PlaybackStartResult>(ipc, PLAYBACK_CONTROL_CHANNELS.playHistoryRecord, id),
    playFavoriteRecord: (id: string) =>
      invoke<PlaybackStartResult>(ipc, PLAYBACK_CONTROL_CHANNELS.playFavoriteRecord, id),
    stopPlayback: () => invoke<void>(ipc, PLAYBACK_CONTROL_CHANNELS.stop)
  };
}
