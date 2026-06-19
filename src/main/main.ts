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
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AppDataStore } from "./data/app-data-store.js";
import { electronSafeStorageCipher } from "./data/electron-safe-storage.js";
import { MiniMaxAccountService } from "./data/minimax-account-service.js";
import type { DetectedLanguage } from "../shared/types.js";
import type {
  AppRoute,
  AppSettings,
  BootstrapState,
  OverlayMetric,
  PlaybackStartResult,
  ShortcutUpdateResult
} from "../shared/app-contracts.js";
import { PlaybackService } from "./playback/playback-service.js";
import { ElectronAudioSink } from "./playback/electron-audio-sink.js";
import { PlaybackOverlayController } from "./playback/playback-overlay-controller.js";

let readerWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let pendingRoute: AppRoute = "home";
let isQuitting = false;
let appDataStore: AppDataStore;
let minimaxAccountService: MiniMaxAccountService;
let playbackService: PlaybackService;
let overlayController: PlaybackOverlayController;
let stopShortcutSessionId: number | undefined;

const mainBundleDir = dirname(fileURLToPath(import.meta.url));
const rendererEntry = join(mainBundleDir, "../renderer/index.html");

app.setName("VoiceReader");
app.setPath("userData", join(app.getPath("appData"), "VoiceReader"));

void bootstrap();

async function bootstrap(): Promise<void> {
  await app.whenReady();

  appDataStore = new AppDataStore(
    join(app.getPath("userData"), "voicereader.sqlite"),
    electronSafeStorageCipher
  );
  minimaxAccountService = new MiniMaxAccountService(appDataStore);
  overlayController = new PlaybackOverlayController();
  playbackService = new PlaybackService(appDataStore, new ElectronAudioSink(() => readerWindow, overlayController));
  registerIpcHandlers();
  syncLaunchAtLoginFromSettings();
  createMenuBarMenu();
  registerActivationShortcut();

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

function registerIpcHandlers(): void {
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
    setActivationShortcut(shortcut)
  );
  ipcMain.handle("app-data:set-minimax-api-key", (_event, apiKey: string) => {
    appDataStore.saveEncryptedMiniMaxApiKey(apiKey);
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
  ipcMain.handle("playback:play-clipboard", () => playCurrentClipboard());
  ipcMain.handle("playback:play-history-record", (_event, id: string) => playHistoryRecord(id));
  ipcMain.handle("playback:stop", () => {
    stopCurrentPlayback();
  });
  ipcMain.handle("playback:renderer-idle", (_event, sessionId: number) => {
    if (stopShortcutSessionId === sessionId) unregisterStopShortcut();
  });
  ipcMain.handle("clipboard:write-text", (_event, text: string) => {
    clipboard.writeText(text);
  });
  ipcMain.handle("overlay:metric", (_event, metric: OverlayMetric) => {
    overlayController.sendMetric(metric);
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
          void playCurrentClipboard();
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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><path fill="black" d="M2 11V7h3l4-3v10l-4-3H2Zm9-4c.8.9.8 3.1 0 4l1.2 1.2c1.5-1.6 1.5-4.8 0-6.4L11 7Zm2.4-2.4c2.4 2.5 2.4 6.3 0 8.8l1.2 1.2c3.1-3.2 3.1-8.8 0-12l-1.2 1.2Z"/></svg>`;
  const image = nativeImage.createFromDataURL(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  );
  image.setTemplateImage(true);
  return image;
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

async function playCurrentClipboard(): Promise<PlaybackStartResult> {
  const result = await playbackService.playClipboardText(await readSelectedTextOrClipboardText());
  if (result.started) {
    registerStopShortcut(result.sessionId);
  }
  return result;
}

async function playHistoryRecord(id: string): Promise<PlaybackStartResult> {
  const result = await playbackService.playHistoryRecord(id);
  if (result.started) {
    registerStopShortcut(result.sessionId);
  }
  return result;
}

function registerActivationShortcut(): void {
  const shortcut = appDataStore.getSettings().activationShortcut;
  globalShortcut.unregister(shortcut);
  const registered = globalShortcut.register(shortcut, () => {
    void playCurrentClipboard();
  });
  appDataStore.updateSettings({
    shortcutRegistrationError: registered ? undefined : "快捷键注册失败，可能已被其他应用占用。"
  });
}

function setActivationShortcut(shortcut: string): ShortcutUpdateResult {
  const nextShortcut = normalizeShortcutInput(shortcut);
  if (!nextShortcut) {
    const settings = appDataStore.updateSettings({
      shortcutRegistrationError: "快捷键需要包含 Command、Option、Control 或 Shift，并搭配一个按键。"
    });
    return { ok: false, settings, error: settings.shortcutRegistrationError };
  }

  const previousShortcut = appDataStore.getSettings().activationShortcut;
  globalShortcut.unregister(previousShortcut);
  const registered = globalShortcut.register(nextShortcut, () => {
    void playCurrentClipboard();
  });

  if (!registered) {
    globalShortcut.register(previousShortcut, () => {
      void playCurrentClipboard();
    });
    const settings = appDataStore.updateSettings({
      shortcutRegistrationError: "快捷键注册失败，可能已被其他应用占用。"
    });
    return { ok: false, settings, error: settings.shortcutRegistrationError };
  }

  const settings = appDataStore.updateSettings({
    activationShortcut: nextShortcut,
    shortcutRegistrationError: undefined
  });
  return { ok: true, settings };
}

function normalizeShortcutInput(shortcut: string): string | undefined {
  const parts = shortcut
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return undefined;
  const key = parts.at(-1);
  const modifiers = parts.slice(0, -1);
  if (!key || !modifiers.some((part) => ["Command", "CommandOrControl", "Control", "Option", "Alt", "Shift"].includes(part))) {
    return undefined;
  }
  return [...new Set(modifiers), key].join("+");
}

function registerStopShortcut(sessionId: number | undefined): void {
  stopShortcutSessionId = sessionId;
  globalShortcut.unregister("Escape");
  globalShortcut.register("Escape", () => {
    stopCurrentPlayback();
  });
}

function unregisterStopShortcut(): void {
  stopShortcutSessionId = undefined;
  globalShortcut.unregister("Escape");
}

function stopCurrentPlayback(): void {
  playbackService.stopSession(stopShortcutSessionId);
  unregisterStopShortcut();
}

async function readSelectedTextOrClipboardText(): Promise<string> {
  const snapshot = snapshotClipboard();
  const marker = `__VOICEREADER_SELECTION_${randomUUID()}__`;
  clipboard.writeText(marker);

  try {
    await copyCurrentSelection();
    await delay(80);
    const selectedText = clipboard.readText();
    if (selectedText.trim() && selectedText !== marker) {
      return restoreClipboardAndReturn(snapshot, selectedText);
    }
  } catch {
    // Selection capture needs macOS Automation/Accessibility permission. Fall back silently.
  }

  return restoreClipboardAndReturn(snapshot, snapshot.text);
}

function restoreClipboardAndReturn(snapshot: ClipboardSnapshot, text: string): string {
  restoreClipboard(snapshot);
  return text;
}

function copyCurrentSelection(): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      "/usr/bin/osascript",
      ["-e", 'tell application "System Events" to keystroke "c" using command down'],
      { timeout: 1200 },
      (error) => {
        if (error) reject(error);
        else resolve();
      }
    );
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

interface ClipboardSnapshot {
  text: string;
  html: string;
  rtf: string;
  image: Electron.NativeImage;
}

function snapshotClipboard(): ClipboardSnapshot {
  return {
    text: clipboard.readText(),
    html: clipboard.readHTML(),
    rtf: clipboard.readRTF(),
    image: clipboard.readImage()
  };
}

function restoreClipboard(snapshot: ClipboardSnapshot): void {
  clipboard.clear();
  clipboard.write({
    text: snapshot.text || undefined,
    html: snapshot.html || undefined,
    rtf: snapshot.rtf || undefined,
    image: snapshot.image.isEmpty() ? undefined : snapshot.image
  });
}
