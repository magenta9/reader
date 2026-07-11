import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { AppDataStore } from "../../../src/main/data/app-data-store.js";
import { DEFAULT_ACTIVATION_SHORTCUT, LEGACY_DEFAULT_ACTIVATION_SHORTCUT } from "../../../src/shared/app-contracts.js";
import { createReadingSegments } from "../../../src/shared/segments.js";

describe("AppDataStore", () => {
  it("creates the local app data database and required tables", async () => {
    const { store, dbPath } = await createStore();
    try {
      expect(existsSync(dbPath)).toBe(true);
      const schemaDb = new DatabaseSync(dbPath);
      try {
        const tables = schemaDb
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all()
          .map((row) => String(row.name));

        expect(tables).toEqual(expect.arrayContaining(["settings", "reading_history", "favorite_records", "error_log"]));
      } finally {
        schemaDb.close();
      }
    } finally {
      store.close();
    }
  });

  it("normalizes Settings defaults, updates, and legacy shortcut migration", async () => {
    const { store } = await createStore();
    try {
      expect(store.getSettings().activationShortcut).toBe(DEFAULT_ACTIVATION_SHORTCUT);
      expect(store.getSettings().historyRetention).toBe("1m");

      const updated = store.updateSettings({
        hasCompletedOnboarding: true,
        launchAtLogin: true,
        speechRate: 2.75,
        model: "custom-model",
        historyRetention: "7d"
      });

      expect(updated.hasCompletedOnboarding).toBe(true);
      expect(updated.launchAtLogin).toBe(true);
      expect(updated.speechRate).toBe(2.75);
      expect(updated.model).toBe("custom-model");
      expect(updated.historyRetention).toBe("7d");
    } finally {
      store.close();
    }

    const dbPath = await createSettingsDatabase("app.settings", JSON.stringify({ activationShortcut: LEGACY_DEFAULT_ACTIVATION_SHORTCUT }));
    const migrated = new AppDataStore(dbPath);
    try {
      expect(migrated.getSettings().activationShortcut).toBe(DEFAULT_ACTIVATION_SHORTCUT);
      expect(JSON.parse(migrated.getRawSettingForTest("app.settings") ?? "{}").activationShortcut).toBe(DEFAULT_ACTIVATION_SHORTCUT);
    } finally {
      migrated.close();
    }
  });

  it("persists MiniMax API keys and removes the legacy encrypted key", async () => {
    const legacyDbPath = await createSettingsDatabase("minimax.apiKey.encrypted", "legacy-safe-storage-ciphertext");
    const legacyStore = new AppDataStore(legacyDbPath);
    try {
      expect(legacyStore.getRawSettingForTest("minimax.apiKey.encrypted")).toBeUndefined();
      expect(legacyStore.readMiniMaxApiKey()).toBeUndefined();
    } finally {
      legacyStore.close();
    }

    const { store } = await createStore();
    try {
      store.saveMiniMaxApiKey("secret-minimax-key");
      expect(store.hasMiniMaxApiKey()).toBe(true);
      expect(store.readMiniMaxApiKey()).toBe("secret-minimax-key");
      expect(store.getRawSettingForTest("minimax.apiKey")).toBe("secret-minimax-key");

      store.clearMiniMaxApiKey();
      expect(store.hasMiniMaxApiKey()).toBe(false);
      expect(store.readMiniMaxApiKey()).toBeUndefined();
    } finally {
      store.close();
    }
  });

  it("persists, orders, deduplicates, deletes, clears, and expires Reading History", async () => {
    const { store } = await createStore();
    try {
      const historyA = store.saveOrReuseReadingHistoryRecord({
        text: "第一段中文文本。\n\nSecond English paragraph for duration.",
        source: "clipboard",
        segments: historySegments(),
        createdAt: 10_000_000
      });

      expect(historyA.preview).toBe("第一段中文文本。");
      expect(historyA.languageSummary).toBe("中文 / 英文");
      expect(historyA.source).toBe("clipboard");
      expect(Object.keys(historyA).sort()).toEqual([
        "createdAt",
        "durationEstimateSeconds",
        "id",
        "languageSummary",
        "preview",
        "source",
        "text"
      ]);

      const historyReuse = store.saveOrReuseReadingHistoryRecord({
        text: historyA.text,
        source: "clipboard",
        segments: historySegments(),
        createdAt: 10_000_000 + 4 * 60 * 1000
      });
      expect(historyReuse.id).toBe(historyA.id);

      const historySelectedSource = store.saveOrReuseReadingHistoryRecord({
        text: historyA.text,
        source: "selected_text",
        segments: historySegments(),
        createdAt: 10_000_000 + 4 * 60 * 1000
      });
      expect(historySelectedSource.id).not.toBe(historyA.id);

      const historyB = store.saveOrReuseReadingHistoryRecord({
        text: historyA.text,
        source: "clipboard",
        segments: historySegments(),
        createdAt: 10_000_000 + 6 * 60 * 1000
      });
      expect(historyB.id).not.toBe(historyA.id);
      expect(store.getReadingHistoryCount()).toBe(3);

      const deleteA = store.saveOrReuseReadingHistoryRecord({
        text: "待删除记录 A",
        source: "clipboard",
        segments: createReadingSegments("待删除记录 A"),
        createdAt: 20_000_000
      });
      const deleteB = store.saveOrReuseReadingHistoryRecord({
        text: "待删除记录 B",
        source: "clipboard",
        segments: createReadingSegments("待删除记录 B"),
        createdAt: 20_001_000
      });
      expect(store.listReadingHistoryRecords().slice(0, 2).map((record) => record.id)).toEqual([deleteB.id, deleteA.id]);
      expect(store.getReadingHistoryRecord(deleteA.id)?.text).toBe("待删除记录 A");
      store.deleteReadingHistoryRecord(deleteA.id);
      expect(store.getReadingHistoryRecord(deleteA.id)).toBeUndefined();

      store.updateSettings({ historyRetention: "7d" });
      store.saveOrReuseReadingHistoryRecord({
        text: "旧记录",
        source: "clipboard",
        segments: createReadingSegments("旧记录"),
        createdAt: 1
      });
      store.cleanupExpiredReadingHistory(8 * 24 * 60 * 60 * 1000 + 2, "7d");
      expect(store.listReadingHistoryRecords().some((record) => record.text === "旧记录")).toBe(false);

      store.updateSettings({ historyRetention: "forever" });
      store.saveOrReuseReadingHistoryRecord({
        text: "永久保留记录",
        source: "clipboard",
        segments: createReadingSegments("永久保留记录"),
        createdAt: 2
      });
      store.cleanupExpiredReadingHistory(365 * 24 * 60 * 60 * 1000, "forever");
      expect(store.listReadingHistoryRecords().some((record) => record.text === "永久保留记录")).toBe(true);

      store.clearReadingHistory();
      expect(store.getReadingHistoryCount()).toBe(0);
    } finally {
      store.close();
    }
  });

  it("derives Reading History Record metadata through the store interface", async () => {
    const { store } = await createStore();
    try {
      const longText = ` ${"a".repeat(130)} `;
      const emptyLanguageRecord = store.saveOrReuseReadingHistoryRecord({
        text: longText,
        source: "clipboard",
        segments: []
      });
      const mixedLanguageRecord = store.saveOrReuseReadingHistoryRecord({
        text: "第一段中文文本。\n\nSecond English paragraph.",
        source: "selected_text",
        segments: [
          ...historySegments(),
          { id: "segment-unknown", text: "???", language: "unknown" }
        ]
      });

      expect(emptyLanguageRecord.preview).toBe(`${"a".repeat(119)}…`);
      expect(emptyLanguageRecord.languageSummary).toBe("未知");
      expect(emptyLanguageRecord.durationEstimateSeconds).toBeGreaterThan(0);
      expect(mixedLanguageRecord.languageSummary).toBe("中文 / 英文 / 未知");
    } finally {
      store.close();
    }
  });

  it("persists duplicate Favorite Records independently from Reading History", async () => {
    const { store } = await createStore();
    try {
      const history = store.saveOrReuseReadingHistoryRecord({
        text: "收藏来源全文。",
        source: "clipboard",
        segments: historySegments(),
        createdAt: 10_000
      });

      expect(store.createFavoriteFromHistoryRecord("missing-history-record", 30_000)).toBeUndefined();
      const favorite = store.createFavoriteFromHistoryRecord(history.id, 30_000);
      const duplicate = store.createFavoriteFromHistoryRecord(history.id, 31_000);

      expect(favorite).toBeDefined();
      expect(duplicate).toBeDefined();
      expect(duplicate?.id).not.toBe(favorite?.id);
      expect(favorite?.text).toBe(history.text);
      expect(favorite?.sourceCreatedAt).toBe(history.createdAt);
      expect(store.getFavoriteRecord(favorite?.id ?? "")).toEqual(favorite);
      expect(store.listFavoriteRecords().map((record) => record.id)).toEqual([duplicate?.id, favorite?.id]);

      store.deleteReadingHistoryRecord(history.id);
      expect(store.getReadingHistoryRecord(history.id)).toBeUndefined();
      expect(store.getFavoriteRecord(favorite?.id ?? "")?.text).toBe(history.text);

      const expiredHistory = store.saveOrReuseReadingHistoryRecord({
        text: "旧记录",
        source: "clipboard",
        segments: createReadingSegments("旧记录"),
        createdAt: 1
      });
      const expiredFavorite = store.createFavoriteFromHistoryRecord(expiredHistory.id, 32_000);
      store.cleanupExpiredReadingHistory(8 * 24 * 60 * 60 * 1000 + 2, "7d");
      expect(store.listReadingHistoryRecords().some((record) => record.text === "旧记录")).toBe(false);
      expect(store.getFavoriteRecord(expiredFavorite?.id ?? "")?.text).toBe("旧记录");

      store.clearReadingHistory();
      expect(store.listFavoriteRecords().map((record) => record.id)).toEqual([
        expiredFavorite?.id,
        duplicate?.id,
        favorite?.id
      ]);

      store.deleteFavoriteRecord(duplicate?.id ?? "");
      expect(store.getFavoriteRecord(duplicate?.id ?? "")).toBeUndefined();
      expect(store.getFavoriteRecord(favorite?.id ?? "")).toBeDefined();
      expect(store.getFavoriteRecord(expiredFavorite?.id ?? "")).toBeDefined();
    } finally {
      store.close();
    }
  });

  it("keeps skipped input out of Error Log and caps runtime failures", async () => {
    const { store } = await createStore();
    try {
      store.recordSkippedPlaybackInput("empty_clipboard");
      store.recordSkippedPlaybackInput("non_text_clipboard");
      store.recordSkippedPlaybackInput("missing_api_key");
      expect(store.getErrorLogCount()).toBe(0);

      for (let index = 0; index < 105; index += 1) {
        store.addErrorLog({
          category: "playback_runtime",
          message: ` failure ${index} `.repeat(20),
          createdAt: index
        });
      }

      expect(store.getErrorLogCount()).toBe(100);
      const logs = store.listErrorLogs();
      expect(logs).toHaveLength(100);
      expect(logs[0]?.createdAt).toBe(104);
      expect(logs.at(-1)?.createdAt).toBe(5);
      expect(logs.every((entry) => entry.message.length <= 240)).toBe(true);

      store.clearErrorLogs();
      expect(store.getErrorLogCount()).toBe(0);
    } finally {
      store.close();
    }
  });
});

async function createStore(): Promise<{ store: AppDataStore; dbPath: string }> {
  const dataDir = await mkdtemp(join(tmpdir(), "voicereader-data-store-"));
  const dbPath = join(dataDir, "voicereader.sqlite");
  return { store: new AppDataStore(dbPath), dbPath };
}

async function createSettingsDatabase(key: string, value: string): Promise<string> {
  const dataDir = await mkdtemp(join(tmpdir(), "voicereader-settings-"));
  const dbPath = join(dataDir, "voicereader.sqlite");
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(key, value);
  } finally {
    db.close();
  }
  return dbPath;
}

function historySegments() {
  return [
    { id: "segment-1", text: "第一段中文文本。", language: "zh" as const },
    { id: "segment-2", text: "Second English paragraph for duration.", language: "en" as const }
  ];
}
