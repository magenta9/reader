import { BrowserWindow, screen } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { OverlayMetric, SessionOverlayMetric } from "../../shared/app-contracts.js";
import {
  PLAYBACK_OVERLAY_EVENT_CHANNELS,
  PLAYBACK_OVERLAY_TIMING
} from "../../shared/bridge-contracts.js";

export class PlaybackOverlayController {
  private overlayWindow: BrowserWindow | undefined;
  private visibilityGeneration = 0;
  private overlayReady = false;
  private pendingShow = false;
  private pendingMetric: OverlayMetric | undefined;
  private pendingOutcome: OverlayOutcome | undefined;
  private activeSessionId: number | undefined;
  private maintenanceTimer: NodeJS.Timeout | undefined;
  private anchorPosition: OverlayWindowPosition | undefined;

  show(sessionId: number): void {
    this.visibilityGeneration += 1;
    this.activeSessionId = sessionId;
    this.pendingShow = true;
    this.pendingMetric = undefined;
    this.pendingOutcome = undefined;
    const window = this.getOrCreateWindow();
    this.anchorPosition = defaultOverlayPosition(window);
    keepOverlayAttached(window, this.anchorPosition);
    if (!window.isVisible()) window.showInactive();
    // Re-bind after show so macOS attaches the panel to active fullscreen Spaces.
    attachOverlayToFullscreenSpaces(window);
    window.moveTop();
    this.startMaintainingPosition();
    this.flushPendingState();
  }

  sendMetric(metric: SessionOverlayMetric): void {
    if (metric.sessionId !== this.activeSessionId) return;
    const nextMetric = {
      amplitude: clamp01(metric.amplitude),
      ...(metric.levels ? { levels: metric.levels.slice(0, OVERLAY_LEVEL_COUNT).map(clamp01) } : {}),
      progress: clamp01(metric.progress)
    };
    if (!this.overlayReady) {
      this.pendingMetric = nextMetric;
      return;
    }
    this.overlayWindow?.webContents.send(PLAYBACK_OVERLAY_EVENT_CHANNELS.metric, nextMetric);
  }

  markReady(): void {
    this.overlayReady = true;
    this.flushPendingState();
  }

  finish(sessionId: number): void {
    this.queueOutcome(sessionId, "finish");
  }

  fail(sessionId: number): void {
    this.queueOutcome(sessionId, "fail");
  }

  stop(sessionId: number): void {
    this.queueOutcome(sessionId, "stop");
  }

  dismiss(): void {
    this.visibilityGeneration += 1;
    this.activeSessionId = undefined;
    this.pendingShow = false;
    this.pendingMetric = undefined;
    this.pendingOutcome = undefined;
    const window = this.overlayWindow;
    if (window && !window.isDestroyed() && window.isVisible()) window.hide();
    this.stopMaintainingPosition();
  }

  destroy(): void {
    this.stopMaintainingPosition();
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.destroy();
    }
    this.overlayWindow = undefined;
    this.overlayReady = false;
    this.activeSessionId = undefined;
    this.pendingShow = false;
    this.pendingMetric = undefined;
    this.pendingOutcome = undefined;
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
    this.overlayReady = false;
    this.overlayWindow.setIgnoreMouseEvents(true);
    attachOverlayToFullscreenSpaces(this.overlayWindow);
    this.overlayWindow.setAlwaysOnTop(true, overlayWindowLevel);
    this.overlayWindow.webContents.on("did-start-loading", () => {
      this.overlayReady = false;
    });
    void this.overlayWindow.loadFile(join(mainBundleDir, "../overlay/index.html"));
    return this.overlayWindow;
  }

  private queueOutcome(sessionId: number, outcome: OverlayOutcome): void {
    if (sessionId !== this.activeSessionId) return;
    this.activeSessionId = undefined;
    this.pendingOutcome = outcome;
    this.flushPendingState();
  }

  private flushPendingState(): void {
    const window = this.overlayWindow;
    if (!this.overlayReady || !window || window.isDestroyed()) return;
    if (this.pendingShow) {
      this.pendingShow = false;
      window.webContents.send(PLAYBACK_OVERLAY_EVENT_CHANNELS.show);
    }
    if (this.pendingMetric) {
      window.webContents.send(PLAYBACK_OVERLAY_EVENT_CHANNELS.metric, this.pendingMetric);
      this.pendingMetric = undefined;
    }
    if (this.pendingOutcome) {
      const outcome = this.pendingOutcome;
      this.pendingOutcome = undefined;
      window.webContents.send(PLAYBACK_OVERLAY_EVENT_CHANNELS[outcome]);
      this.hideAfterOutcome(outcome);
    }
  }

  private hideAfterOutcome(outcome: keyof typeof PLAYBACK_OVERLAY_TIMING.outcomeHoldMs): void {
    const generation = ++this.visibilityGeneration;
    const window = this.overlayWindow;
    if (!window || window.isDestroyed()) return;
    setTimeout(
      () => {
        if (generation !== this.visibilityGeneration) return;
        if (!window.isDestroyed()) {
          window.hide();
          this.stopMaintainingPosition();
        }
      },
      PLAYBACK_OVERLAY_TIMING.outcomeHoldMs[outcome] +
        PLAYBACK_OVERLAY_TIMING.transitionMs +
        PLAYBACK_OVERLAY_TIMING.controllerBufferMs
    );
  }

  private startMaintainingPosition(): void {
    this.stopMaintainingPosition();
    this.maintenanceTimer = setInterval(() => {
      const window = this.overlayWindow;
      const position = this.anchorPosition;
      if (!window || !position || window.isDestroyed() || !window.isVisible()) return;
      keepOverlayAttached(window, position);
      window.moveTop();
    }, 250);
  }

  private stopMaintainingPosition(): void {
    if (this.maintenanceTimer) clearInterval(this.maintenanceTimer);
    this.maintenanceTimer = undefined;
  }
}

const mainBundleDir = dirname(fileURLToPath(import.meta.url));
const OVERLAY_LEVEL_COUNT = 13;
type OverlayOutcome = keyof typeof PLAYBACK_OVERLAY_TIMING.outcomeHoldMs;

interface OverlayWindowPosition {
  x: number;
  y: number;
}

function keepOverlayAttached(window: BrowserWindow, position: OverlayWindowPosition): void {
  refreshOverlayWorkspaceAttachment(window);
  window.setAlwaysOnTop(true, overlayWindowLevel);
  window.setPosition(position.x, position.y, false);
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

function defaultOverlayPosition(window: BrowserWindow): OverlayWindowPosition {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const bounds = display.workArea;
  const [width, height] = window.getSize();
  return {
    x: Math.round(bounds.x + (bounds.width - width) / 2),
    y: Math.round(bounds.y + bounds.height - height - 28)
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
