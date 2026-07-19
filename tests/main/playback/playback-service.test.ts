import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AppDataStore } from "../../../src/main/data/app-data-store.js";
import { PlaybackService, type PlaybackAudioSink } from "../../../src/main/playback/playback-service.js";
import type { PlaybackRequestResolver } from "../../../src/main/playback/playback-request-resolver.js";
import {
  PLAYBACK_AUDIO_OUTCOMES,
  PLAYBACK_FEEDBACK_SURFACES,
  type PlaybackAudioSession
} from "../../../src/shared/app-contracts.js";
import type { MiniMaxTtsRequest } from "../../../src/shared/minimax.js";
import { createReadingSegments } from "../../../src/shared/segments.js";
import type { MiniMaxVoice, ReadingTargetInput } from "../../../src/shared/types.js";

const zhVoice: MiniMaxVoice = {
  voice_id: "voice-zh",
  display_name: "Chinese Voice",
  language: "zh"
};

const stores: AppDataStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});

describe("PlaybackService", () => {
  it("plays the current Reading Target and records successful playback history", async () => {
    const store = await createVerifiedStore();
    const events: PlaybackEvent[] = [];
    const playback = new PlaybackService(store, createSink(events), async (request) => {
      expect(request.apiKey).toBe("playback-key");
      expect(request.voiceId).toBe("voice-zh");
      expect(request.text).toBe("这是一段剪切板文本。");
      await request.onAudioHex("abcd");
    });

    const result = await playback.playReadingTarget(clipboardTargetInput("  这是一段剪切板文本。  "));

    expect(result.started).toBe(true);
    await playback.waitForCurrentGeneration();
    expect(events.at(-1)).toEqual(["generation-finished", result.sessionId]);
    expect(events).not.toContainEqual(["finish", result.sessionId]);
    playback.handleAudioOutcome({
      sessionId: result.sessionId ?? 0,
      status: PLAYBACK_AUDIO_OUTCOMES.completed
    });
    expect(store.listReadingHistoryRecords()).toMatchObject([
      { text: "这是一段剪切板文本。", source: "clipboard" }
    ]);
    expect(events).toEqual([
      ["start", result.sessionId, 1.5, PLAYBACK_FEEDBACK_SURFACES.playbackOverlay, [10]],
      ["chunk", result.sessionId, [171, 205]],
      ["segment-end", result.sessionId],
      ["generation-finished", result.sessionId],
      ["finish", result.sessionId]
    ]);
  });

  it("silently skips playback when the API key is not verified or Voice is missing", async () => {
    const store = await createVerifiedStore();
    const events: PlaybackEvent[] = [];
    const playback = new PlaybackService(store, createSink(events), async () => {
      throw new Error("streaming should not start");
    });

    store.updateSettings({ apiKeyStatus: "failed" });
    await expect(playback.playReadingTarget(clipboardTargetInput("text"))).resolves.toEqual({
      started: false,
      skipped: "unverified_api_key"
    });

    store.updateSettings({ apiKeyStatus: "verified", voices: [] });
    await expect(playback.playReadingTarget(clipboardTargetInput("text"))).resolves.toEqual({
      started: false,
      skipped: "missing_voice"
    });

    expect(events).toEqual([]);
    expect(store.getErrorLogCount()).toBe(0);
  });

  it("logs runtime MiniMax failures and fails the active session", async () => {
    const store = await createVerifiedStore();
    const events: PlaybackEvent[] = [];
    const playback = new PlaybackService(store, createSink(events), async () => {
      throw new Error("MiniMax TTS failed with HTTP 500");
    });

    const result = await playback.playReadingTarget(clipboardTargetInput("这是一段会失败的文本。"));

    expect(result.started).toBe(true);
    await playback.waitForCurrentGeneration();
    expect(events.at(-1)).toEqual(["fail", result.sessionId]);
    expect(store.listErrorLogs()[0]).toMatchObject({
      category: "minimax_runtime",
      message: "MiniMax TTS failed with HTTP 500"
    });
    expect(store.listReadingHistoryRecords().some((record) => record.text === "这是一段会失败的文本。")).toBe(true);
  });

  it("does not report a Playback Session as started when its output is unavailable", async () => {
    const store = await createVerifiedStore();
    const events: PlaybackEvent[] = [];
    let streamed = false;
    const sink = createSink(events);
    sink.startSession = () => {
      throw new Error("Playback Renderer is unavailable.");
    };
    const playback = new PlaybackService(store, sink, async () => {
      streamed = true;
    });

    const result = await playback.playReadingTarget(clipboardTargetInput("输出不可用时不要静默成功。"));

    expect(result).toEqual({ started: false });
    expect(streamed).toBe(false);
    expect(events).toEqual([]);
    expect(store.listErrorLogs()[0]).toMatchObject({
      category: "playback_runtime",
      message: "Playback Renderer is unavailable."
    });
  });

  it("replaces a new Play session by aborting the previous stream and emitting the previous stop event", async () => {
    const store = await createVerifiedStore();
    const events: PlaybackEvent[] = [];
    const requests: MiniMaxTtsRequest[] = [];
    const playback = new PlaybackService(store, createSink(events), async (request) => {
      requests.push(request);
      if (requests.length === 1) {
        await new Promise<void>((resolve) => request.signal.addEventListener("abort", () => resolve(), { once: true }));
        return;
      }
      await request.onAudioHex("abcd");
    });

    const first = await playback.playReadingTarget(selectedTextTargetInput("第一段播放文本。"));
    const second = await playback.playReadingTarget(selectedTextTargetInput("第二段播放文本。"));

    expect(first.started).toBe(true);
    expect(second.started).toBe(true);
    expect(requests[0]?.signal.aborted).toBe(true);
    await playback.waitForCurrentGeneration();
    expect(events).toContainEqual(["stop", first.sessionId]);
    expect(events.slice(-4)).toEqual([
      ["start", second.sessionId, 1.5, PLAYBACK_FEEDBACK_SURFACES.playbackOverlay, [8]],
      ["chunk", second.sessionId, [171, 205]],
      ["segment-end", second.sessionId],
      ["generation-finished", second.sessionId]
    ]);
    playback.handleAudioOutcome({
      sessionId: second.sessionId ?? 0,
      status: PLAYBACK_AUDIO_OUTCOMES.completed
    });
    expect(events.at(-1)).toEqual(["finish", second.sessionId]);
  });

  it("replays History and Favorite records without mutating source records", async () => {
    const store = await createVerifiedStore();
    const history = store.saveOrReuseReadingHistoryRecord({
      text: "这是一条历史重播文本。",
      source: "selected_text",
      segments: createReadingSegments("这是一条历史重播文本。"),
      createdAt: 777_000
    });
    const favoriteSource = store.saveOrReuseReadingHistoryRecord({
      text: "这是一条收藏重播文本。",
      source: "clipboard",
      segments: createReadingSegments("这是一条收藏重播文本。"),
      createdAt: 778_000
    });
    const favorite = store.createFavoriteFromHistoryRecord(favoriteSource.id, 779_000);
    expect(favorite).toBeDefined();
    const historyCount = store.getReadingHistoryCount();
    const streamedTexts: string[] = [];
    const events: PlaybackEvent[] = [];
    const playback = new PlaybackService(store, createSink(events), async (request) => {
      streamedTexts.push(request.text);
      await request.onAudioHex("abcd");
    });

    const historyResult = await playback.playHistoryRecord(history.id);
    await playback.waitForCurrentGeneration();
    playback.handleAudioOutcome({
      sessionId: historyResult.sessionId ?? 0,
      status: PLAYBACK_AUDIO_OUTCOMES.completed
    });
    const favoriteResult = await playback.playFavoriteRecord(favorite?.id ?? "");
    await playback.waitForCurrentGeneration();
    playback.handleAudioOutcome({
      sessionId: favoriteResult.sessionId ?? 0,
      status: PLAYBACK_AUDIO_OUTCOMES.completed
    });

    expect(historyResult.started).toBe(true);
    expect(favoriteResult.started).toBe(true);
    expect(streamedTexts).toEqual(["这是一条历史重播文本。", "这是一条收藏重播文本。"]);
    expect(store.getReadingHistoryCount()).toBe(historyCount);
    expect(store.getReadingHistoryRecord(history.id)?.createdAt).toBe(777_000);
    expect(store.getFavoriteRecord(favorite?.id ?? "")).toMatchObject({
      favoritedAt: 779_000,
      sourceCreatedAt: 778_000
    });
    expect(events).toContainEqual(["start", historyResult.sessionId, 1.5, PLAYBACK_FEEDBACK_SURFACES.historyDetail, [11]]);
    expect(events).toContainEqual(["start", favoriteResult.sessionId, 1.5, PLAYBACK_FEEDBACK_SURFACES.favoriteDetail, [11]]);
  });

  it("accepts only the active Audio Outcome and records browser audio failure without content", async () => {
    const store = await createVerifiedStore();
    const events: PlaybackEvent[] = [];
    const playback = new PlaybackService(store, createSink(events), async (request) => {
      await request.onAudioHex("abcd");
    });

    const result = await playback.playReadingTarget(selectedTextTargetInput("音频输出失败测试。"));
    await playback.waitForCurrentGeneration();
    playback.handleAudioOutcome({
      sessionId: (result.sessionId ?? 0) + 100,
      status: PLAYBACK_AUDIO_OUTCOMES.completed
    });
    expect(events).not.toContainEqual(["finish", result.sessionId]);

    playback.handleAudioOutcome({
      sessionId: result.sessionId ?? 0,
      status: PLAYBACK_AUDIO_OUTCOMES.failed
    });

    expect(events.at(-1)).toEqual(["fail", result.sessionId]);
    expect(store.listErrorLogs()[0]).toMatchObject({
      category: "playback_runtime",
      message: "Browser audio output failed."
    });
    expect(store.listErrorLogs()[0]?.message).not.toContain("音频输出失败测试");
  });

  it("clears the active session when a planned Reading Segment has no Voice", async () => {
    const store = await createVerifiedStore();
    const events: PlaybackEvent[] = [];
    const missingVoiceResult = {
      ok: true as const,
      plan: {
        audioSession: {
          speechRate: 1,
          feedbackSurface: PLAYBACK_FEEDBACK_SURFACES.playbackOverlay,
          segmentWeights: [8]
        },
        segments: [{ missingVoiceLanguage: "zh" as const }]
      }
    };
    const resolver = {
      resolveReadingTarget: () => missingVoiceResult,
      resolveHistoryReplay: () => missingVoiceResult,
      resolveFavoriteReplay: () => missingVoiceResult
    } as unknown as PlaybackRequestResolver;
    const playback = new PlaybackService(
      store,
      createSink(events),
      async () => undefined,
      resolver
    );

    const result = await playback.playReadingTarget(selectedTextTargetInput("缺少中文语音。"));
    expect(result.started).toBe(true);
    await playback.waitForCurrentGeneration();
    expect(events.at(-1)).toEqual(["fail", result.sessionId]);

    const eventCount = events.length;
    playback.stop();
    expect(
      playback.handleAudioOutcome({
        sessionId: result.sessionId ?? 0,
        status: PLAYBACK_AUDIO_OUTCOMES.completed
      })
    ).toBe(false);
    expect(events).toHaveLength(eventCount);
  });

  it("ignores early and replaced Audio Outcomes while preserving the current session", async () => {
    const store = await createVerifiedStore();
    const events: PlaybackEvent[] = [];
    let releaseGeneration: (() => void) | undefined;
    const playback = new PlaybackService(store, createSink(events), async (request) => {
      await new Promise<void>((resolve) => {
        releaseGeneration = resolve;
      });
      await request.onAudioHex("abcd");
    });

    const first = await playback.playReadingTarget(selectedTextTargetInput("第一条终态竞态。"));
    expect(
      playback.handleAudioOutcome({
        sessionId: first.sessionId ?? 0,
        status: PLAYBACK_AUDIO_OUTCOMES.completed
      })
    ).toBe(false);
    releaseGeneration?.();
    await playback.waitForCurrentGeneration();

    const second = await playback.playReadingTarget(selectedTextTargetInput("第二条终态竞态。"));
    expect(events).toContainEqual(["stop", first.sessionId]);
    expect(
      playback.handleAudioOutcome({
        sessionId: first.sessionId ?? 0,
        status: PLAYBACK_AUDIO_OUTCOMES.completed
      })
    ).toBe(false);
    releaseGeneration?.();
    await playback.waitForCurrentGeneration();
    expect(
      playback.handleAudioOutcome({
        sessionId: second.sessionId ?? 0,
        status: PLAYBACK_AUDIO_OUTCOMES.completed
      })
    ).toBe(true);

    expect(events).not.toContainEqual(["finish", first.sessionId]);
    expect(events.at(-1)).toEqual(["finish", second.sessionId]);

    const stopped = await playback.playReadingTarget(selectedTextTargetInput("停止后的延迟终态。"));
    releaseGeneration?.();
    await playback.waitForCurrentGeneration();
    playback.stopSession(stopped.sessionId);
    expect(events.at(-1)).toEqual(["stop", stopped.sessionId]);
    expect(
      playback.handleAudioOutcome({
        sessionId: stopped.sessionId ?? 0,
        status: PLAYBACK_AUDIO_OUTCOMES.completed
      })
    ).toBe(false);
    expect(events).not.toContainEqual(["finish", stopped.sessionId]);
  });
});

type PlaybackEvent =
  | ["start", number | undefined, number, string, number[]]
  | ["chunk", number | undefined, number[]]
  | ["segment-end", number | undefined]
  | ["generation-finished", number | undefined]
  | ["finish", number | undefined]
  | ["fail", number | undefined]
  | ["stop", number | undefined];

function createSink(events: PlaybackEvent[]): PlaybackAudioSink {
  return {
    startSession: (session: PlaybackAudioSession) => {
      events.push([
        "start",
        session.sessionId,
        session.speechRate,
        session.feedbackSurface,
        session.segmentWeights
      ]);
    },
    audioChunk: (sessionId, bytes) => {
      events.push(["chunk", sessionId, Array.from(bytes)]);
    },
    endSegment: (sessionId) => {
      events.push(["segment-end", sessionId]);
    },
    finishGeneration: (sessionId) => {
      events.push(["generation-finished", sessionId]);
    },
    completeSession: (sessionId) => {
      events.push(["finish", sessionId]);
    },
    failSession: (sessionId) => {
      events.push(["fail", sessionId]);
    },
    stopSession: (sessionId) => {
      events.push(["stop", sessionId]);
    }
  };
}

async function createVerifiedStore(): Promise<AppDataStore> {
  const dataDir = await mkdtemp(join(tmpdir(), "voicereader-playback-service-"));
  const store = new AppDataStore(join(dataDir, "voicereader.sqlite"));
  stores.push(store);
  store.saveMiniMaxApiKey("playback-key");
  store.updateSettings({
    apiKeyStatus: "verified",
    voices: [zhVoice],
    preferredVoicesByLanguage: { zh: "voice-zh" },
    speechRate: 1.5
  });
  return store;
}

function clipboardTargetInput(text: string): ReadingTargetInput {
  return { text, source: "clipboard" };
}

function selectedTextTargetInput(text: string): ReadingTargetInput {
  return { text, source: "selected_text" };
}
