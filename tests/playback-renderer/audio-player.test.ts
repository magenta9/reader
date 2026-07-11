import { afterEach, describe, expect, it } from "vitest";

import { mountPlaybackAudio } from "../../src/playback-renderer/audio-player.js";
import {
  PLAYBACK_FEEDBACK_SURFACES,
  type AudioChunkPayload,
  type PlaybackAudioSession
} from "../../src/shared/app-contracts.js";
import type { PlaybackRendererBridge } from "../../src/shared/bridge-contracts.js";

let activeBrowserFakes: BrowserFakes | undefined;

afterEach(() => {
  activeBrowserFakes?.restore();
  activeBrowserFakes = undefined;
});

describe("Playback Audio renderer", () => {
  it("plays sessions emitted through the Playback Renderer seam until disposed", async () => {
    const events: QueueEvent[] = [];
    const harness = createPlaybackRendererBridgeHarness(events);
    const dispose = mountPlaybackAudio(harness.bridge);

    harness.start(createOverlaySession(101));
    harness.finish({ sessionId: 101 });
    await flushPlaybackMicrotasks();

    expect(events).toEqual([
      ["metric", 0, 1],
      ["finish-overlay"],
      ["idle", 101]
    ]);

    dispose();
    harness.start(createOverlaySession(102));
    harness.finish({ sessionId: 102 });
    await flushPlaybackMicrotasks();

    expect(events).toEqual([
      ["metric", 0, 1],
      ["finish-overlay"],
      ["idle", 101]
    ]);
  });

  it("starts and finishes a current Reading Target session with overlay completion and renderer idle", async () => {
    const { events, playback } = createScenario();

    playback.start(createOverlaySession(201));
    playback.finish({ sessionId: 201 });
    await flushPlaybackMicrotasks();

    expect(events).toEqual([
      ["metric", 0, 1],
      ["finish-overlay"],
      ["idle", 201]
    ]);
  });

  it("plays chunks on segment end and emits progress metrics for current Reading Target playback", async () => {
    const { events, playback, animationFrames, playedAudios } = createScenario();

    playback.start(createSession(203, PLAYBACK_FEEDBACK_SURFACES.playbackOverlay, [9, 1]));
    playback.audioChunk({ sessionId: 203, bytes: new Uint8Array([1, 2, 3]) });
    playback.segmentEnd({ sessionId: 203 });
    playback.finish({ sessionId: 203 });
    await flushPlaybackMicrotasks();
    await flushPlaybackMicrotasks();

    const firstAudio = playedAudios.at(-1);
    expect(firstAudio?.src).toBe("blob:voice-reader-test");
    animationFrames.shift()?.();
    expect(events.some((event) => event[0] === "metric" && event[1] > 0)).toBe(true);
    expect(events.some((event) => event[0] === "finish-overlay")).toBe(false);
    firstAudio?.listeners.ended?.();
    await flushPlaybackMicrotasks();
    await flushPlaybackMicrotasks();

    expect(events.some((event) => event[0] === "finish-overlay")).toBe(true);
    expect(events).toContainEqual(["idle", 203]);
  });

  it("tracks weighted progress across multiple current Reading Target segments", async () => {
    const { events, playback, animationFrames, playedAudios } = createScenario();

    playback.start(createSession(205, PLAYBACK_FEEDBACK_SURFACES.playbackOverlay, [9, 1]));
    playback.audioChunk({ sessionId: 205, bytes: new Uint8Array([1]) });
    playback.segmentEnd({ sessionId: 205 });
    playback.audioChunk({ sessionId: 205, bytes: new Uint8Array([2]) });
    playback.segmentEnd({ sessionId: 205 });
    playback.finish({ sessionId: 205 });
    await flushPlaybackMicrotasks();
    await flushPlaybackMicrotasks();

    const firstAudio = playedAudios.at(-1);
    animationFrames.shift()?.();
    const firstMetric = events.find((event) => event[0] === "metric");
    expect(firstMetric?.[2]).toBeGreaterThan(0.4);
    expect(firstMetric?.[2]).toBeLessThan(0.5);
    firstAudio?.listeners.ended?.();
    await flushPlaybackMicrotasks();
    await flushPlaybackMicrotasks();

    const secondAudio = playedAudios.at(-1);
    const metricCountBeforeSecondSegment = events.filter((event) => event[0] === "metric").length;
    while (animationFrames.length && events.filter((event) => event[0] === "metric").length === metricCountBeforeSecondSegment) {
      animationFrames.shift()?.();
    }
    const secondMetric = events.filter((event) => event[0] === "metric").at(-1);
    expect(secondMetric?.[2]).toBeGreaterThan(0.9);
    expect(secondMetric?.[2]).toBeLessThan(1);
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
      playback.finish({ sessionId: session.sessionId });
      await flushPlaybackMicrotasks();
      playedAudios.at(-1)?.listeners.ended?.();
      await flushPlaybackMicrotasks();
      expect(events).toEqual([["idle", session.sessionId]]);
    }
  });

  it("handles fail and stop by stopping playback and notifying renderer idle", () => {
    const failed = createScenario();
    failed.playback.start(createOverlaySession(301));
    failed.playback.fail({ sessionId: 301 });
    expect(failed.events).toEqual([["idle", 301]]);

    const stopped = createScenario();
    stopped.playback.start(createOverlaySession(302));
    stopped.playback.stop({ sessionId: 302 });
    expect(stopped.events).toEqual([["idle", 302]]);
  });

  it("ignores stale session chunks after a replacement session starts", async () => {
    const { events, playback, playedAudios } = createScenario();

    playback.start(createOverlaySession(401));
    playback.audioChunk({ sessionId: 401, bytes: new Uint8Array([1]) });
    playback.start(createOverlaySession(402));
    playback.segmentEnd({ sessionId: 401 });
    playback.finish({ sessionId: 401 });
    playback.audioChunk({ sessionId: 402, bytes: new Uint8Array([2]) });
    playback.segmentEnd({ sessionId: 402 });
    playback.finish({ sessionId: 402 });
    await flushPlaybackMicrotasks();
    await flushPlaybackMicrotasks();
    playedAudios.at(-1)?.listeners.ended?.();
    await flushPlaybackMicrotasks();
    await flushPlaybackMicrotasks();

    expect(playedAudios).toHaveLength(1);
    expect(events).toContainEqual(["idle", 402]);
    expect(events).not.toContainEqual(["idle", 401]);
  });
});

type QueueEvent = ["metric", number, number] | ["finish-overlay"] | ["idle", number];

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

interface PlaybackRendererBridgeHarness {
  bridge: PlaybackRendererBridge;
  audioChunk: (payload: AudioChunkPayload) => void;
  fail: (payload: { sessionId: number }) => void;
  finish: (payload: { sessionId: number }) => void;
  segmentEnd: (payload: { sessionId: number }) => void;
  start: (session: PlaybackAudioSession) => void;
  stop: (payload: { sessionId: number }) => void;
}

function createPlaybackRendererBridgeHarness(events: QueueEvent[]): PlaybackRendererBridgeHarness {
  const startListeners = new Set<(session: PlaybackAudioSession) => void>();
  const audioChunkListeners = new Set<(payload: AudioChunkPayload) => void>();
  const segmentEndListeners = new Set<(payload: { sessionId: number }) => void>();
  const finishListeners = new Set<(payload: { sessionId: number }) => void>();
  const failListeners = new Set<(payload: { sessionId: number }) => void>();
  const stopListeners = new Set<(payload: { sessionId: number }) => void>();
  const bridge: PlaybackRendererBridge = {
    onPlaybackStart: (listener) => subscribe(startListeners, listener),
    onAudioChunk: (listener) => subscribe(audioChunkListeners, listener),
    onSegmentEnd: (listener) => subscribe(segmentEndListeners, listener),
    onPlaybackFinish: (listener) => subscribe(finishListeners, listener),
    onPlaybackFail: (listener) => subscribe(failListeners, listener),
    onPlaybackStop: (listener) => subscribe(stopListeners, listener),
    notifyPlaybackIdle: async (sessionId) => {
      events.push(["idle", sessionId]);
    },
    sendOverlayMetric: async (metric) => {
      events.push(["metric", metric.amplitude, metric.progress]);
    },
    finishOverlayPlayback: async () => {
      events.push(["finish-overlay"]);
    }
  };
  return {
    bridge,
    audioChunk: (payload) => emitListeners(audioChunkListeners, payload),
    fail: (payload) => emitListeners(failListeners, payload),
    finish: (payload) => emitListeners(finishListeners, payload),
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

function createScenario(): BrowserFakes & { playback: PlaybackRendererBridgeHarness } {
  activeBrowserFakes?.restore();
  const browserFakes = installBrowserFakes();
  const playback = createPlaybackRendererBridgeHarness(browserFakes.events);
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
          frequencyBinCount: 4,
          connect() {},
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
