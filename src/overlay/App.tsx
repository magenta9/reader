import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { PLAYBACK_OVERLAY_TIMING } from "../shared/bridge-contracts.js";
import type { PlaybackOverlayRoleBridge } from "../shared/role-bridge-contracts.js";

const BAR_COUNT = 13;

interface OverlayState {
  visible: boolean;
  leaving: boolean;
  progress: number;
  status: OverlayStatus;
}

type OverlayStatus = "preparing" | "playing" | "finished" | "failed" | "stopped";

interface WaveformMotion {
  energy: number;
  levels: number[];
  phase: number;
}

export function PlaybackOverlayApp({ overlayBridge }: { overlayBridge: PlaybackOverlayRoleBridge }): ReactElement {
  const [state, setState] = useState<OverlayState>({
    visible: false,
    leaving: false,
    progress: 0,
    status: "preparing"
  });
  const [motion, setMotion] = useState<WaveformMotion>(() => createRestingMotion());
  const motionTarget = useRef({ energy: 0.08, levels: createEmptyLevels() });
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    let hideTimer: number | undefined;
    const clearHideTimer = (): void => {
      if (hideTimer) window.clearTimeout(hideTimer);
      hideTimer = undefined;
    };
    const showOutcome = (status: Exclude<OverlayStatus, "preparing" | "playing">): void => {
      clearHideTimer();
      motionTarget.current = { energy: 0, levels: createEmptyLevels() };
      setState((current) => ({
        ...current,
        visible: true,
        leaving: false,
        progress: status === "finished" ? 1 : current.progress,
        status
      }));
      hideTimer = window.setTimeout(() => {
        setState((current) => ({ ...current, leaving: true }));
        hideTimer = window.setTimeout(() => {
          setState((current) => ({ ...current, visible: false, leaving: false }));
        }, PLAYBACK_OVERLAY_TIMING.transitionMs);
      }, outcomeHoldMs(status));
    };

    const subscriptions = [
      overlayBridge.onOverlayShow(() => {
        clearHideTimer();
        motionTarget.current = { energy: 0.08, levels: createEmptyLevels() };
        setMotion(createRestingMotion());
        setState({ visible: true, leaving: false, progress: 0, status: "preparing" });
      }),
      overlayBridge.onOverlayMetric((metric) => {
        const amplitude = clamp01(metric.amplitude);
        motionTarget.current = {
          energy: amplitude,
          levels: normalizeWaveformLevels(metric.levels, amplitude)
        };
        setState((current) => {
          if (!current.visible || !isActiveStatus(current.status)) return current;
          return {
            ...current,
            progress: Math.max(current.progress, clamp01(metric.progress)),
            status: "playing"
          };
        });
      }),
      overlayBridge.onOverlayFinish(() => showOutcome("finished")),
      overlayBridge.onOverlayFail(() => showOutcome("failed")),
      overlayBridge.onOverlayStop(() => showOutcome("stopped"))
    ];
    void overlayBridge.notifyOverlayReady();

    return () => {
      clearHideTimer();
      for (const unsubscribe of subscriptions) unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!state.visible || state.leaving || !isActiveStatus(state.status) || prefersReducedMotion) return undefined;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number): void => {
      const delta = Math.min(34, now - previous);
      previous = now;
      setMotion((current) => {
        const target = motionTarget.current;
        const energy = smoothMotionValue(current.energy, target.energy, delta, 68, 190);
        const levels = current.levels.map((level, index) =>
          smoothMotionValue(level, target.levels[index] ?? target.energy, delta, 54, 220)
        );
        return {
          energy,
          levels,
          phase: (current.phase + delta * (0.0045 + energy * 0.0065)) % (Math.PI * 2)
        };
      });
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [prefersReducedMotion, state.leaving, state.status, state.visible]);

  const barScales = useMemo(
    () =>
      Array.from({ length: BAR_COUNT }, (_, index) => {
        const center = 1 - Math.abs((index - (BAR_COUNT - 1) / 2) / ((BAR_COUNT - 1) / 2));
        if (prefersReducedMotion) return 0.24 + center * 0.18;
        if (state.status === "preparing") {
          const carrier = 0.5 + Math.sin(motion.phase - index * 0.7) * 0.5;
          const undertow = 0.5 + Math.cos(motion.phase * 0.62 + index * 0.44) * 0.5;
          return 0.17 + center * 0.1 + carrier * 0.11 + undertow * 0.035;
        }
        const level = motion.levels[index] ?? motion.energy;
        const neighborLevel =
          ((motion.levels[index - 1] ?? level) + (motion.levels[index + 1] ?? level)) / 2;
        const blendedLevel = level * 0.72 + neighborLevel * 0.28;
        const shapedLevel = Math.pow(blendedLevel, 1.3);
        const flow = Math.sin(motion.phase - index * 0.48) * (0.035 + motion.energy * 0.065);
        return Math.min(
          1,
          Math.max(0.12, 0.13 + center * 0.06 + shapedLevel * 0.76 + motion.energy * 0.05 + flow)
        );
      }),
    [motion, prefersReducedMotion, state.status]
  );

  const overlayClassName = [
    "overlay-root",
    state.visible ? "is-visible" : "",
    state.leaving ? "is-leaving" : "",
    `is-${state.status}`
  ]
    .filter(Boolean)
    .join(" ");

  const progressPercent = Math.round(state.progress * 100);
  const statusLabel = overlayStatusLabel(state.status);
  const pillStyle: CSSProperties = {
    transform:
      !prefersReducedMotion && state.status === "playing"
        ? `scaleX(${1 + motion.energy * 0.012})`
        : "scaleX(1)"
  };

  return (
    <div aria-hidden={!state.visible} className={overlayClassName}>
      <span
        aria-atomic="true"
        aria-live={state.status === "failed" ? "assertive" : "polite"}
        className="sr-only"
        role={state.status === "failed" ? "alert" : "status"}
      >
        {statusLabel}
      </span>
      <div className="overlay-pill" style={pillStyle}>
        <div
          aria-hidden={state.status !== "playing"}
          aria-label="朗读进度"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progressPercent}
          aria-valuetext={`约 ${progressPercent}%`}
          className="playback-progress"
          role={state.status === "playing" ? "progressbar" : undefined}
        >
          <span style={{ transform: `scaleX(${state.progress})` }} />
        </div>
        <div className="waveform" aria-hidden="true">
          <span
            className="waveform-aura"
            style={{
              opacity: state.status === "playing" ? 0.08 + motion.energy * 0.2 : 0.06,
              transform: `scaleX(${0.72 + motion.energy * 0.28})`
            }}
          />
          <div className="waveform-bars">
            {barScales.map((barScale, index) => (
              <span
                className="waveform-bar"
                key={index}
                style={{
                  opacity: 0.58 + barScale * 0.42,
                  transform: `scaleY(${barScale})`
                }}
              />
            ))}
          </div>
        </div>
        <span aria-hidden="true" className="outcome-mark" />
      </div>
    </div>
  );
}

function overlayStatusLabel(status: OverlayStatus): string {
  if (status === "preparing") return "正在准备朗读，按 Esc 停止";
  if (status === "playing") return "正在朗读，按 Esc 停止";
  if (status === "finished") return "朗读完成";
  if (status === "failed") return "朗读失败。请从菜单栏打开 VoiceReader，检查连接和朗读设置后重试。";
  return "已停止朗读";
}

function outcomeHoldMs(status: Exclude<OverlayStatus, "preparing" | "playing">): number {
  if (status === "finished") return PLAYBACK_OVERLAY_TIMING.outcomeHoldMs.finish;
  if (status === "failed") return PLAYBACK_OVERLAY_TIMING.outcomeHoldMs.fail;
  return PLAYBACK_OVERLAY_TIMING.outcomeHoldMs.stop;
}

function isActiveStatus(status: OverlayStatus): boolean {
  return status === "preparing" || status === "playing";
}

function createEmptyLevels(): number[] {
  return Array.from({ length: BAR_COUNT }, () => 0);
}

function createRestingMotion(): WaveformMotion {
  return { energy: 0.08, levels: createEmptyLevels(), phase: 0 };
}

function normalizeWaveformLevels(levels: number[] | undefined, amplitude: number): number[] {
  if (!levels?.length) {
    const centerIndex = (BAR_COUNT - 1) / 2;
    return Array.from({ length: BAR_COUNT }, (_, index) => {
      const center = 1 - Math.abs(index - centerIndex) / centerIndex;
      return clamp01(amplitude * (0.46 + center * 0.38));
    });
  }
  return Array.from({ length: BAR_COUNT }, (_, index) => {
    const sourceIndex = Math.round((index / (BAR_COUNT - 1)) * (levels.length - 1));
    return clamp01(levels[sourceIndex] ?? amplitude);
  });
}

function smoothMotionValue(
  current: number,
  target: number,
  deltaMs: number,
  attackMs: number,
  releaseMs: number
): number {
  const timeConstant = target > current ? attackMs : releaseMs;
  return current + (target - current) * (1 - Math.exp(-deltaMs / timeConstant));
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mediaQuery) return undefined;
    const updatePreference = (): void => setPrefersReducedMotion(mediaQuery.matches);
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return prefersReducedMotion;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
