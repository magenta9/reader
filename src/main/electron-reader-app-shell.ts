import type {
  App,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  Menu,
  MenuItemConstructorOptions,
  NativeImage,
  Tray
} from "electron";
import { deflateSync } from "node:zlib";

import { createReaderWindowEvents } from "./app-role-bridges.js";
import { AppPresenceController } from "./app-presence-controller.js";
import {
  ReaderAppShellController,
  type ReaderAppShellLifecycle,
  type ReaderAppShellMenu,
  type ReaderAppShellMenuActions,
  type ReaderAppShellOptions,
  type ReaderAppShellWindow,
  type ReaderAppShellWindowFactory
} from "./reader-app-shell-controller.js";

export interface ElectronReaderAppShellOptions {
  app: App;
  appIconAssetPath: string;
  buildMenu(template: MenuItemConstructorOptions[]): Menu;
  createBrowserWindow(options: BrowserWindowConstructorOptions): BrowserWindow;
  createTray(icon: NativeImage): Tray;
  headless?: boolean;
  nativeImage: {
    createFromBuffer(buffer: Buffer, options: Electron.CreateFromBufferOptions): NativeImage;
    createFromDataURL(dataUrl: string): NativeImage;
  };
  playback: ReaderAppShellOptions["playback"];
  readerPreloadEntry: string;
  rendererEntry: string;
  shutdown(): void;
  state: ReaderAppShellOptions["state"];
}

export function createElectronReaderAppShell(
  options: ElectronReaderAppShellOptions
): ReaderAppShellController {
  const windows = new ElectronReaderWindowFactory(options);
  const presence = new AppPresenceController({
    app: options.app,
    nativeImage: options.nativeImage,
    getReaderWindow: () => windows.current()
  });
  presence.ensureDockVisible();
  presence.setDockIconFromSvg(options.appIconAssetPath);

  return new ReaderAppShellController({
    state: options.state,
    windows,
    menu: createElectronReaderMenu(options),
    lifecycle: createElectronReaderLifecycle(options.app),
    presence: {
      ensureVisible: () => presence.ensureDockVisible(),
      hideForSelectionCapture: () => presence.hideForSelectionCapture()
    },
    playback: options.playback,
    shutdown: options.shutdown
  });
}

class ElectronReaderWindowFactory implements ReaderAppShellWindowFactory {
  private readerWindow: BrowserWindow | undefined;

  constructor(private readonly options: ElectronReaderAppShellOptions) {}

  create(): ReaderAppShellWindow {
    const window = this.options.createBrowserWindow(
      createReaderWindowOptions(this.options.readerPreloadEntry)
    );
    this.readerWindow = window;
    const events = createReaderWindowEvents(window.webContents);
    void window.loadFile(this.options.rendererEntry);

    return {
      senderId: window.webContents.id,
      isDestroyed: () => window.isDestroyed(),
      isFocused: () => !this.options.headless && window.isFocused(),
      isMinimized: () => window.isMinimized(),
      restore: () => window.restore(),
      show: () => {
        if (!this.options.headless) window.show();
      },
      focus: () => {
        if (!this.options.headless) window.focus();
      },
      hide: () => window.hide(),
      sendRoute: (snapshot) => events.emitNavigate(snapshot),
      sendPlaybackFinish: (sessionId) => events.emitPlaybackFinish({ sessionId }),
      sendPlaybackFail: (sessionId) => events.emitPlaybackFail({ sessionId }),
      sendPlaybackStop: (sessionId) => events.emitPlaybackStop({ sessionId }),
      onClose: (listener) => registerListener(window, "close", listener),
      onReady: (listener) => registerListener(window, "ready-to-show", listener),
      onLoaded: (listener) => registerListener(window.webContents, "did-finish-load", listener)
    };
  }

  current(): BrowserWindow | undefined {
    if (!this.readerWindow || this.readerWindow.isDestroyed()) return undefined;
    return this.readerWindow;
  }
}

function createElectronReaderMenu(options: ElectronReaderAppShellOptions): ReaderAppShellMenu {
  return {
    install: (actions) => {
      const tray = options.createTray(createTemplateTrayIcon(options.nativeImage));
      tray.setToolTip("VoiceReader");
      tray.setContextMenu(
        options.buildMenu(createReaderMenuTemplate(actions))
      );
      return () => tray.destroy();
    }
  };
}

function createElectronReaderLifecycle(app: App): ReaderAppShellLifecycle {
  return {
    wasOpenedAtLogin: () => app.getLoginItemSettings().wasOpenedAtLogin,
    onActivate: (listener) => registerListener(app, "activate", listener),
    onBeforeQuit: (listener) => registerListener(app, "before-quit", listener),
    keepAliveAfterAllWindowsClosed: () => registerListener(app, "window-all-closed", () => undefined),
    quit: () => app.quit()
  };
}

function registerListener<Listener extends (...args: never[]) => void>(
  source: {
    on(event: string, listener: Listener): unknown;
    off(event: string, listener: Listener): unknown;
  },
  event: string,
  listener: Listener
): () => void {
  source.on(event, listener);
  return () => source.off(event, listener);
}

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

export function createReaderWindowOptions(
  readerPreloadEntry: string
): BrowserWindowConstructorOptions {
  return {
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
      preload: readerPreloadEntry,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  };
}

export function createReaderMenuTemplate(
  actions: ReaderAppShellMenuActions
): MenuItemConstructorOptions[] {
  return [
    { label: "播放", click: () => void actions.play() },
    { label: "停止朗读", click: () => actions.stop() },
    { label: "打开 VoiceReader", click: () => actions.home() },
    { label: "历史记录", click: () => actions.history() },
    { label: "收藏", click: () => actions.favorites() },
    { label: "设置", click: () => actions.settings() },
    { type: "separator" },
    { label: "退出", click: () => actions.quit() }
  ];
}

function createTemplateTrayIcon(nativeImage: Pick<ElectronReaderAppShellOptions["nativeImage"], "createFromBuffer">): NativeImage {
  const image = nativeImage.createFromBuffer(createTrayIconPngBuffer(), {
    width: TRAY_ICON_SIZE,
    height: TRAY_ICON_SIZE,
    scaleFactor: TRAY_ICON_SCALE
  });
  image.setTemplateImage(false);
  return image;
}

export function createTrayIconPngBuffer(): Buffer {
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
      const fillAlpha = clamp(
        (TRAY_ICON_FILL_EDGE - ellipseDistance) / TRAY_ICON_FILL_FEATHER,
        0,
        1
      );
      if (fillAlpha > 0) blendPixel(pixels, width, x, y, TRAY_ICON_FILL_COLOR, fillAlpha);

      const lineAlpha = Math.max(
        ...TRAY_ICON_LINES.map((line) =>
          lineCoverage(rotatedX, rotatedY, line.x1, line.y1, line.x2, line.y2, TRAY_ICON_LINE_WIDTH)
        )
      );
      if (lineAlpha > 0) blendPixel(pixels, width, x, y, TRAY_ICON_INK_COLOR, lineAlpha);
    }
  }

  return encodePng(width, height, pixels);
}

function lineCoverage(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  strokeWidth: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const progress =
    lengthSquared === 0
      ? 0
      : clamp(((x - x1) * dx + (y - y1) * dy) / lengthSquared, 0, 1);
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
  pixels[offset] =
    (color.r * sourceAlpha + pixels[offset] * targetAlpha * (1 - sourceAlpha)) / outputAlpha;
  pixels[offset + 1] =
    (color.g * sourceAlpha + pixels[offset + 1] * targetAlpha * (1 - sourceAlpha)) / outputAlpha;
  pixels[offset + 2] =
    (color.b * sourceAlpha + pixels[offset + 2] * targetAlpha * (1 - sourceAlpha)) / outputAlpha;
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
  return Buffer.concat([
    uint32(data.length),
    typeBuffer,
    data,
    uint32(crc32(Buffer.concat([typeBuffer, data])))
  ]);
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
