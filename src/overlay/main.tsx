import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ReactElement } from "react";
import { getPlaybackOverlayBridge } from "../shared/voice-reader-bridge.js";
import "./styles.css";

const BAR_COUNT = 10;
const overlayBridge = getPlaybackOverlayBridge();

interface OverlayState {
  visible: boolean;
  leaving: boolean;
  amplitude: number;
  progress: number;
}

function PlaybackOverlay(): ReactElement {
  const [state, setState] = useState<OverlayState>({
    visible: false,
    leaving: false,
    amplitude: 0,
    progress: 0
  });
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    let hideTimer: number | undefined;
    const clearHideTimer = (): void => {
      if (hideTimer) window.clearTimeout(hideTimer);
      hideTimer = undefined;
    };
    const leave = (): void => {
      clearHideTimer();
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

  return (
    <div className={`overlay-root${state.visible ? " is-visible" : ""}${state.leaving ? " is-leaving" : ""}`}>
      <div className="overlay-pill">
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
