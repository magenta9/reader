import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electronFakes = vi.hoisted(() => {
  const windows: FakeOverlayWindow[] = [];
  const cursorPoint = { x: 100, y: 100 };

  class FakeOverlayWindow {
    destroyed = false;
    visible = false;
    readonly handlers = new Map<string, Array<() => void>>();
    readonly messages: Array<[string, unknown?]> = [];
    readonly options: Record<string, unknown>;
    readonly position: [number, number] = [0, 0];
    readonly webContents = {
      on: vi.fn((event: string, listener: () => void) => {
        const listeners = this.handlers.get(event) ?? [];
        listeners.push(listener);
        this.handlers.set(event, listeners);
      }),
      send: vi.fn((channel: string, payload?: unknown) => {
        this.messages.push(payload === undefined ? [channel] : [channel, payload]);
      })
    };
    readonly destroy = vi.fn(() => {
      this.destroyed = true;
    });
    readonly hide = vi.fn(() => {
      this.visible = false;
    });
    readonly loadFile = vi.fn(async (_path: string) => undefined);
    readonly moveTop = vi.fn();
    readonly setAlwaysOnTop = vi.fn();
    readonly setIgnoreMouseEvents = vi.fn();
    readonly setPosition = vi.fn((x: number, y: number) => {
      this.position[0] = x;
      this.position[1] = y;
    });
    readonly setVisibleOnAllWorkspaces = vi.fn();
    readonly showInactive = vi.fn(() => {
      this.visible = true;
    });

    constructor(options: Record<string, unknown>) {
      this.options = options;
      windows.push(this);
    }

    emit(event: string): void {
      for (const listener of this.handlers.get(event) ?? []) listener();
    }

    getSize(): [number, number] {
      return [132, 44];
    }

    isDestroyed(): boolean {
      return this.destroyed;
    }

    isVisible(): boolean {
      return this.visible;
    }
  }

  return {
    BrowserWindow: FakeOverlayWindow,
    cursorPoint,
    screen: {
      getCursorScreenPoint: vi.fn(() => ({ ...cursorPoint })),
      getDisplayNearestPoint: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } }))
    },
    windows
  };
});

vi.mock("electron", () => ({
  BrowserWindow: electronFakes.BrowserWindow,
  screen: electronFakes.screen
}));

import { PlaybackOverlayController } from "../../../src/main/playback/playback-overlay-controller.js";
import {
  PLAYBACK_OVERLAY_EVENT_CHANNELS,
  PLAYBACK_OVERLAY_TIMING
} from "../../../src/shared/bridge-contracts.js";

type FakeOverlayWindow = InstanceType<typeof electronFakes.BrowserWindow>;

let controller: PlaybackOverlayController;

beforeEach(() => {
  vi.useFakeTimers();
  electronFakes.windows.length = 0;
  controller = new PlaybackOverlayController();
});

afterEach(() => {
  controller.destroy();
  vi.useRealTimers();
});

describe("PlaybackOverlayController", () => {
  it("prepares the hidden overlay without showing it", async () => {
    await controller.prepare();
    const window = latestWindow();

    expect(window.loadFile).toHaveBeenCalledOnce();
    expect(window.loadFile.mock.calls[0]?.[0]).toMatch(/overlay\/index\.html$/);
    expect(window.showInactive).not.toHaveBeenCalled();
  });

  it("creates a non-activating, mouse-transparent status window and waits for renderer readiness", () => {
    controller.show(101);
    const window = latestWindow();

    expect(window.options.focusable).toBe(false);
    expect(window.showInactive).toHaveBeenCalledTimes(1);
    expect(window.setIgnoreMouseEvents).toHaveBeenCalledWith(true);
    expect(window.messages).toEqual([]);

    controller.markReady();

    expect(window.messages).toEqual([[PLAYBACK_OVERLAY_EVENT_CHANNELS.show]]);
  });

  it("flushes a terminal state only after listeners are ready and starts its timeout then", () => {
    controller.show(201);
    controller.sendMetric({ sessionId: 201, amplitude: 2, levels: [2, -1, Number.NaN], progress: 0.4 });
    controller.fail(201);
    const window = latestWindow();

    vi.advanceTimersByTime(5_000);
    expect(window.messages).toEqual([]);
    expect(window.hide).not.toHaveBeenCalled();

    controller.markReady();

    expect(window.messages).toEqual([
      [PLAYBACK_OVERLAY_EVENT_CHANNELS.show],
      [PLAYBACK_OVERLAY_EVENT_CHANNELS.metric, { amplitude: 1, levels: [1, 0, 0], progress: 0.4 }],
      [PLAYBACK_OVERLAY_EVENT_CHANNELS.fail]
    ]);
    vi.advanceTimersByTime(
      PLAYBACK_OVERLAY_TIMING.outcomeHoldMs.fail +
        PLAYBACK_OVERLAY_TIMING.transitionMs +
        PLAYBACK_OVERLAY_TIMING.controllerBufferMs
    );
    expect(window.hide).toHaveBeenCalledTimes(1);
  });

  it("ignores stale session metrics and outcomes after a replacement session starts", () => {
    controller.show(301);
    controller.markReady();
    const window = latestWindow();

    controller.show(302);
    controller.sendMetric({ sessionId: 301, amplitude: 1, progress: 0.9 });
    controller.finish(301);
    controller.sendMetric({ sessionId: 302, amplitude: 0.5, progress: 0.25 });
    controller.finish(302);

    expect(window.messages).toEqual([
      [PLAYBACK_OVERLAY_EVENT_CHANNELS.show],
      [PLAYBACK_OVERLAY_EVENT_CHANNELS.show],
      [PLAYBACK_OVERLAY_EVENT_CHANNELS.metric, { amplitude: 0.5, progress: 0.25 }],
      [PLAYBACK_OVERLAY_EVENT_CHANNELS.finish]
    ]);
  });
});

function latestWindow(): FakeOverlayWindow {
  const window = electronFakes.windows.at(-1);
  if (!window) throw new Error("Playback Overlay window was not created.");
  return window;
}
