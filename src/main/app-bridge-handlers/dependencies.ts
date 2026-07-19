import type { App, Clipboard, IpcMain } from "electron";
import type { AppRoute, BootstrapState } from "../../shared/app-contracts.js";
import type { AppDataStore } from "../data/app-data-store.js";
import type { MiniMaxAccountService } from "../data/minimax-account-service.js";
import type { PlaybackPreferencesCommands } from "../data/playback-preferences-commands.js";
import type { PlaybackCommandController } from "../playback/playback-command-controller.js";
import type { PlaybackOverlayController } from "../playback/playback-overlay-controller.js";
import type { ReadingTargetAcquirer } from "../reading-target/reading-target-acquirer.js";

export interface AppBridgeHandlerDependencies {
  app: App;
  appDataStore: AppDataStore;
  clipboard: Clipboard;
  ipcMain: IpcMain;
  minimaxAccountService: MiniMaxAccountService;
  playbackPreferences: PlaybackPreferencesCommands;
  overlayController: PlaybackOverlayController;
  playbackCommands: PlaybackCommandController;
  readingTargetAcquirer: ReadingTargetAcquirer;
  readBootstrapState: () => BootstrapState;
  setPendingRoute: (route: AppRoute) => void;
  shouldRevealPreviousAppBeforeSelectionCapture: (senderWebContentsId: number) => boolean;
}
