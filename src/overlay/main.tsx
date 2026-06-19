import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ReactElement } from "react";
import { getPlaybackOverlayBridge } from "../shared/voice-reader-bridge.js";
import "./styles.css";

const BAR_COUNT = 34;
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
    const leave = (progress?: number): void => {
      clearHideTimer();
      setState((current) => ({
        ...current,
        visible: true,
        leaving: true,
        amplitude: 0,
        progress: progress ?? current.progress
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
      overlayBridge.onOverlayFinish(() => leave(1)),
      overlayBridge.onOverlayFail(() => leave()),
      overlayBridge.onOverlayStop(() => leave())
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

  const bars = useMemo(
    () =>
      Array.from({ length: BAR_COUNT }, (_, index) => {
        const center = 1 - Math.abs((index - (BAR_COUNT - 1) / 2) / ((BAR_COUNT - 1) / 2));
        const carrier = 0.5 + Math.sin(phase + index * 0.62) * 0.5;
        const detail = 0.5 + Math.cos(phase * 0.74 + index * 1.17) * 0.5;
        const energy = Math.max(0.08, state.amplitude);
        const scale = 0.18 + center * 0.26 + energy * center * (0.72 * carrier + 0.34 * detail);
        return {
          scale: Math.min(1, scale),
          opacity: 0.36 + center * 0.2 + energy * 0.38
        };
      }),
    [phase, state.amplitude]
  );

  const stop = (): void => {
    void overlayBridge.stopPlayback();
  };

  return (
    <div className={`overlay-root${state.visible ? " is-visible" : ""}${state.leaving ? " is-leaving" : ""}`}>
      <div className="overlay-pill">
        <div className="hover-progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${state.progress})` }} />
        </div>
        <div className="waveform" aria-hidden="true">
          {bars.map((bar, index) => (
            <span
              className="waveform-bar"
              key={index}
              style={{
                opacity: bar.opacity,
                transform: `scaleY(${bar.scale})`
              }}
            />
          ))}
        </div>
        <button aria-label="停止播放" className="close-button" onClick={stop} type="button">
          <svg aria-hidden="true" viewBox="0 0 16 16">
            <path d="M4.7 4.7 11.3 11.3M11.3 4.7 4.7 11.3" />
          </svg>
        </button>
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
