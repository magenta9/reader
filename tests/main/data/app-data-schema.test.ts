import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it, vi } from "vitest";

import { assertCurrentAppDataSchema, CURRENT_APP_DATA_SCHEMA_VERSION } from "../../../src/main/data/app-data-schema.js";
import { AppDataStore } from "../../../src/main/data/app-data-store.js";
import { DEFAULT_ACTIVATION_SHORTCUT } from "../../../src/shared/app-contracts.js";
import {
  createCurrentFourTableDatabase,
  createLegacyThreeTableDatabase,
  listUserTables,
  readUserVersion
} from "./app-data-schema-fixtures.js";

describe("App Data schema lifecycle", () => {
  it("creates and validates the exact v1 schema for a fresh database", () => {
    const databasePath = createDatabasePath();
    const database = new DatabaseSync(databasePath);
    try {
      openAndClose(databasePath);

      expect(readUserVersion(database)).toBe(CURRENT_APP_DATA_SCHEMA_VERSION);
      expect(listUserTables(database)).toEqual([
        "error_log",
        "favorite_records",
        "reading_history",
        "settings"
      ]);
      expect(() => assertCurrentAppDataSchema(database)).not.toThrow();
    } finally {
      database.close();
    }
  });

  it.each(["direct", "encrypted"] as const)(
    "upgrades the real three-table %s-key schema and preserves sentinel data",
    (apiKey) => {
      const databasePath = createDatabasePath();
      const database = createLegacyThreeTableDatabase(databasePath, { apiKey });
      try {
        openAndClose(databasePath);

        expect(readUserVersion(database)).toBe(1);
        expect(listUserTables(database)).toContain("favorite_records");
        expect(database.prepare("SELECT text FROM reading_history WHERE id = ?").get("history-sentinel")).toMatchObject({
          text: "history sentinel text"
        });
        expect(database.prepare("SELECT message FROM error_log").get()).toMatchObject({
          message: "sentinel error"
        });
        const settings = JSON.parse(
          String(database.prepare("SELECT value FROM settings WHERE key = ?").get("app.settings")?.value)
        );
        expect(settings.activationShortcut).toBe(DEFAULT_ACTIVATION_SHORTCUT);
        expect(database.prepare("SELECT value FROM settings WHERE key = ?").get("minimax.apiKey.encrypted")).toBeUndefined();
        if (apiKey === "direct") {
          expect(database.prepare("SELECT value FROM settings WHERE key = ?").get("minimax.apiKey")).toMatchObject({
            value: "direct-key"
          });
        }
      } finally {
        database.close();
      }
    }
  );

  it("versions an unversioned current schema without changing any table data", () => {
    const databasePath = createDatabasePath();
    const database = createCurrentFourTableDatabase(databasePath, { apiKey: "direct" });
    try {
      openAndClose(databasePath);
      database
        .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
        .run("minimax.apiKey.encrypted", "downgraded-encrypted-key");
      database
        .prepare("UPDATE settings SET value = ? WHERE key = ?")
        .run(JSON.stringify({ activationShortcut: "Command+Shift+R" }), "app.settings");
      openAndClose(databasePath);

      expect(readUserVersion(database)).toBe(1);
      expect(database.prepare("SELECT text FROM favorite_records WHERE id = ?").get("favorite-sentinel")).toMatchObject({
        text: "favorite sentinel text"
      });
      expect(database.prepare("SELECT value FROM settings WHERE key = ?").get("minimax.apiKey")).toMatchObject({
        value: "direct-key"
      });
      expect(database.prepare("SELECT value FROM settings WHERE key = ?").get("minimax.apiKey.encrypted")).toBeUndefined();
      expect(
        JSON.parse(String(database.prepare("SELECT value FROM settings WHERE key = ?").get("app.settings")?.value))
          .activationShortcut
      ).toBe(DEFAULT_ACTIVATION_SHORTCUT);
      expect(() => assertCurrentAppDataSchema(database)).not.toThrow();
    } finally {
      database.close();
    }
  });

  it("fails closed for future and unknown schemas without modifying their data", () => {
    const futurePath = createDatabasePath();
    const future = createCurrentFourTableDatabase(futurePath, { apiKey: "direct" });
    try {
      future.exec("PRAGMA user_version = 2");
      expect(() => AppDataStore.open(futurePath)).toThrow("newer than supported");
      expect(readUserVersion(future)).toBe(2);
      expect(future.prepare("SELECT value FROM settings WHERE key = ?").get("minimax.apiKey")).toMatchObject({
        value: "direct-key"
      });
    } finally {
      future.close();
    }

    const unknownPath = createDatabasePath();
    const unknown = new DatabaseSync(unknownPath);
    try {
      unknown.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
      expect(() => AppDataStore.open(unknownPath)).toThrow("unknown unversioned schema");
      expect(readUserVersion(unknown)).toBe(0);
      expect(listUserTables(unknown)).toEqual(["settings"]);
    } finally {
      unknown.close();
    }
  });

  it("rejects an incorrect explicit index contract before compatibility writes", () => {
    const databasePath = createDatabasePath();
    const database = createLegacyThreeTableDatabase(databasePath, { apiKey: "encrypted" });
    try {
      database.exec(`
        DROP INDEX idx_reading_history_created_at;
        CREATE INDEX idx_reading_history_created_at ON reading_history (created_at ASC);
      `);

      expect(() => AppDataStore.open(databasePath)).toThrow("unknown unversioned schema");
      expect(database.prepare("SELECT value FROM settings WHERE key = ?").get("minimax.apiKey.encrypted")).toMatchObject({
        value: "encrypted-key"
      });
      expect(readUserVersion(database)).toBe(0);
    } finally {
      database.close();
    }
  });

  it.each([
    [
      "a default constraint",
      `
        ALTER TABLE settings RENAME TO settings_old;
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT 'fallback');
        INSERT INTO settings (key, value) SELECT key, value FROM settings_old;
        DROP TABLE settings_old;
      `
    ],
    [
      "a composite primary key",
      `
        DROP INDEX idx_reading_history_created_at;
        ALTER TABLE reading_history RENAME TO reading_history_old;
        CREATE TABLE reading_history (
          id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          text TEXT NOT NULL,
          preview TEXT NOT NULL,
          duration_estimate_seconds INTEGER NOT NULL,
          language_summary TEXT NOT NULL,
          source TEXT NOT NULL,
          PRIMARY KEY (id, created_at)
        );
        INSERT INTO reading_history
        SELECT * FROM reading_history_old;
        DROP TABLE reading_history_old;
        CREATE INDEX idx_reading_history_created_at ON reading_history (created_at DESC);
      `
    ],
    [
      "a generated hidden column",
      "ALTER TABLE settings ADD COLUMN shadow TEXT GENERATED ALWAYS AS (key) VIRTUAL"
    ]
  ])("rejects an otherwise familiar schema with %s", (_variant, mutation) => {
    const databasePath = createDatabasePath();
    const database = createCurrentFourTableDatabase(databasePath, { apiKey: "direct" });
    try {
      database.exec(mutation);

      expect(() => AppDataStore.open(databasePath)).toThrow("unknown unversioned schema");
      expect(readUserVersion(database)).toBe(0);
      expect(database.prepare("SELECT value FROM settings WHERE key = ?").get("minimax.apiKey")).toMatchObject({
        value: "direct-key"
      });
    } finally {
      database.close();
    }
  });

  it("rolls back additive DDL, compatibility writes, and version when migration fails", () => {
    const databasePath = createDatabasePath();
    const database = createLegacyThreeTableDatabase(databasePath, {
      apiKey: "encrypted",
      malformedSettings: true
    });
    try {
      expect(() => AppDataStore.open(databasePath)).toThrow("App Data schema migration failed");

      expect(readUserVersion(database)).toBe(0);
      expect(listUserTables(database)).not.toContain("favorite_records");
      expect(database.prepare("SELECT value FROM settings WHERE key = ?").get("minimax.apiKey.encrypted")).toMatchObject({
        value: "encrypted-key"
      });
    } finally {
      database.close();
    }
  });

  it("uses a finite busy timeout when another opener holds the migration lock", () => {
    const databasePath = createDatabasePath();
    const locker = new DatabaseSync(databasePath);
    try {
      locker.exec("BEGIN IMMEDIATE");

      expect(() => AppDataStore.open(databasePath)).toThrow("database is locked");
      expect(readUserVersion(locker)).toBe(0);
      expect(listUserTables(locker)).toEqual([]);
    } finally {
      locker.exec("ROLLBACK");
      locker.close();
    }

    openAndClose(databasePath);
    const verified = new DatabaseSync(databasePath);
    try {
      expect(readUserVersion(verified)).toBe(1);
    } finally {
      verified.close();
    }
  });

  it("closes its SQLite handle when opening fails", () => {
    const databasePath = createDatabasePath();
    const database = createCurrentFourTableDatabase(databasePath);
    database.exec("PRAGMA user_version = 2");
    database.close();
    const close = vi.spyOn(DatabaseSync.prototype, "close");
    try {
      expect(() => AppDataStore.open(databasePath)).toThrow("newer than supported");
      expect(close).toHaveBeenCalledTimes(1);
    } finally {
      close.mockRestore();
    }
  });
});

function createDatabasePath(): string {
  return join(mkdtempSync(join(tmpdir(), "voicereader-schema-")), "voicereader.sqlite");
}

function openAndClose(databasePath: string): void {
  AppDataStore.open(databasePath).close();
}
