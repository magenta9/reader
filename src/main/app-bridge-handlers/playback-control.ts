import { PLAYBACK_CONTROL_CHANNELS } from "../../shared/bridge-contracts.js";
import type { AppBridgeHandlerDependencies } from "./dependencies.js";

type PlaybackControlHandlerDependencies = Pick<
  AppBridgeHandlerDependencies,
  "ipcMain" | "playbackCommands" | "readingTargetAcquirer" | "shouldRevealPreviousAppBeforeSelectionCapture"
>;

export function registerPlaybackControlHandlers({
  ipcMain,
  playbackCommands,
  readingTargetAcquirer,
  shouldRevealPreviousAppBeforeSelectionCapture
}: PlaybackControlHandlerDependencies): void {
  ipcMain.handle(PLAYBACK_CONTROL_CHANNELS.playReadingTarget, async (event) => {
    if (shouldRevealPreviousAppBeforeSelectionCapture(event.sender.id)) {
      await readingTargetAcquirer.revealPreviousAppBeforeCapture();
    }
    return playbackCommands.startReadingTargetPlayback();
  });
  ipcMain.handle(PLAYBACK_CONTROL_CHANNELS.playHistoryRecord, (_event, id: string) =>
    playbackCommands.startHistoryReplay(id)
  );
  ipcMain.handle(PLAYBACK_CONTROL_CHANNELS.playFavoriteRecord, (_event, id: string) =>
    playbackCommands.startFavoriteReplay(id)
  );
  ipcMain.handle(PLAYBACK_CONTROL_CHANNELS.stop, () => {
    playbackCommands.stopPlayback();
  });
}
