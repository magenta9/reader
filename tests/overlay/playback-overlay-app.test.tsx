// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlaybackOverlayApp } from "../../src/overlay/App.js";
import type { OverlayMetric } from "../../src/shared/app-contracts.js";
import {
  PLAYBACK_OVERLAY_TIMING,
  type PlaybackOverlayBridge
} from "../../src/shared/bridge-contracts.js";

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

    await waitFor(() => expect(overlayRoot(container)).toHaveClass("is-visible", "is-preparing"));
    expect(overlayRoot(container)).toHaveAttribute("aria-hidden", "false");
    expect(screen.getByRole("status")).toHaveTextContent("正在准备朗读，按 Esc 停止");
    expect(screen.getByRole("status")).toHaveAttribute("aria-atomic", "true");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".waveform-bar")).toHaveLength(13);
    expect(container.querySelector(".waveform-aura")).toBeInTheDocument();
    expect(bridge.notifyReady).toHaveBeenCalledTimes(1);
  });

  it("updates waveform amplitude and progress from overlay metric events", async () => {
    const bridge = createOverlayBridge();
    const { container } = render(<PlaybackOverlayApp overlayBridge={bridge.bridge} />);
    emit(() => bridge.show());
    await waitFor(() => expect(overlayRoot(container)).toHaveClass("is-visible"));
    const firstBar = container.querySelector<HTMLElement>(".waveform-bar");
    const initialTransform = firstBar?.style.transform;

    emit(() =>
      bridge.metric({
        amplitude: 0.9,
        levels: [0.2, 0.25, 0.3, 0.42, 0.58, 0.82, 1, 0.88, 0.64, 0.48, 0.34, 0.28, 0.2],
        progress: 0.42
      })
    );

    await waitFor(() =>
      expect(screen.getByRole("progressbar", { name: "朗读进度" })).toHaveAttribute("aria-valuenow", "42")
    );
    expect(screen.getByRole("progressbar", { name: "朗读进度" })).toHaveAttribute("aria-valuetext", "约 42%");
    expect(screen.getByRole("status")).toHaveTextContent("正在朗读，按 Esc 停止");
    expect(overlayRoot(container)).toHaveClass("is-playing");
    expect(firstBar?.style.transform).not.toBe(initialTransform);
  });

  it("does not move progress backward after a lower progress metric", async () => {
    const bridge = createOverlayBridge();
    render(<PlaybackOverlayApp overlayBridge={bridge.bridge} />);
    emit(() => bridge.show());

    emit(() => bridge.metric({ amplitude: 0.4, progress: 0.8 }));
    await waitFor(() =>
      expect(screen.getByRole("progressbar", { name: "朗读进度" })).toHaveAttribute("aria-valuenow", "80")
    );
    emit(() => bridge.metric({ amplitude: 0.1, progress: 0.2 }));

    await waitFor(() =>
      expect(screen.getByRole("progressbar", { name: "朗读进度" })).toHaveAttribute("aria-valuenow", "80")
    );
  });

  for (const [eventName, outcomeClass, accessibleLabel, liveRole, holdMs, emitOutcome] of [
    [
      "finish",
      "is-finished",
      "朗读完成",
      "status",
      PLAYBACK_OVERLAY_TIMING.outcomeHoldMs.finish,
      (bridge: OverlayBridgeForTest) => bridge.finish()
    ],
    [
      "fail",
      "is-failed",
      "朗读失败。请从菜单栏打开 VoiceReader，检查连接和朗读设置后重试。",
      "alert",
      PLAYBACK_OVERLAY_TIMING.outcomeHoldMs.fail,
      (bridge: OverlayBridgeForTest) => bridge.fail()
    ],
    [
      "stop",
      "is-stopped",
      "已停止朗读",
      "status",
      PLAYBACK_OVERLAY_TIMING.outcomeHoldMs.stop,
      (bridge: OverlayBridgeForTest) => bridge.stop()
    ]
  ] as const) {
    it(`shows a distinct ${eventName} outcome before leaving`, () => {
      vi.useFakeTimers();
      const bridge = createOverlayBridge();
      const { container } = render(<PlaybackOverlayApp overlayBridge={bridge.bridge} />);
      emit(() => bridge.show());
      expect(overlayRoot(container)).toHaveClass("is-visible");

      emit(() => emitOutcome(bridge));

      expect(overlayRoot(container)).toHaveClass(outcomeClass);
      expect(overlayRoot(container)).not.toHaveClass("is-leaving");
      expect(screen.getByRole(liveRole)).toHaveTextContent(accessibleLabel);
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

      act(() => vi.advanceTimersByTime(holdMs));

      expect(overlayRoot(container)).toHaveClass("is-leaving");
      act(() => vi.advanceTimersByTime(PLAYBACK_OVERLAY_TIMING.transitionMs));
      expect(overlayRoot(container)).toHaveAttribute("aria-hidden", "true");
      expect(overlayRoot(container)).not.toHaveClass("is-leaving");
    });
  }

  it("finishes progress before showing the completed outcome", () => {
    vi.useFakeTimers();
    const bridge = createOverlayBridge();
    render(<PlaybackOverlayApp overlayBridge={bridge.bridge} />);
    emit(() => bridge.show());
    emit(() => bridge.metric({ amplitude: 0.5, progress: 0.4 }));

    emit(() => bridge.finish());

    expect(document.querySelector<HTMLElement>(".playback-progress span")?.style.transform).toBe("scaleX(1)");
  });

  it("keeps a new playback visible when it starts during a failure outcome", () => {
    vi.useFakeTimers();
    const bridge = createOverlayBridge();
    const { container } = render(<PlaybackOverlayApp overlayBridge={bridge.bridge} />);
    emit(() => bridge.show());
    emit(() => bridge.fail());
    act(() => vi.advanceTimersByTime(400));

    emit(() => bridge.show());
    act(() => vi.advanceTimersByTime(PLAYBACK_OVERLAY_TIMING.outcomeHoldMs.fail));

    expect(overlayRoot(container)).toHaveClass("is-visible", "is-preparing");
    expect(overlayRoot(container)).not.toHaveClass("is-leaving");
  });

  it("does not animate waveform frames when reduced motion is requested", () => {
    const restoreMatchMedia = installReducedMotionPreference();
    const requestAnimationFrame = vi.spyOn(window, "requestAnimationFrame");
    const bridge = createOverlayBridge();
    render(<PlaybackOverlayApp overlayBridge={bridge.bridge} />);

    emit(() => bridge.show());

    expect(requestAnimationFrame).not.toHaveBeenCalled();
    const firstBar = document.querySelector<HTMLElement>(".waveform-bar");
    const preparingTransform = firstBar?.style.transform;
    emit(() => bridge.metric({ amplitude: 0.2, progress: 0.2 }));
    const firstMetricTransform = firstBar?.style.transform;
    emit(() => bridge.metric({ amplitude: 0.9, progress: 0.8 }));
    expect(firstBar?.style.transform).toBe(firstMetricTransform);
    expect(firstMetricTransform).toBe(preparingTransform);
    restoreMatchMedia();
  });
});

interface OverlayBridgeForTest {
  bridge: PlaybackOverlayBridge;
  fail: () => void;
  finish: () => void;
  metric: (metric: OverlayMetric) => void;
  notifyReady: ReturnType<typeof vi.fn>;
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
  const notifyReady = vi.fn(async () => undefined);
  return {
    bridge: {
      onOverlayShow: (listener) => subscribe(listeners.show, listener),
      onOverlayMetric: (listener) => subscribe(listeners.metric, listener),
      onOverlayFinish: (listener) => subscribe(listeners.finish, listener),
      onOverlayFail: (listener) => subscribe(listeners.fail, listener),
      onOverlayStop: (listener) => subscribe(listeners.stop, listener),
      notifyOverlayReady: notifyReady
    },
    show: () => emitListeners(listeners.show),
    metric: (metric) => emitListeners(listeners.metric, metric),
    finish: () => emitListeners(listeners.finish),
    notifyReady,
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

function installReducedMotionPreference(): () => void {
  const previousMatchMedia = window.matchMedia;
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  });
  return () => {
    window.matchMedia = previousMatchMedia;
  };
}
