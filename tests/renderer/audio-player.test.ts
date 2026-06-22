import { afterEach, describe, expect, it } from "vitest";

import { PlaybackAudioQueue } from "../../src/renderer/audio-player.js";
import {
  PLAYBACK_FEEDBACK_SURFACES,
  type PlaybackAudioSession
} from "../../src/shared/app-contracts.js";
import type { RendererAudioBridge } from "../../src/shared/bridge-contracts.js";

let activeBrowserFakes: BrowserFakes | undefined;

afterEach(() => {
  activeBrowserFakes?.restore();
  activeBrowserFakes = undefined;
});

describe("PlaybackAudioQueue", () => {
  it("starts and finishes a current Reading Target session with overlay completion and renderer idle", async () => {
    const { queue, events } = createScenario();

    queue.startSession(createOverlaySession(201));
    queue.finishSession(201);
    await flushPlaybackMicrotasks();

    expect(events).toEqual([
      ["metric", 0, 1],
      ["finish-overlay"],
      ["idle", 201]
    ]);
  });

  it("plays chunks on segment end and emits progress metrics for current Reading Target playback", async () => {
    const { queue, events, animationFrames, playedAudios } = createScenario();

    queue.startSession(createSession(203, PLAYBACK_FEEDBACK_SURFACES.playbackOverlay, [9, 1]));
    queue.pushChunk(203, new Uint8Array([1, 2, 3]));
    queue.endSegment(203);
    queue.finishSession(203);
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
    const { queue, events, animationFrames, playedAudios } = createScenario();

    queue.startSession(createSession(205, PLAYBACK_FEEDBACK_SURFACES.playbackOverlay, [9, 1]));
    queue.pushChunk(205, new Uint8Array([1]));
    queue.endSegment(205);
    queue.pushChunk(205, new Uint8Array([2]));
    queue.endSegment(205);
    queue.finishSession(205);
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
      const { queue, events, animationFrames, playedAudios } = createScenario();

      queue.startSession(session);
      queue.pushChunk(session.sessionId, new Uint8Array([4, 5, 6]));
      queue.endSegment(session.sessionId);
      await flushPlaybackMicrotasks();
      await flushPlaybackMicrotasks();

      expect(animationFrames).toHaveLength(0);
      expect(events).toEqual([]);
      queue.finishSession(session.sessionId);
      await flushPlaybackMicrotasks();
      playedAudios.at(-1)?.listeners.ended?.();
      await flushPlaybackMicrotasks();
      expect(events).toEqual([["idle", session.sessionId]]);
    }
  });

  it("handles fail and stop by stopping playback and notifying renderer idle", () => {
    const failed = createScenario();
    failed.queue.startSession(createOverlaySession(301));
    failed.queue.failSession(301);
    expect(failed.events).toEqual([["idle", 301]]);

    const stopped = createScenario();
    stopped.queue.startSession(createOverlaySession(302));
    stopped.queue.stopSession(302);
    expect(stopped.events).toEqual([["idle", 302]]);
  });

  it("ignores stale session chunks after a replacement session starts", async () => {
    const { queue, events, playedAudios } = createScenario();

    queue.startSession(createOverlaySession(401));
    queue.pushChunk(401, new Uint8Array([1]));
    queue.startSession(createOverlaySession(402));
    queue.endSegment(401);
    queue.finishSession(401);
    queue.pushChunk(402, new Uint8Array([2]));
    queue.endSegment(402);
    queue.finishSession(402);
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

function createScenario(): BrowserFakes & { queue: PlaybackAudioQueue } {
  activeBrowserFakes?.restore();
  const browserFakes = installBrowserFakes();
  activeBrowserFakes = browserFakes;
  return {
    ...browserFakes,
    queue: new PlaybackAudioQueue(createBridge(browserFakes.events))
  };
}

function createBridge(events: QueueEvent[]): RendererAudioBridge {
  return {
    onPlaybackStart: () => () => undefined,
    onAudioChunk: () => () => undefined,
    onSegmentEnd: () => () => undefined,
    onPlaybackFinish: () => () => undefined,
    onPlaybackFail: () => () => undefined,
    onPlaybackStop: () => () => undefined,
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
