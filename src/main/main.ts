import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, clipboard, globalShortcut } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerAppRoleBridges } from "./app-role-bridges.js";
import { createElectronReaderAppShell } from "./electron-reader-app-shell.js";
import { AppDataStore } from "./data/app-data-store.js";
import { MiniMaxAccountService } from "./data/minimax-account-service.js";
import { PlaybackPreferencesCommands } from "./data/playback-preferences-commands.js";
import { PlaybackService } from "./playback/playback-service.js";
import { ElectronPlaybackOutput } from "./playback/electron-playback-output.js";
import { PlaybackOverlayController } from "./playback/playback-overlay-controller.js";
import { PlaybackCommandController } from "./playback/playback-command-controller.js";
import { streamMiniMaxSpeechAudio } from "../shared/minimax.js";
import { ReadingTargetAcquirer } from "./reading-target/reading-target-acquirer.js";
import {
  enterPackagedSmokeMode,
  readPackagedSmokeConfiguration
} from "./packaged-smoke-runtime.js";

const mainBundleDir = dirname(fileURLToPath(import.meta.url));
const rendererEntry = join(mainBundleDir, "../renderer/index.html");
const readerPreloadEntry = join(mainBundleDir, "../preload/reader-window.cjs");
const playbackRendererEntry = join(mainBundleDir, "../playback-renderer/index.html");
const appIconAssetPath = join(mainBundleDir, "../assets/voicereader-icon.svg");
const packagedSmoke = readPackagedSmokeConfiguration();

app.setName("VoiceReader");
if (packagedSmoke.enabled) {
  app.setPath("userData", packagedSmoke.userData);
} else {
  app.setPath("userData", join(app.getPath("appData"), "VoiceReader"));
}

void bootstrap().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  app.exit(1);
});

async function bootstrap(): Promise<void> {
  await app.whenReady();

  const databasePath = join(app.getPath("userData"), "voicereader.sqlite");
  const appDataStore = AppDataStore.open(databasePath);
  const minimaxAccountService = new MiniMaxAccountService(appDataStore);
  const playbackPreferences = new PlaybackPreferencesCommands(appDataStore);
  const overlayController = new PlaybackOverlayController();
  let playbackCommands!: PlaybackCommandController;
  let playbackOutput!: ElectronPlaybackOutput;
  const readerAppShell = createElectronReaderAppShell({
    app,
    appIconAssetPath,
    buildMenu: (template) => Menu.buildFromTemplate(template),
    createBrowserWindow: (options) => new BrowserWindow(options),
    createTray: (icon) => new Tray(icon),
    headless: packagedSmoke.enabled,
    nativeImage,
    playback: {
      play: async () => {
        await playbackCommands.startReadingTargetPlayback();
      },
      stop: () => playbackCommands.stopPlayback()
    },
    readerPreloadEntry,
    rendererEntry,
    shutdown: () => {
      globalShortcut.unregisterAll();
      playbackOutput.destroy();
      overlayController.destroy();
      appDataStore.close();
    },
    state: {
      read: () => appDataStore.getSettings(),
      setLastRoute: (route) => {
        appDataStore.updateSettings({ lastRoute: route });
      },
      setOnboardingComplete: (complete) => {
        appDataStore.updateSettings({ hasCompletedOnboarding: complete });
      }
    }
  });
  const readingTargetAcquirer = new ReadingTargetAcquirer({
    clipboard,
    errorLog: appDataStore,
    hidePreviousAppForSelectionCapture: () => readerAppShell.hideForSelectionCapture()
  });
  playbackOutput = await ElectronPlaybackOutput.create({
    createPlaybackRenderer: createPlaybackRendererWindow,
    readerFeedback: readerAppShell,
    overlay: overlayController,
    playbackRendererEntry
  });
  const playbackService = new PlaybackService(
    appDataStore,
    playbackOutput,
    streamMiniMaxSpeechAudio
  );
  playbackCommands = new PlaybackCommandController(
    appDataStore,
    playbackService,
    globalShortcut,
    () => readingTargetAcquirer.acquire()
  );
  registerAppRoleBridges({
    app,
    appDataStore,
    clipboard,
    ipcMain,
    minimaxAccountService,
    playbackPreferences,
    overlayController,
    playbackCommands,
    readingTargetAcquirer,
    readerAppShell
  });
  app.setLoginItemSettings({ openAtLogin: appDataStore.getSettings().launchAtLogin });
  playbackCommands.registerActivationShortcut();
  const readerAppShellInitialization = readerAppShell.start();
  if (packagedSmoke.enabled) {
    await readerAppShellInitialization;
    enterPackagedSmokeMode({
      app,
      appDataStore,
      databasePath,
      scenario: packagedSmoke.scenario
    });
  }
}

function createPlaybackRendererWindow(): BrowserWindow {
  return new BrowserWindow({
    title: "VoiceReader Playback Renderer",
    width: 1,
    height: 1,
    show: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: join(mainBundleDir, "../preload/playback-renderer.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });
}
