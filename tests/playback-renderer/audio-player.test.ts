import { afterEach, describe, expect, it } from "vitest";

import { mountPlaybackAudio } from "../../src/playback-renderer/audio-player.js";
import {
  PLAYBACK_FEEDBACK_SURFACES,
  type AudioChunkPayload,
  type PlaybackAudioOutcome,
  type PlaybackAudioSession,
  type SessionOverlayMetric
} from "../../src/shared/app-contracts.js";
import type { PlaybackRendererRoleBridge } from "../../src/shared/role-bridge-contracts.js";

let activeBrowserFakes: BrowserFakes | undefined;

afterEach(() => {
  activeBrowserFakes?.restore();
  activeBrowserFakes = undefined;
});

describe("Playback Audio renderer", () => {
  it("plays sessions emitted through the Playback Renderer seam until disposed", async () => {
    const events: QueueEvent[] = [];
    const harness = createPlaybackRendererRoleBridgeHarness(events);
    const dispose = mountPlaybackAudio(harness.bridge);

    harness.start(createOverlaySession(101));
    harness.endAudioInput({ sessionId: 101 });
    await flushPlaybackMicrotasks();

    expect(events).toEqual([
      ["metric", 101, 0, 1],
      ["outcome", 101, "completed"]
    ]);

    dispose();
    harness.start(createOverlaySession(102));
    harness.endAudioInput({ sessionId: 102 });
    await flushPlaybackMicrotasks();

    expect(events).toEqual([
      ["metric", 101, 0, 1],
      ["outcome", 101, "completed"]
    ]);
  });

  it("finishes a current Reading Target audio queue with a final metric and completed outcome", async () => {
    const { events, playback } = createScenario();

    playback.start(createOverlaySession(201));
    playback.endAudioInput({ sessionId: 201 });
    await flushPlaybackMicrotasks();

    expect(events).toEqual([
      ["metric", 201, 0, 1],
      ["outcome", 201, "completed"]
    ]);
  });

  it("plays chunks on segment end and emits progress metrics for current Reading Target playback", async () => {
    const { events, playback, animationFrames, playedAudios } = createScenario();

    playback.start(createSession(203, PLAYBACK_FEEDBACK_SURFACES.playbackOverlay, [9, 1]));
    playback.audioChunk({ sessionId: 203, bytes: new Uint8Array([1, 2, 3]) });
    playback.segmentEnd({ sessionId: 203 });
    playback.endAudioInput({ sessionId: 203 });
    await flushPlaybackMicrotasks();
    await flushPlaybackMicrotasks();

    const firstAudio = playedAudios.at(-1);
    expect(firstAudio?.src).toBe("blob:voice-reader-test");
    animationFrames.shift()?.();
    expect(events.some((event) => event[0] === "metric" && event[2] > 0)).toBe(true);
    expect(playback.metrics.at(-1)?.levels).toHaveLength(13);
    expect(new Set(playback.metrics.at(-1)?.levels?.map((level) => level.toFixed(3))).size).toBeGreaterThan(1);
    firstAudio?.listeners.ended?.();
    await flushPlaybackMicrotasks();
    await flushPlaybackMicrotasks();

    expect(events).toContainEqual(["outcome", 203, "completed"]);
  });

  it("tracks weighted progress across multiple current Reading Target segments", async () => {
    const { events, playback, animationFrames, playedAudios } = createScenario();

    playback.start(createSession(205, PLAYBACK_FEEDBACK_SURFACES.playbackOverlay, [9, 1]));
    playback.audioChunk({ sessionId: 205, bytes: new Uint8Array([1]) });
    playback.segmentEnd({ sessionId: 205 });
    playback.audioChunk({ sessionId: 205, bytes: new Uint8Array([2]) });
    playback.segmentEnd({ sessionId: 205 });
    playback.endAudioInput({ sessionId: 205 });
    await flushPlaybackMicrotasks();
    await flushPlaybackMicrotasks();

    const firstAudio = playedAudios.at(-1);
    animationFrames.shift()?.();
    const firstMetric = events.find((event) => event[0] === "metric");
    expect(firstMetric?.[3]).toBeGreaterThan(0.4);
    expect(firstMetric?.[3]).toBeLessThan(0.5);
    firstAudio?.listeners.ended?.();
    await flushPlaybackMicrotasks();
    await flushPlaybackMicrotasks();

    const secondAudio = playedAudios.at(-1);
    const metricCountBeforeSecondSegment = events.filter((event) => event[0] === "metric").length;
    while (animationFrames.length && events.filter((event) => event[0] === "metric").length === metricCountBeforeSecondSegment) {
      animationFrames.shift()?.();
    }
    const secondMetric = events.filter((event) => event[0] === "metric").at(-1);
    expect(secondMetric?.[3]).toBeGreaterThan(0.9);
    expect(secondMetric?.[3]).toBeLessThan(1);
    secondAudio?.listeners.ended?.();
    await flushPlaybackMicrotasks();
    await flushPlaybackMicrotasks();
  });

  it("suppresses Playback Overlay metrics for History Replay and Favorite Replay", async () => {
    for (const session of [
      createSession(204, PLAYBACK_FEEDBACK_SURFACES.historyDetail),
      createSession(206, PLAYBACK_FEEDBACK_SURFACES.favoriteDetail)
    ]) {
      const { events, playback, animationFrames, playedAudios } = createScenario();

      playback.start(session);
      playback.audioChunk({ sessionId: session.sessionId, bytes: new Uint8Array([4, 5, 6]) });
      playback.segmentEnd({ sessionId: session.sessionId });
      await flushPlaybackMicrotasks();
      await flushPlaybackMicrotasks();

      expect(animationFrames).toHaveLength(0);
      expect(events).toEqual([]);
      playback.endAudioInput({ sessionId: session.sessionId });
      await flushPlaybackMicrotasks();
      playedAudios.at(-1)?.listeners.ended?.();
      await flushPlaybackMicrotasks();
      expect(events).toEqual([["outcome", session.sessionId, "completed"]]);
    }
  });

  it("reports a failed Audio Outcome instead of completion when browser audio playback fails", async () => {
    const { events, playback, playedAudios } = createScenario();

    playback.start(createOverlaySession(207));
    playback.audioChunk({ sessionId: 207, bytes: new Uint8Array([1, 2, 3]) });
    playback.segmentEnd({ sessionId: 207 });
    playback.endAudioInput({ sessionId: 207 });
    await flushPlaybackMicrotasks();
    playedAudios.at(-1)?.listeners.error?.();
    await flushPlaybackMicrotasks();

    expect(events.filter((event) => event[0] === "outcome")).toEqual([
      ["outcome", 207, "failed"]
    ]);
  });

  it("handles fail and stop by stopping playback without a second terminal report", () => {
    const failed = createScenario();
    failed.playback.start(createOverlaySession(301));
    failed.playback.fail({ sessionId: 301 });
    expect(failed.events).toEqual([]);

    const stopped = createScenario();
    stopped.playback.start(createOverlaySession(302));
    stopped.playback.stop({ sessionId: 302 });
    expect(stopped.events).toEqual([]);
  });

  it("ignores stale session chunks after a replacement session starts", async () => {
    const { events, playback, playedAudios } = createScenario();

    playback.start(createOverlaySession(401));
    playback.audioChunk({ sessionId: 401, bytes: new Uint8Array([1]) });
    playback.start(createOverlaySession(402));
    playback.segmentEnd({ sessionId: 401 });
    playback.endAudioInput({ sessionId: 401 });
    playback.audioChunk({ sessionId: 402, bytes: new Uint8Array([2]) });
    playback.segmentEnd({ sessionId: 402 });
    playback.endAudioInput({ sessionId: 402 });
    await flushPlaybackMicrotasks();
    await flushPlaybackMicrotasks();
    playedAudios.at(-1)?.listeners.ended?.();
    await flushPlaybackMicrotasks();
    await flushPlaybackMicrotasks();

    expect(playedAudios).toHaveLength(1);
    expect(events).toContainEqual(["outcome", 402, "completed"]);
    expect(events).not.toContainEqual(["outcome", 401, "completed"]);
  });

  it("suppresses outcomes when playing audio is stopped or replaced", async () => {
    const stopped = createScenario();
    stopped.playback.start(createOverlaySession(501));
    stopped.playback.audioChunk({ sessionId: 501, bytes: new Uint8Array([1]) });
    stopped.playback.segmentEnd({ sessionId: 501 });
    stopped.playback.endAudioInput({ sessionId: 501 });
    await flushPlaybackMicrotasks();
    const stoppedAudio = stopped.playedAudios.at(-1);
    stopped.playback.stop({ sessionId: 501 });
    stoppedAudio?.listeners.ended?.();
    await flushPlaybackMicrotasks();
    expect(stopped.events.filter((event) => event[0] === "outcome")).toEqual([]);

    const replaced = createScenario();
    replaced.playback.start(createOverlaySession(502));
    replaced.playback.audioChunk({ sessionId: 502, bytes: new Uint8Array([2]) });
    replaced.playback.segmentEnd({ sessionId: 502 });
    replaced.playback.endAudioInput({ sessionId: 502 });
    await flushPlaybackMicrotasks();
    const replacedAudio = replaced.playedAudios.at(-1);
    replaced.playback.start(createOverlaySession(503));
    replacedAudio?.listeners.error?.();
    await flushPlaybackMicrotasks();
    expect(replaced.events.filter((event) => event[0] === "outcome")).toEqual([]);
  });
});

type QueueEvent =
  | ["metric", number, number, number]
  | ["outcome", number, PlaybackAudioOutcome["status"]];

interface BrowserFakes {
  animationFrames: Array<() => void>;
  events: QueueEvent[];
  playedAudios: Array<{
    listeners: Partial<Record<"ended" | "error", () => void>>;
    pause: () => void;
    src: string;
  }>;
  restore: () => void;
}

interface PlaybackRendererRoleBridgeHarness {
  bridge: PlaybackRendererRoleBridge;
  audioChunk: (payload: AudioChunkPayload) => void;
  fail: (payload: { sessionId: number }) => void;
  endAudioInput: (payload: { sessionId: number }) => void;
  metrics: SessionOverlayMetric[];
  segmentEnd: (payload: { sessionId: number }) => void;
  start: (session: PlaybackAudioSession) => void;
  stop: (payload: { sessionId: number }) => void;
}

function createPlaybackRendererRoleBridgeHarness(events: QueueEvent[]): PlaybackRendererRoleBridgeHarness {
  const startListeners = new Set<(session: PlaybackAudioSession) => void>();
  const audioChunkListeners = new Set<(payload: AudioChunkPayload) => void>();
  const segmentEndListeners = new Set<(payload: { sessionId: number }) => void>();
  const audioInputEndListeners = new Set<(payload: { sessionId: number }) => void>();
  const failListeners = new Set<(payload: { sessionId: number }) => void>();
  const stopListeners = new Set<(payload: { sessionId: number }) => void>();
  const metrics: SessionOverlayMetric[] = [];
  const bridge: PlaybackRendererRoleBridge = {
    onPlaybackStart: (listener) => subscribe(startListeners, listener),
    onAudioChunk: (listener) => subscribe(audioChunkListeners, listener),
    onSegmentEnd: (listener) => subscribe(segmentEndListeners, listener),
    onAudioInputEnd: (listener) => subscribe(audioInputEndListeners, listener),
    onPlaybackFail: (listener) => subscribe(failListeners, listener),
    onPlaybackStop: (listener) => subscribe(stopListeners, listener),
    reportAudioOutcome: async (outcome) => {
      events.push(["outcome", outcome.sessionId, outcome.status]);
    },
    sendOverlayMetric: async (metric) => {
      metrics.push(metric);
      events.push(["metric", metric.sessionId, metric.amplitude, metric.progress]);
    },
  };
  return {
    bridge,
    audioChunk: (payload) => emitListeners(audioChunkListeners, payload),
    fail: (payload) => emitListeners(failListeners, payload),
    endAudioInput: (payload) => emitListeners(audioInputEndListeners, payload),
    metrics,
    segmentEnd: (payload) => emitListeners(segmentEndListeners, payload),
    start: (session) => emitListeners(startListeners, session),
    stop: (payload) => emitListeners(stopListeners, payload)
  };
}

function subscribe<T>(listeners: Set<(payload: T) => void>, listener: (payload: T) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitListeners<T>(listeners: Set<(payload: T) => void>, payload: T): void {
  for (const listener of listeners) listener(payload);
}

function createScenario(): BrowserFakes & { playback: PlaybackRendererRoleBridgeHarness } {
  activeBrowserFakes?.restore();
  const browserFakes = installBrowserFakes();
  const playback = createPlaybackRendererRoleBridgeHarness(browserFakes.events);
  const disposePlayback = mountPlaybackAudio(playback.bridge);
  const scenario = {
    ...browserFakes,
    playback,
    restore() {
      disposePlayback();
      browserFakes.restore();
    }
  };
  activeBrowserFakes = scenario;
  return scenario;
}

function createOverlaySession(sessionId: number): PlaybackAudioSession {
  return createSession(sessionId, PLAYBACK_FEEDBACK_SURFACES.playbackOverlay);
}

function createSession(
  sessionId: number,
  feedbackSurface: PlaybackAudioSession["feedbackSurface"],
  segmentWeights = [1]
): PlaybackAudioSession {
  return {
    sessionId,
    speechRate: 1,
    feedbackSurface,
    segmentWeights
  };
}

async function flushPlaybackMicrotasks(): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    await Promise.resolve();
  }
}

function installBrowserFakes(): BrowserFakes {
  const restoreCallbacks: Array<() => void> = [];
  const events: QueueEvent[] = [];
  const animationFrames: Array<() => void> = [];
  const playedAudios: BrowserFakes["playedAudios"] = [];

  replaceProperty(globalThis, "window", {
    AudioContext: class {
      destination = {};

      createMediaElementSource() {
        return { connect() {} };
      }

      createAnalyser() {
        return {
          fftSize: 0,
          frequencyBinCount: 32,
          connect() {},
          getByteFrequencyData(data: Uint8Array) {
            data.forEach((_value, index) => {
              data[index] = Math.max(20, 235 - index * 6);
            });
          },
          getByteTimeDomainData(data: Uint8Array) {
            data.fill(255);
          }
        };
      }

      close() {
        return Promise.resolve();
      }
    },
    requestAnimationFrame(callback: () => void) {
      animationFrames.push(callback);
      return animationFrames.length;
    },
    cancelAnimationFrame() {}
  }, restoreCallbacks);
  replaceProperty(
    globalThis,
    "Audio",
    class {
      currentTime = 0.5;
      duration = 1;
      listeners: Partial<Record<"ended" | "error", () => void>> = {};
      playbackRate = 1;
      src = "";

      constructor(url: string) {
        this.src = url;
        playedAudios.push(this);
      }

      addEventListener(eventName: "ended" | "error", callback: () => void) {
        this.listeners[eventName] = callback;
      }

      play() {
        return Promise.resolve();
      }

      pause() {}
    },
    restoreCallbacks
  );
  replaceProperty(globalThis, "performance", { now: () => 100 }, restoreCallbacks);
  replaceProperty(URL, "createObjectURL", () => "blob:voice-reader-test", restoreCallbacks);
  replaceProperty(URL, "revokeObjectURL", () => undefined, restoreCallbacks);

  return {
    animationFrames,
    events,
    playedAudios,
    restore() {
      for (const restore of restoreCallbacks.reverse()) restore();
    }
  };
}

function replaceProperty(
  object: object,
  key: PropertyKey,
  value: unknown,
  restoreCallbacks: Array<() => void>
): void {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  Object.defineProperty(object, key, {
    configurable: true,
    value
  });
  restoreCallbacks.push(() => {
    if (descriptor) {
      Object.defineProperty(object, key, descriptor);
    } else {
      Reflect.deleteProperty(object, key);
    }
  });
}
