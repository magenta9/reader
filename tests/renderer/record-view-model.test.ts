import { describe, expect, it } from "vitest";

import type { FavoriteRecord } from "../../src/renderer/bridge.js";
import {
  groupFavoriteRecords,
  resolveAdjacentSelectionAfterDelete,
  resolveSelectedRecordId
} from "../../src/renderer/record-view-model.js";

describe("record view model", () => {
  it("groups Favorite Records by visible time buckets", () => {
    const now = new Date(2026, 5, 17, 12).getTime();
    const records = [
      createFavoriteRecord("older", new Date(2026, 5, 1, 9).getTime(), "更早收藏全文"),
      createFavoriteRecord("today-early", new Date(2026, 5, 17, 8).getTime(), "今日较早收藏全文"),
      createFavoriteRecord("week", new Date(2026, 5, 15, 10).getTime(), "本周收藏全文"),
      createFavoriteRecord("yesterday", new Date(2026, 5, 16, 11).getTime(), "昨日收藏全文"),
      createFavoriteRecord("today-late", new Date(2026, 5, 17, 10).getTime(), "今日较晚收藏全文")
    ];

    expect(groupFavoriteRecords(records, now).map((group) => [group.label, group.records.map((record) => record.id)])).toEqual([
      ["今天", ["today-late", "today-early"]],
      ["昨天", ["yesterday"]],
      ["本周", ["week"]],
      ["更早", ["older"]]
    ]);
  });

  it("resolves selected and adjacent records after deletion", () => {
    const records = [
      createFavoriteRecord("today-late", 3000, "今日较晚收藏全文"),
      createFavoriteRecord("today-early", 2000, "今日较早收藏全文"),
      createFavoriteRecord("yesterday", 1000, "昨日收藏全文")
    ];

    expect(resolveSelectedRecordId(records, undefined)).toBeUndefined();
    expect(resolveSelectedRecordId(records, "yesterday")).toBe("yesterday");
    expect(resolveSelectedRecordId(records, "missing", "today-late")).toBe("today-late");
    expect(resolveSelectedRecordId([], "today-late")).toBeUndefined();
    expect(resolveAdjacentSelectionAfterDelete(records, "today-early")).toBe("yesterday");
    expect(resolveAdjacentSelectionAfterDelete(records, "yesterday")).toBe("today-early");
    expect(resolveAdjacentSelectionAfterDelete([records[0]], "today-late")).toBeUndefined();
  });
});

function createFavoriteRecord(id: string, favoritedAt: number, text: string): FavoriteRecord {
  return {
    id,
    text,
    preview: text,
    durationEstimateSeconds: 1,
    languageSummary: "中文",
    source: "clipboard",
    sourceCreatedAt: favoritedAt - 1000,
    favoritedAt
  };
}
