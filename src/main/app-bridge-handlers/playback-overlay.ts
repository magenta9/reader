import type { OverlayDragDelta, OverlayMetric } from "../../shared/app-contracts.js";
import { PLAYBACK_OVERLAY_COMMAND_CHANNELS } from "../../shared/bridge-contracts.js";
import type { AppBridgeHandlerDependencies } from "./dependencies.js";

type PlaybackOverlayHandlerDependencies = Pick<AppBridgeHandlerDependencies, "ipcMain" | "overlayController">;

export function registerPlaybackOverlayHandlers({
  ipcMain,
  overlayController
}: PlaybackOverlayHandlerDependencies): void {
  ipcMain.handle(PLAYBACK_OVERLAY_COMMAND_CHANNELS.metric, (_event, metric: OverlayMetric) => {
    overlayController.sendMetric(metric);
  });
  ipcMain.handle(PLAYBACK_OVERLAY_COMMAND_CHANNELS.moveBy, (_event, delta: OverlayDragDelta) => {
    overlayController.moveBy(delta);
  });
  ipcMain.handle(PLAYBACK_OVERLAY_COMMAND_CHANNELS.finishPlayback, () => {
    overlayController.finish();
  });
}
