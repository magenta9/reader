import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  nativeImage,
  clipboard,
  globalShortcut
} from "electron";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AppDataStore } from "./data/app-data-store.js";
import { MiniMaxAccountService } from "./data/minimax-account-service.js";
import type { DetectedLanguage } from "../shared/types.js";
import type {
  AppRoute,
  AppSettings,
  BootstrapState,
  OverlayDragDelta,
  OverlayMetric
} from "../shared/app-contracts.js";
import { PlaybackService } from "./playback/playback-service.js";
import { ElectronAudioSink } from "./playback/electron-audio-sink.js";
import { PlaybackOverlayController } from "./playback/playback-overlay-controller.js";
import { PlaybackCommandController } from "./playback/playback-command-controller.js";
import { ReadingTargetAcquirer } from "./reading-target/reading-target-acquirer.js";

let readerWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let pendingRoute: AppRoute = "home";
let isQuitting = false;
let appDataStore: AppDataStore;
let minimaxAccountService: MiniMaxAccountService;
let playbackCommands: PlaybackCommandController;
let overlayController: PlaybackOverlayController;

const mainBundleDir = dirname(fileURLToPath(import.meta.url));
const rendererEntry = join(mainBundleDir, "../renderer/index.html");
const appIconAssetPath = join(mainBundleDir, "../assets/voicereader-icon.svg");
const trayIconAssetPath = join(mainBundleDir, "../assets/voicereader-template-icon.svg");
const fallbackTemplateTrayIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><g transform="rotate(-18 9 9)"><ellipse cx="9" cy="9" rx="6.4" ry="4.7" fill="none" stroke="black" stroke-linecap="round" stroke-width="3.2"/></g></svg>`;

app.setName("VoiceReader");
app.setPath("userData", join(app.getPath("appData"), "VoiceReader"));

void bootstrap();

async function bootstrap(): Promise<void> {
  await app.whenReady();

  appDataStore = new AppDataStore(join(app.getPath("userData"), "voicereader.sqlite"));
  minimaxAccountService = new MiniMaxAccountService(appDataStore);
  overlayController = new PlaybackOverlayController();
  const readingTargetAcquirer = new ReadingTargetAcquirer({
    clipboard,
    errorLog: appDataStore,
    hidePreviousAppForSelectionCapture: hideReaderAppForSelectionCapture
  });
  const playbackService = new PlaybackService(appDataStore, new ElectronAudioSink(() => readerWindow, overlayController));
  playbackCommands = new PlaybackCommandController(
    appDataStore,
    playbackService,
    globalShortcut,
    () => readingTargetAcquirer.acquire()
  );
  registerIpcHandlers(readingTargetAcquirer);
  syncLaunchAtLoginFromSettings();
  syncDockIcon();
  createMenuBarMenu();
  playbackCommands.registerActivationShortcut();

  const bootstrapState = readBootstrapState();
  if (shouldOpenWindowAtStartup(bootstrapState)) {
    openReaderWindow(bootstrapState.lastRoute);
  }

  app.on("activate", () => {
    openReaderWindow(readBootstrapState().lastRoute);
  });

  app.on("before-quit", () => {
    isQuitting = true;
    globalShortcut.unregisterAll();
    overlayController.destroy();
    appDataStore.close();
  });

  app.on("window-all-closed", () => {
    // VoiceReader is a menu bar app; closing the window should not quit the app.
  });
}

function openReaderWindow(route: AppRoute): void {
  pendingRoute = route;

  if (!readerWindow || readerWindow.isDestroyed()) {
    readerWindow = new BrowserWindow({
      title: "VoiceReader",
      width: 1100,
      height: 760,
      minWidth: 900,
      minHeight: 620,
      show: false,
      backgroundColor: "#f5f5f3",
      trafficLightPosition: { x: 18, y: 18 },
      webPreferences: {
        preload: join(mainBundleDir, "../preload/preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    readerWindow.on("close", (event) => {
      if (isQuitting) return;
      event.preventDefault();
      readerWindow?.hide();
    });

    readerWindow.once("ready-to-show", () => {
      readerWindow?.show();
      readerWindow?.focus();
      sendRoute(pendingRoute);
    });

    readerWindow.webContents.on("did-finish-load", () => {
      sendRoute(pendingRoute);
    });

    void readerWindow.loadFile(rendererEntry);
    return;
  }

  if (readerWindow.isMinimized()) readerWindow.restore();
  readerWindow.show();
  readerWindow.focus();
  sendRoute(route);
}

function sendRoute(route: AppRoute): void {
  if (!readerWindow || readerWindow.isDestroyed()) return;
  appDataStore.updateSettings({ lastRoute: route });
  readerWindow.webContents.send("app-shell:navigate", route);
}

function registerIpcHandlers(readingTargetAcquirer: ReadingTargetAcquirer): void {
  ipcMain.handle("app-shell:get-bootstrap-state", () => readBootstrapState());
  ipcMain.handle("app-shell:set-route", (_event, route: AppRoute) => {
    pendingRoute = route;
    appDataStore.updateSettings({ lastRoute: route });
  });
  ipcMain.handle("app-shell:set-onboarding-complete", (_event, complete: boolean) => {
    appDataStore.updateSettings({ hasCompletedOnboarding: complete });
  });
  ipcMain.handle("app-data:get-settings", () => appDataStore.getSettings());
  ipcMain.handle("app-data:update-settings", (_event, patch: Partial<AppSettings>) =>
    appDataStore.updateSettings(patch)
  );
  ipcMain.handle("app-data:set-launch-at-login", (_event, launchAtLogin: boolean) => {
    app.setLoginItemSettings({ openAtLogin: launchAtLogin });
    return appDataStore.updateSettings({ launchAtLogin });
  });
  ipcMain.handle("app-data:set-activation-shortcut", (_event, shortcut: string) =>
    playbackCommands.setActivationShortcut(shortcut)
  );
  ipcMain.handle("app-data:set-minimax-api-key", (_event, apiKey: string) => {
    appDataStore.saveMiniMaxApiKey(apiKey);
  });
  ipcMain.handle("app-data:clear-minimax-api-key", () => {
    appDataStore.clearMiniMaxApiKey();
  });
  ipcMain.handle("app-data:has-minimax-api-key", () => appDataStore.hasMiniMaxApiKey());
  ipcMain.handle("app-data:verify-minimax-key", () => minimaxAccountService.verifyApiKey());
  ipcMain.handle("app-data:refresh-voices", () => minimaxAccountService.refreshVoices());
  ipcMain.handle("app-data:set-preferred-voice", (_event, language: DetectedLanguage, voiceId: string) =>
    minimaxAccountService.setPreferredVoice(language, voiceId)
  );
  ipcMain.handle("app-data:get-error-log-count", () => appDataStore.getErrorLogCount());
  ipcMain.handle("app-data:clear-error-log", () => appDataStore.clearErrorLogs());
  ipcMain.handle("app-data:get-reading-history-count", () => appDataStore.getReadingHistoryCount());
  ipcMain.handle("app-data:list-reading-history", () => appDataStore.listReadingHistoryRecords());
  ipcMain.handle("app-data:delete-reading-history-record", (_event, id: string) =>
    appDataStore.deleteReadingHistoryRecord(id)
  );
  ipcMain.handle("app-data:clear-reading-history", () => appDataStore.clearReadingHistory());
  ipcMain.handle("app-data:create-favorite-from-history-record", (_event, id: string) =>
    appDataStore.createFavoriteFromHistoryRecord(id)
  );
  ipcMain.handle("app-data:list-favorites", () => appDataStore.listFavoriteRecords());
  ipcMain.handle("app-data:delete-favorite-record", (_event, id: string) =>
    appDataStore.deleteFavoriteRecord(id)
  );
  ipcMain.handle("playback:play-reading-target", async (event) => {
    if (shouldRevealPreviousAppBeforeSelectionCapture(event.sender.id)) {
      await readingTargetAcquirer.revealPreviousAppBeforeCapture();
    }
    return playbackCommands.startReadingTargetPlayback();
  });
  ipcMain.handle("playback:play-history-record", (_event, id: string) => playbackCommands.startHistoryReplay(id));
  ipcMain.handle("playback:play-favorite-record", (_event, id: string) =>
    playbackCommands.startFavoriteReplay(id)
  );
  ipcMain.handle("playback:stop", () => {
    playbackCommands.stopPlayback();
  });
  ipcMain.handle("playback:renderer-idle", (_event, sessionId: number) => {
    playbackCommands.handleRendererIdle(sessionId);
  });
  ipcMain.handle("clipboard:write-text", (_event, text: string) => {
    clipboard.writeText(text);
  });
  ipcMain.handle("overlay:metric", (_event, metric: OverlayMetric) => {
    overlayController.sendMetric(metric);
  });
  ipcMain.handle("overlay:move-by", (_event, delta: OverlayDragDelta) => {
    overlayController.moveBy(delta);
  });
  ipcMain.handle("overlay:finish-playback", () => {
    overlayController.finish();
  });
}

function createMenuBarMenu(): void {
  tray = new Tray(createTemplateTrayIcon());
  tray.setToolTip("VoiceReader");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "播放",
        click: () => {
          void playbackCommands.startReadingTargetPlayback();
        }
      },
      {
        label: "打开 VoiceReader",
        click: () => openReaderWindow("home")
      },
      {
        label: "历史记录",
        click: () => openReaderWindow("history")
      },
      {
        label: "收藏",
        click: () => openReaderWindow("favorites")
      },
      {
        label: "设置",
        click: () => openReaderWindow("settings")
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
}

function createTemplateTrayIcon(): Electron.NativeImage {
  const image = nativeImage.createFromDataURL(svgDataUrl(readAssetText(trayIconAssetPath, fallbackTemplateTrayIconSvg)));
  image.setTemplateImage(true);
  return image;
}

function syncDockIcon(): void {
  if (!app.dock) return;
  const image = nativeImage.createFromDataURL(svgDataUrl(readAssetText(appIconAssetPath)));
  if (!image.isEmpty()) app.dock.setIcon(image);
}

function readAssetText(path: string, fallback = ""): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return fallback;
  }
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function readBootstrapState(): BootstrapState {
  const settings = appDataStore.getSettings();
  return {
    hasCompletedOnboarding: settings.hasCompletedOnboarding,
    lastRoute: settings.lastRoute
  };
}

function shouldOpenWindowAtStartup(bootstrapState: BootstrapState): boolean {
  if (!bootstrapState.hasCompletedOnboarding) return true;
  return !app.getLoginItemSettings().wasOpenedAtLogin;
}

function syncLaunchAtLoginFromSettings(): void {
  app.setLoginItemSettings({ openAtLogin: appDataStore.getSettings().launchAtLogin });
}

function shouldRevealPreviousAppBeforeSelectionCapture(senderWebContentsId: number): boolean {
  return Boolean(
    readerWindow &&
      !readerWindow.isDestroyed() &&
      readerWindow.webContents.id === senderWebContentsId &&
      readerWindow.isFocused()
  );
}

function hideReaderAppForSelectionCapture(): void {
  if (process.platform === "darwin") {
    app.hide();
    return;
  }
  readerWindow?.hide();
}
