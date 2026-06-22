import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AppDataStore } from "../../../src/main/data/app-data-store.js";
import { PlaybackRequestResolver } from "../../../src/main/playback/playback-request-resolver.js";
import { PLAYBACK_FEEDBACK_SURFACES } from "../../../src/shared/app-contracts.js";
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

describe("PlaybackRequestResolver", () => {
  it("resolves current Reading Target playback and routes feedback to the playback overlay", async () => {
    const store = await createVerifiedStore();
    const resolver = new PlaybackRequestResolver(store);

    const resolved = resolver.resolveReadingTarget(clipboardTargetInput("  解析器剪切板文本。  "));

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.request.apiKey).toBe("playback-key");
    expect(resolved.request.target).toMatchObject({
      text: "解析器剪切板文本。",
      source: "clipboard"
    });
    expect(resolved.request.feedbackSurface).toBe(PLAYBACK_FEEDBACK_SURFACES.playbackOverlay);
    expect(store.listReadingHistoryRecords()).toMatchObject([
      { text: "解析器剪切板文本。", source: "clipboard" }
    ]);
  });

  it("resolves History Replay and Favorite Replay from saved full text without mutating records", async () => {
    const store = await createVerifiedStore();
    const resolver = new PlaybackRequestResolver(store);
    const history = store.saveOrReuseReadingHistoryRecord({
      text: "命令历史重播。",
      source: "selected_text",
      segments: createReadingSegments("命令历史重播。"),
      createdAt: 888_000
    });
    const favorite = store.createFavoriteFromHistoryRecord(history.id, 889_000);
    expect(favorite).toBeDefined();

    const historyResult = resolver.resolveHistoryReplay(history.id);
    const favoriteResult = resolver.resolveFavoriteReplay(favorite?.id ?? "");

    expect(historyResult.ok).toBe(true);
    expect(favoriteResult.ok).toBe(true);
    if (!historyResult.ok || !favoriteResult.ok) return;
    expect(historyResult.request.target).toMatchObject({
      title: "History Replay",
      text: "命令历史重播。",
      url: `history:${history.id}`
    });
    expect(historyResult.request.feedbackSurface).toBe(PLAYBACK_FEEDBACK_SURFACES.historyDetail);
    expect(favoriteResult.request.target).toMatchObject({
      title: "Favorite Replay",
      text: "命令历史重播。",
      url: `favorite:${favorite?.id}`
    });
    expect(favoriteResult.request.feedbackSurface).toBe(PLAYBACK_FEEDBACK_SURFACES.favoriteDetail);
    expect(store.getReadingHistoryCount()).toBe(1);
    expect(store.getReadingHistoryRecord(history.id)?.createdAt).toBe(888_000);
    expect(store.getFavoriteRecord(favorite?.id ?? "")?.favoritedAt).toBe(889_000);
  });

  it("returns expected skip reasons for empty input and missing saved replay records", async () => {
    const store = await createVerifiedStore();
    const resolver = new PlaybackRequestResolver(store);

    expect(resolver.resolveReadingTarget(clipboardTargetInput("   "))).toEqual({
      ok: false,
      result: { started: false, skipped: "empty_clipboard" }
    });
    expect(resolver.resolveHistoryReplay("missing-history")).toEqual({
      ok: false,
      result: { started: false, skipped: "missing_history_record" }
    });
    expect(resolver.resolveFavoriteReplay("missing-favorite")).toEqual({
      ok: false,
      result: { started: false, skipped: "missing_favorite_record" }
    });
  });
});

async function createVerifiedStore(): Promise<AppDataStore> {
  const dataDir = await mkdtemp(join(tmpdir(), "voicereader-playback-resolver-"));
  const store = new AppDataStore(join(dataDir, "voicereader.sqlite"));
  stores.push(store);
  store.saveMiniMaxApiKey("playback-key");
  store.updateSettings({
    apiKeyStatus: "verified",
    voices: [zhVoice],
    preferredVoicesByLanguage: { zh: "voice-zh" }
  });
  return store;
}

function clipboardTargetInput(text: string): ReadingTargetInput {
  return { text, source: "clipboard" };
}
