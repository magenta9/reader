import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { PointerEvent as ReactPointerEvent, ReactElement } from "react";
import { getPlaybackOverlayBridge } from "../shared/voice-reader-bridge.js";
import "./styles.css";

const BAR_COUNT = 10;
const DRAG_HOLD_MS = 320;
const DRAG_START_TOLERANCE_PX = 5;
const overlayBridge = getPlaybackOverlayBridge();

interface OverlayState {
  visible: boolean;
  leaving: boolean;
  amplitude: number;
  progress: number;
}

interface OverlayDragState {
  hasLongPressActivated: boolean;
  pointerId?: number;
  holdTimer?: number;
  startScreenX: number;
  startScreenY: number;
  lastScreenX: number;
  lastScreenY: number;
}

function PlaybackOverlay(): ReactElement {
  const [state, setState] = useState<OverlayState>({
    visible: false,
    leaving: false,
    amplitude: 0,
    progress: 0
  });
  const [phase, setPhase] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<OverlayDragState | undefined>(undefined);

  const clearDragHoldTimer = (): void => {
    if (dragState.current?.holdTimer) window.clearTimeout(dragState.current.holdTimer);
    if (dragState.current) dragState.current.holdTimer = undefined;
  };

  const cancelDrag = (): void => {
    clearDragHoldTimer();
    dragState.current = undefined;
    setDragging(false);
  };

  useEffect(() => {
    let hideTimer: number | undefined;
    const clearHideTimer = (): void => {
      if (hideTimer) window.clearTimeout(hideTimer);
      hideTimer = undefined;
    };
    const leave = (): void => {
      clearHideTimer();
      cancelDrag();
      setState((current) => ({
        ...current,
        visible: true,
        leaving: true,
        amplitude: 0
      }));
      hideTimer = window.setTimeout(() => {
        setState((current) => ({ ...current, visible: false, leaving: false }));
      }, 170);
    };

    const subscriptions = [
      overlayBridge.onOverlayShow(() => {
        clearHideTimer();
        setState({ visible: true, leaving: false, amplitude: 0.1, progress: 0 });
      }),
      overlayBridge.onOverlayMetric((metric) => {
        setState((current) => ({
          ...current,
          amplitude: clamp01(metric.amplitude),
          progress: Math.max(current.progress, clamp01(metric.progress))
        }));
      }),
      overlayBridge.onOverlayFinish(leave),
      overlayBridge.onOverlayFail(leave),
      overlayBridge.onOverlayStop(leave)
    ];

    return () => {
      clearHideTimer();
      cancelDrag();
      for (const unsubscribe of subscriptions) unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!state.visible || state.leaving) return undefined;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number): void => {
      const delta = Math.min(34, now - previous);
      previous = now;
      setPhase((current) => (current + delta * (0.006 + state.amplitude * 0.014)) % (Math.PI * 2));
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [state.amplitude, state.leaving, state.visible]);

  const barScales = useMemo(
    () =>
      Array.from({ length: BAR_COUNT }, (_, index) => {
        const center = 1 - Math.abs((index - (BAR_COUNT - 1) / 2) / ((BAR_COUNT - 1) / 2));
        const carrier = 0.5 + Math.sin(phase + index * 0.62) * 0.5;
        const detail = 0.5 + Math.cos(phase * 0.74 + index * 1.17) * 0.5;
        const energy = Math.max(0.12, state.amplitude);
        const scale = 0.2 + center * 0.28 + energy * (0.16 + center * (0.9 * carrier + 0.42 * detail));
        return Math.min(1, scale);
      }),
    [phase, state.amplitude]
  );

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || !state.visible || state.leaving) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragState.current = {
      hasLongPressActivated: false,
      pointerId: event.pointerId,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      lastScreenX: event.screenX,
      lastScreenY: event.screenY
    };
    dragState.current.holdTimer = window.setTimeout(() => {
      if (!dragState.current || dragState.current.pointerId !== event.pointerId) return;
      dragState.current.hasLongPressActivated = true;
      setDragging(true);
    }, DRAG_HOLD_MS);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaFromStart = Math.hypot(event.screenX - drag.startScreenX, event.screenY - drag.startScreenY);
    if (!drag.hasLongPressActivated) {
      if (deltaFromStart > DRAG_START_TOLERANCE_PX) cancelDrag();
      return;
    }

    event.preventDefault();
    const deltaX = event.screenX - drag.lastScreenX;
    const deltaY = event.screenY - drag.lastScreenY;
    drag.lastScreenX = event.screenX;
    drag.lastScreenY = event.screenY;
    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;
    void overlayBridge.moveOverlayBy({ deltaX, deltaY });
  };

  const handlePointerRelease = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const pointerId = dragState.current?.pointerId;
    if (pointerId !== undefined && event.currentTarget.hasPointerCapture(pointerId)) {
      event.currentTarget.releasePointerCapture(pointerId);
    }
    cancelDrag();
  };

  const overlayClassName = [
    "overlay-root",
    state.visible ? "is-visible" : "",
    state.leaving ? "is-leaving" : "",
    dragging ? "is-dragging" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={overlayClassName}>
      <div
        className="overlay-pill"
        onContextMenu={(event) => event.preventDefault()}
        onLostPointerCapture={handlePointerRelease}
        onPointerCancel={handlePointerRelease}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerRelease}
      >
        <div className="hover-progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${state.progress})` }} />
        </div>
        <div className="waveform" aria-hidden="true">
          {barScales.map((barScale, index) => (
            <span
              className="waveform-bar"
              key={index}
              style={{
                transform: `scaleY(${barScale})`
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <PlaybackOverlay />
  </StrictMode>
);
