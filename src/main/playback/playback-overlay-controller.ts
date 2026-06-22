import { BrowserWindow, screen } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { OverlayDragDelta, OverlayMetric } from "../../shared/app-contracts.js";
import { PLAYBACK_OVERLAY_EVENT_CHANNELS } from "../../shared/bridge-contracts.js";

export class PlaybackOverlayController {
  private overlayWindow: BrowserWindow | undefined;
  private visibilityGeneration = 0;
  private overlayLoaded = false;
  private pendingShow = false;
  private followTimer: NodeJS.Timeout | undefined;
  private manualPosition: OverlayWindowPosition | undefined;

  show(): void {
    this.visibilityGeneration += 1;
    this.pendingShow = true;
    this.manualPosition = undefined;
    const window = this.getOrCreateWindow();
    keepOverlayAttached(window);
    if (!window.isVisible()) window.showInactive();
    // Re-bind after show so macOS attaches the panel to active fullscreen Spaces.
    attachOverlayToFullscreenSpaces(window);
    window.moveTop();
    this.startFollowing();
    this.sendPendingShow();
  }

  sendMetric(metric: OverlayMetric): void {
    this.overlayWindow?.webContents.send(PLAYBACK_OVERLAY_EVENT_CHANNELS.metric, {
      amplitude: clamp01(metric.amplitude),
      progress: clamp01(metric.progress)
    });
  }

  moveBy(delta: OverlayDragDelta): void {
    const window = this.overlayWindow;
    if (!window || window.isDestroyed() || !window.isVisible()) return;

    const [currentX, currentY] = window.getPosition();
    this.manualPosition = constrainOverlayPosition(window, {
      x: currentX + delta.deltaX,
      y: currentY + delta.deltaY
    });
    window.setPosition(this.manualPosition.x, this.manualPosition.y, false);
    window.moveTop();
  }

  finish(): void {
    this.overlayWindow?.webContents.send(PLAYBACK_OVERLAY_EVENT_CHANNELS.finish);
    this.hideSoon();
  }

  fail(): void {
    this.overlayWindow?.webContents.send(PLAYBACK_OVERLAY_EVENT_CHANNELS.fail);
    this.hideSoon();
  }

  stop(): void {
    this.overlayWindow?.webContents.send(PLAYBACK_OVERLAY_EVENT_CHANNELS.stop);
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
      type: "panel",
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
    attachOverlayToFullscreenSpaces(this.overlayWindow);
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
    this.overlayWindow.webContents.send(PLAYBACK_OVERLAY_EVENT_CHANNELS.show);
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
      keepOverlayAttached(window, this.manualPosition);
      window.moveTop();
    }, 250);
  }

  private stopFollowing(): void {
    if (this.followTimer) clearInterval(this.followTimer);
    this.followTimer = undefined;
  }
}

const mainBundleDir = dirname(fileURLToPath(import.meta.url));

interface OverlayWindowPosition {
  x: number;
  y: number;
}

function keepOverlayAttached(window: BrowserWindow, manualPosition?: OverlayWindowPosition): void {
  refreshOverlayWorkspaceAttachment(window);
  window.setAlwaysOnTop(true, overlayWindowLevel);
  if (manualPosition) {
    const position = constrainOverlayPosition(window, manualPosition);
    window.setPosition(position.x, position.y, false);
    return;
  }
  positionOverlayWindow(window);
}

function attachOverlayToFullscreenSpaces(window: BrowserWindow): void {
  window.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: false
  });
}

function refreshOverlayWorkspaceAttachment(window: BrowserWindow): void {
  window.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true
  });
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

function constrainOverlayPosition(window: BrowserWindow, position: OverlayWindowPosition): OverlayWindowPosition {
  const [width, height] = window.getSize();
  const display = screen.getDisplayNearestPoint({
    x: position.x + width / 2,
    y: position.y + height / 2
  });
  const bounds = display.workArea;
  return {
    x: Math.round(Math.max(bounds.x, Math.min(position.x, bounds.x + bounds.width - width))),
    y: Math.round(Math.max(bounds.y, Math.min(position.y, bounds.y + bounds.height - height)))
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
