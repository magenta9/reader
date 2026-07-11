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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { registerAppBridgeHandlers } from "./app-bridge-handlers.js";
import { AppPresenceController } from "./app-presence-controller.js";
import { AppDataStore } from "./data/app-data-store.js";
import { MiniMaxAccountService } from "./data/minimax-account-service.js";
import { APP_SHELL_CHANNELS } from "../shared/bridge-contracts.js";
import type {
  AppRoute,
  BootstrapState
} from "../shared/app-contracts.js";
import { PlaybackService } from "./playback/playback-service.js";
import { ElectronPlaybackOutput } from "./playback/electron-playback-output.js";
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
let playbackOutput: ElectronPlaybackOutput;
let overlayController: PlaybackOverlayController;
let appPresence: AppPresenceController;

const mainBundleDir = dirname(fileURLToPath(import.meta.url));
const rendererEntry = join(mainBundleDir, "../renderer/index.html");
const playbackRendererEntry = join(mainBundleDir, "../playback-renderer/index.html");
const appIconAssetPath = join(mainBundleDir, "../assets/voicereader-icon.svg");
const TRAY_ICON_SIZE = 18;
const TRAY_ICON_SCALE = 2;
const TRAY_ICON_CENTER = TRAY_ICON_SIZE / 2;
const TRAY_ICON_ROTATION_RADIANS = (18 * Math.PI) / 180;
const TRAY_ICON_ELLIPSE_RADIUS_X = 6.75;
const TRAY_ICON_ELLIPSE_RADIUS_Y = 4.95;
const TRAY_ICON_FILL_EDGE = 1.035;
const TRAY_ICON_FILL_FEATHER = 0.07;
const TRAY_ICON_LINE_WIDTH = 1.05;
const TRAY_ICON_LINE_CAP_FEATHER = 0.28;
const TRAY_ICON_LINE_EDGE_FEATHER = 0.56;
const TRAY_ICON_FILL_COLOR = { r: 247, g: 247, b: 244, a: 255 };
const TRAY_ICON_INK_COLOR = { r: 17, g: 17, b: 17, a: 188 };
const TRAY_ICON_LINES = [
  { x1: 6.5, y1: 7.05, x2: 11.5, y2: 7.05 },
  { x1: 5.8, y1: 9, x2: 12.2, y2: 9 },
  { x1: 6.9, y1: 10.95, x2: 11.1, y2: 10.95 }
];

app.setName("VoiceReader");
app.setPath("userData", join(app.getPath("appData"), "VoiceReader"));

void bootstrap();

async function bootstrap(): Promise<void> {
  await app.whenReady();

  appDataStore = new AppDataStore(join(app.getPath("userData"), "voicereader.sqlite"));
  minimaxAccountService = new MiniMaxAccountService(appDataStore);
  overlayController = new PlaybackOverlayController();
  appPresence = new AppPresenceController({
    app,
    nativeImage,
    getReaderWindow: () => readerWindow
  });
  const readingTargetAcquirer = new ReadingTargetAcquirer({
    clipboard,
    errorLog: appDataStore,
    hidePreviousAppForSelectionCapture: () => appPresence.hideForSelectionCapture()
  });
  playbackOutput = await ElectronPlaybackOutput.create({
    createPlaybackRenderer: createPlaybackRendererWindow,
    getReaderWindow: () => readerWindow,
    overlay: overlayController,
    playbackRendererEntry
  });
  const playbackService = new PlaybackService(appDataStore, playbackOutput);
  playbackCommands = new PlaybackCommandController(
    appDataStore,
    playbackService,
    globalShortcut,
    () => readingTargetAcquirer.acquire()
  );
  registerAppBridgeHandlers({
    app,
    appDataStore,
    clipboard,
    ipcMain,
    minimaxAccountService,
    overlayController,
    playbackCommands,
    readingTargetAcquirer,
    readBootstrapState,
    setPendingRoute: (route) => {
      pendingRoute = route;
    },
    shouldRevealPreviousAppBeforeSelectionCapture
  });
  syncLaunchAtLoginFromSettings();
  appPresence.ensureDockVisible();
  appPresence.setDockIconFromSvg(appIconAssetPath);
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
    playbackOutput.destroy();
    overlayController.destroy();
    appDataStore.close();
  });

  app.on("window-all-closed", () => {
    // VoiceReader is a menu bar app; closing the window should not quit the app.
  });
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
      preload: join(mainBundleDir, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });
}

function openReaderWindow(route: AppRoute): void {
  appPresence.ensureDockVisible();
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
      titleBarStyle: "hiddenInset",
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
  readerWindow.webContents.send(APP_SHELL_CHANNELS.navigate, route);
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
  const image = nativeImage.createFromBuffer(createTrayIconPngBuffer(), {
    width: TRAY_ICON_SIZE,
    height: TRAY_ICON_SIZE,
    scaleFactor: TRAY_ICON_SCALE
  });
  image.setTemplateImage(false);
  return image;
}

function createTrayIconPngBuffer(): Buffer {
  const width = TRAY_ICON_SIZE * TRAY_ICON_SCALE;
  const height = TRAY_ICON_SIZE * TRAY_ICON_SCALE;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const cos = Math.cos(TRAY_ICON_ROTATION_RADIANS);
  const sin = Math.sin(TRAY_ICON_ROTATION_RADIANS);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const logicalX = (x + 0.5) / TRAY_ICON_SCALE;
      const logicalY = (y + 0.5) / TRAY_ICON_SCALE;
      const translatedX = logicalX - TRAY_ICON_CENTER;
      const translatedY = logicalY - TRAY_ICON_CENTER;
      const rotatedX = translatedX * cos - translatedY * sin + TRAY_ICON_CENTER;
      const rotatedY = translatedX * sin + translatedY * cos + TRAY_ICON_CENTER;
      const ellipseDistance = Math.hypot(
        (rotatedX - TRAY_ICON_CENTER) / TRAY_ICON_ELLIPSE_RADIUS_X,
        (rotatedY - TRAY_ICON_CENTER) / TRAY_ICON_ELLIPSE_RADIUS_Y
      );
      const fillAlpha = clamp((TRAY_ICON_FILL_EDGE - ellipseDistance) / TRAY_ICON_FILL_FEATHER, 0, 1);
      if (fillAlpha > 0) {
        blendPixel(pixels, width, x, y, TRAY_ICON_FILL_COLOR, fillAlpha);
      }

      const lineAlpha = Math.max(
        ...TRAY_ICON_LINES.map((line) =>
          lineCoverage(rotatedX, rotatedY, line.x1, line.y1, line.x2, line.y2, TRAY_ICON_LINE_WIDTH)
        )
      );
      if (lineAlpha > 0) {
        blendPixel(pixels, width, x, y, TRAY_ICON_INK_COLOR, lineAlpha);
      }
    }
  }

  return encodePng(width, height, pixels);
}

function lineCoverage(x: number, y: number, x1: number, y1: number, x2: number, y2: number, strokeWidth: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const progress = lengthSquared === 0 ? 0 : clamp(((x - x1) * dx + (y - y1) * dy) / lengthSquared, 0, 1);
  const nearestX = x1 + progress * dx;
  const nearestY = y1 + progress * dy;
  const distance = Math.hypot(x - nearestX, y - nearestY);
  return clamp(
    (strokeWidth / 2 + TRAY_ICON_LINE_CAP_FEATHER - distance) / TRAY_ICON_LINE_EDGE_FEATHER,
    0,
    1
  );
}

function blendPixel(
  pixels: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  color: { r: number; g: number; b: number; a: number },
  coverage: number
): void {
  const offset = (y * width + x) * 4;
  const sourceAlpha = (color.a / 255) * coverage;
  const targetAlpha = pixels[offset + 3] / 255;
  const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
  if (outputAlpha === 0) return;
  pixels[offset] = (color.r * sourceAlpha + pixels[offset] * targetAlpha * (1 - sourceAlpha)) / outputAlpha;
  pixels[offset + 1] = (color.g * sourceAlpha + pixels[offset + 1] * targetAlpha * (1 - sourceAlpha)) / outputAlpha;
  pixels[offset + 2] = (color.b * sourceAlpha + pixels[offset + 2] * targetAlpha * (1 - sourceAlpha)) / outputAlpha;
  pixels[offset + 3] = outputAlpha * 255;
}

function encodePng(width: number, height: number, pixels: Uint8ClampedArray): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    Buffer.from(pixels.buffer, y * width * 4, width * 4).copy(raw, rowStart + 1);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", Buffer.concat([uint32(width), uint32(height), Buffer.from([8, 6, 0, 0, 0])])),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  return Buffer.concat([uint32(data.length), typeBuffer, data, uint32(crc32(Buffer.concat([typeBuffer, data])))]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
