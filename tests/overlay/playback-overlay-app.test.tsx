// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlaybackOverlayApp } from "../../src/overlay/App.js";
import type { OverlayMetric } from "../../src/shared/app-contracts.js";
import type { PlaybackOverlayBridge } from "../../src/shared/bridge-contracts.js";

let restoreAnimationFrame: (() => void) | undefined;

beforeEach(() => {
  restoreAnimationFrame = installAnimationFrameFake();
});

afterEach(() => {
  cleanup();
  restoreAnimationFrame?.();
  restoreAnimationFrame = undefined;
  vi.useRealTimers();
});

describe("PlaybackOverlayApp", () => {
  it("shows the overlay when the bridge emits a show event", async () => {
    const bridge = createOverlayBridge();
    const { container } = render(<PlaybackOverlayApp overlayBridge={bridge.bridge} />);

    emit(() => bridge.show());

    await waitFor(() => expect(overlayRoot(container)).toHaveClass("is-visible"));
    expect(overlayRoot(container)).toHaveAttribute("aria-hidden", "false");
    expect(screen.getByRole("progressbar", { name: "Playback progress" })).toHaveAttribute("aria-valuenow", "0");
  });

  it("updates waveform amplitude and progress from overlay metric events", async () => {
    const bridge = createOverlayBridge();
    const { container } = render(<PlaybackOverlayApp overlayBridge={bridge.bridge} />);
    emit(() => bridge.show());
    await waitFor(() => expect(overlayRoot(container)).toHaveClass("is-visible"));
    const firstBar = container.querySelector<HTMLElement>(".waveform-bar");
    const initialTransform = firstBar?.style.transform;

    emit(() => bridge.metric({ amplitude: 0.9, progress: 0.42 }));

    await waitFor(() =>
      expect(screen.getByRole("progressbar", { name: "Playback progress" })).toHaveAttribute("aria-valuenow", "42")
    );
    expect(firstBar?.style.transform).not.toBe(initialTransform);
  });

  it("does not move progress backward after a lower progress metric", async () => {
    const bridge = createOverlayBridge();
    render(<PlaybackOverlayApp overlayBridge={bridge.bridge} />);
    emit(() => bridge.show());

    emit(() => bridge.metric({ amplitude: 0.4, progress: 0.8 }));
    await waitFor(() =>
      expect(screen.getByRole("progressbar", { name: "Playback progress" })).toHaveAttribute("aria-valuenow", "80")
    );
    emit(() => bridge.metric({ amplitude: 0.1, progress: 0.2 }));

    await waitFor(() =>
      expect(screen.getByRole("progressbar", { name: "Playback progress" })).toHaveAttribute("aria-valuenow", "80")
    );
  });

  for (const [eventName, emitLeavingEvent] of [
    ["finish", (bridge: OverlayBridgeForTest) => bridge.finish()],
    ["fail", (bridge: OverlayBridgeForTest) => bridge.fail()],
    ["stop", (bridge: OverlayBridgeForTest) => bridge.stop()]
  ] as const) {
    it(`enters leaving state and hides after ${eventName}`, async () => {
      const bridge = createOverlayBridge();
      const { container } = render(<PlaybackOverlayApp overlayBridge={bridge.bridge} />);
      emit(() => bridge.show());
      expect(overlayRoot(container)).toHaveClass("is-visible");

      emit(() => emitLeavingEvent(bridge));

      expect(overlayRoot(container)).toHaveClass("is-leaving");
      await new Promise((resolve) => window.setTimeout(resolve, 190));
      expect(overlayRoot(container)).toHaveAttribute("aria-hidden", "true");
      expect(overlayRoot(container)).not.toHaveClass("is-leaving");
    });
  }
});

interface OverlayBridgeForTest {
  bridge: PlaybackOverlayBridge;
  fail: () => void;
  finish: () => void;
  metric: (metric: OverlayMetric) => void;
  show: () => void;
  stop: () => void;
}

function createOverlayBridge(): OverlayBridgeForTest {
  const listeners = {
    show: new Set<() => void>(),
    metric: new Set<(metric: OverlayMetric) => void>(),
    finish: new Set<() => void>(),
    fail: new Set<() => void>(),
    stop: new Set<() => void>()
  };
  return {
    bridge: {
      onOverlayShow: (listener) => subscribe(listeners.show, listener),
      onOverlayMetric: (listener) => subscribe(listeners.metric, listener),
      onOverlayFinish: (listener) => subscribe(listeners.finish, listener),
      onOverlayFail: (listener) => subscribe(listeners.fail, listener),
      onOverlayStop: (listener) => subscribe(listeners.stop, listener),
      moveOverlayBy: async () => undefined
    },
    show: () => emitListeners(listeners.show),
    metric: (metric) => emitListeners(listeners.metric, metric),
    finish: () => emitListeners(listeners.finish),
    fail: () => emitListeners(listeners.fail),
    stop: () => emitListeners(listeners.stop)
  };
}

function subscribe<T extends (...args: never[]) => void>(listeners: Set<T>, listener: T): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitListeners<T>(listeners: Set<(value: T) => void>, value: T): void;
function emitListeners(listeners: Set<() => void>): void;
function emitListeners<T>(listeners: Set<((value: T) => void) | (() => void)>, value?: T): void {
  for (const listener of listeners) {
    (listener as (value?: T) => void)(value);
  }
}

function emit(callback: () => void): void {
  act(callback);
}

function overlayRoot(container: HTMLElement): HTMLElement {
  const root = container.querySelector<HTMLElement>(".overlay-root");
  if (!root) throw new Error("Overlay root was not rendered.");
  return root;
}

function installAnimationFrameFake(): () => void {
  const previousRequestAnimationFrame = window.requestAnimationFrame;
  const previousCancelAnimationFrame = window.cancelAnimationFrame;
  window.requestAnimationFrame = () => 1;
  window.cancelAnimationFrame = () => undefined;
  return () => {
    window.requestAnimationFrame = previousRequestAnimationFrame;
    window.cancelAnimationFrame = previousCancelAnimationFrame;
  };
}
