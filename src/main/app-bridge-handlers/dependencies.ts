import type { Clipboard, IpcMain } from "electron";
import type { AppDataStore } from "../data/app-data-store.js";
import type { LaunchAtLoginCommands } from "../data/launch-at-login-commands.js";
import type { MiniMaxAccountService } from "../data/minimax-account-service.js";
import type { PlaybackPreferencesCommands } from "../data/playback-preferences-commands.js";
import type { PlaybackCommandController } from "../playback/playback-command-controller.js";
import type { PlaybackOverlayController } from "../playback/playback-overlay-controller.js";
import type { ReaderAppShellController } from "../reader-app-shell-controller.js";

export interface AppBridgeHandlerDependencies {
  appDataStore: AppDataStore;
  clipboard: Clipboard;
  ipcMain: IpcMain;
  launchAtLoginCommands: LaunchAtLoginCommands;
  minimaxAccountService: MiniMaxAccountService;
  playbackPreferences: PlaybackPreferencesCommands;
  overlayController: PlaybackOverlayController;
  playbackCommands: PlaybackCommandController;
  readerAppShell: Pick<
    ReaderAppShellController,
    "acceptRendererRoute" | "getBootstrapState" | "setOnboardingComplete"
  >;
}
