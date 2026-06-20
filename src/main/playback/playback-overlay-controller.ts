import { BrowserWindow, screen } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { OverlayMetric } from "../../shared/app-contracts.js";

export class PlaybackOverlayController {
  private overlayWindow: BrowserWindow | undefined;
  private visibilityGeneration = 0;
  private overlayLoaded = false;
  private pendingShow = false;
  private followTimer: NodeJS.Timeout | undefined;

  show(): void {
    this.visibilityGeneration += 1;
    this.pendingShow = true;
    const window = this.getOrCreateWindow();
    keepOverlayAttached(window);
    if (!window.isVisible()) window.showInactive();
    window.moveTop();
    this.startFollowing();
    this.sendPendingShow();
  }

  sendMetric(metric: OverlayMetric): void {
    this.overlayWindow?.webContents.send("overlay:metric", {
      amplitude: clamp01(metric.amplitude),
      progress: clamp01(metric.progress)
    });
  }

  finish(): void {
    this.overlayWindow?.webContents.send("overlay:finish");
    this.hideSoon();
  }

  fail(): void {
    this.overlayWindow?.webContents.send("overlay:fail");
    this.hideSoon();
  }

  stop(): void {
    this.overlayWindow?.webContents.send("overlay:stop");
    this.hideSoon();
  }

  destroy(): void {
    this.stopFollowing();
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.destroy();
    }
    this.overlayWindow = undefined;
  }

  private getOrCreateWindow(): BrowserWindow {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) return this.overlayWindow;

    this.overlayWindow = new BrowserWindow({
      title: "VoiceReader Playback Overlay",
      width: 132,
      height: 44,
      frame: false,
      show: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: false,
      hasShadow: false,
      webPreferences: {
        preload: join(mainBundleDir, "../preload/preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
    this.overlayLoaded = false;
    this.overlayWindow.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true
    });
    this.overlayWindow.setAlwaysOnTop(true, overlayWindowLevel);
    this.overlayWindow.webContents.once("did-finish-load", () => {
      this.overlayLoaded = true;
      this.sendPendingShow();
    });
    void this.overlayWindow.loadFile(join(mainBundleDir, "../overlay/index.html"));
    return this.overlayWindow;
  }

  private sendPendingShow(): void {
    if (!this.pendingShow || !this.overlayLoaded || !this.overlayWindow || this.overlayWindow.isDestroyed()) {
      return;
    }
    this.pendingShow = false;
    this.overlayWindow.webContents.send("overlay:show");
  }

  private hideSoon(): void {
    const generation = ++this.visibilityGeneration;
    const window = this.overlayWindow;
    if (!window || window.isDestroyed()) return;
    setTimeout(() => {
      if (generation !== this.visibilityGeneration) return;
      if (!window.isDestroyed()) {
        window.hide();
        this.stopFollowing();
      }
    }, 180);
  }

  private startFollowing(): void {
    this.stopFollowing();
    this.followTimer = setInterval(() => {
      const window = this.overlayWindow;
      if (!window || window.isDestroyed() || !window.isVisible()) return;
      keepOverlayAttached(window);
      window.moveTop();
    }, 250);
  }

  private stopFollowing(): void {
    if (this.followTimer) clearInterval(this.followTimer);
    this.followTimer = undefined;
  }
}

const mainBundleDir = dirname(fileURLToPath(import.meta.url));

function keepOverlayAttached(window: BrowserWindow): void {
  window.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true
  });
  window.setAlwaysOnTop(true, overlayWindowLevel);
  positionOverlayWindow(window);
}

const overlayWindowLevel = "screen-saver";

function positionOverlayWindow(window: BrowserWindow): void {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const bounds = display.workArea;
  const [width, height] = window.getSize();
  window.setPosition(
    Math.round(bounds.x + (bounds.width - width) / 2),
    Math.round(bounds.y + bounds.height - height - 28),
    false
  );
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
