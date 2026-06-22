import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AppDataStore } from "../../../src/main/data/app-data-store.js";
import {
  createReadingHistoryPreview,
  createReadingHistoryRecord,
  estimateReadingDurationSeconds,
  readingHistoryRetentionCutoff,
  summarizeReadingSegmentLanguages
} from "../../../src/main/data/reading-history-record.js";
import type { ReadingSegment } from "../../../src/shared/types.js";

const historySegments: ReadingSegment[] = [
  { id: "segment-1", text: "中文。", language: "zh" },
  { id: "segment-2", text: "English sentence.", language: "en" },
  { id: "segment-3", text: "???", language: "unknown" }
];

describe("Reading History Record model", () => {
  it("creates display metadata from a Reading Target", () => {
    const record = createReadingHistoryRecord({
      text: "第一行会作为预览。\n\nSecond English paragraph.",
      source: "selected_text",
      segments: historySegments,
      createdAt: 123_456
    });

    expect(record.createdAt).toBe(123_456);
    expect(record.preview).toBe("第一行会作为预览。");
    expect(record.languageSummary).toBe("中文 / 英文 / 未知");
    expect(record.source).toBe("selected_text");
    expect(record.durationEstimateSeconds).toBeGreaterThan(0);
  });

  it("derives preview, language summary, duration, and retention cutoff", () => {
    expect(createReadingHistoryPreview(` ${"a".repeat(130)} `)).toBe(`${"a".repeat(119)}…`);
    expect(summarizeReadingSegmentLanguages([])).toBe("未知");
    expect(estimateReadingDurationSeconds("这是一段中文。English words here.")).toBeGreaterThan(0);
    expect(readingHistoryRetentionCutoff(1000, "forever")).toBeUndefined();
    expect(readingHistoryRetentionCutoff(8 * 24 * 60 * 60 * 1000, "7d")).toBe(24 * 60 * 60 * 1000);
  });
});

describe("Reading History and Favorite Record source seam", () => {
  it("reuses duplicate Reading Targets only within the dedupe window and same source", async () => {
    const store = await createStore();
    try {
      const first = store.saveOrReuseReadingHistoryRecord({
        text: "第一段中文文本。\n\nSecond English paragraph for duration.",
        source: "clipboard",
        segments: historySegments,
        createdAt: 10_000_000
      });

      const reused = store.saveOrReuseReadingHistoryRecord({
        text: first.text,
        source: "clipboard",
        segments: historySegments,
        createdAt: 10_000_000 + 4 * 60 * 1000
      });

      const differentSource = store.saveOrReuseReadingHistoryRecord({
        text: first.text,
        source: "selected_text",
        segments: historySegments,
        createdAt: 10_000_000 + 4 * 60 * 1000
      });

      const afterWindow = store.saveOrReuseReadingHistoryRecord({
        text: first.text,
        source: "clipboard",
        segments: historySegments,
        createdAt: 10_000_000 + 6 * 60 * 1000
      });

      expect(reused.id).toBe(first.id);
      expect(differentSource.id).not.toBe(first.id);
      expect(afterWindow.id).not.toBe(first.id);
      expect(store.getReadingHistoryCount()).toBe(3);
    } finally {
      store.close();
    }
  });

  it("creates duplicate Favorite Records that survive ordinary Reading History deletion", async () => {
    const store = await createStore();
    try {
      const history = store.saveOrReuseReadingHistoryRecord({
        text: "收藏来源全文。",
        source: "clipboard",
        segments: historySegments,
        createdAt: 20_000
      });

      const favorite = store.createFavoriteFromHistoryRecord(history.id, 30_000);
      const duplicate = store.createFavoriteFromHistoryRecord(history.id, 31_000);

      expect(favorite).toBeDefined();
      expect(duplicate).toBeDefined();
      expect(duplicate?.id).not.toBe(favorite?.id);
      expect(favorite?.text).toBe(history.text);
      expect(favorite?.sourceCreatedAt).toBe(history.createdAt);

      store.deleteReadingHistoryRecord(history.id);

      expect(store.getReadingHistoryRecord(history.id)).toBeUndefined();
      expect(store.getFavoriteRecord(favorite?.id ?? "")?.text).toBe(history.text);
      expect(store.getFavoriteRecord(duplicate?.id ?? "")?.text).toBe(history.text);
    } finally {
      store.close();
    }
  });
});

async function createStore(): Promise<AppDataStore> {
  const dataDir = await mkdtemp(join(tmpdir(), "voicereader-record-model-"));
  return new AppDataStore(join(dataDir, "voicereader.sqlite"));
}
