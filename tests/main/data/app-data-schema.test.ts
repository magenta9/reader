import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  assertCurrentAppDataSchema,
  CURRENT_APP_DATA_SCHEMA_VERSION,
  migrateAppDataSchema
} from "../../../src/main/data/app-data-schema.js";
import { DEFAULT_ACTIVATION_SHORTCUT } from "../../../src/shared/app-contracts.js";
import {
  createCurrentFourTableDatabase,
  createLegacyThreeTableDatabase,
  listUserTables,
  readUserVersion
} from "./app-data-schema-fixtures.js";

describe("App Data schema lifecycle", () => {
  it("creates and validates the exact v1 schema for a fresh database", () => {
    const database = new DatabaseSync(createDatabasePath());
    try {
      migrateAppDataSchema(database);

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
      const database = createLegacyThreeTableDatabase(createDatabasePath(), { apiKey });
      try {
        migrateAppDataSchema(database);

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
    const database = createCurrentFourTableDatabase(createDatabasePath(), { apiKey: "direct" });
    try {
      migrateAppDataSchema(database);
      database
        .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
        .run("minimax.apiKey.encrypted", "downgraded-encrypted-key");
      database
        .prepare("UPDATE settings SET value = ? WHERE key = ?")
        .run(JSON.stringify({ activationShortcut: "Command+Shift+R" }), "app.settings");
      migrateAppDataSchema(database);

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
    const future = createCurrentFourTableDatabase(createDatabasePath(), { apiKey: "direct" });
    try {
      future.exec("PRAGMA user_version = 2");
      expect(() => migrateAppDataSchema(future)).toThrow("newer than supported");
      expect(readUserVersion(future)).toBe(2);
      expect(future.prepare("SELECT value FROM settings WHERE key = ?").get("minimax.apiKey")).toMatchObject({
        value: "direct-key"
      });
    } finally {
      future.close();
    }

    const unknown = new DatabaseSync(createDatabasePath());
    try {
      unknown.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
      expect(() => migrateAppDataSchema(unknown)).toThrow("unknown unversioned schema");
      expect(readUserVersion(unknown)).toBe(0);
      expect(listUserTables(unknown)).toEqual(["settings"]);
    } finally {
      unknown.close();
    }
  });

  it("rejects an incorrect explicit index contract before compatibility writes", () => {
    const database = createLegacyThreeTableDatabase(createDatabasePath(), { apiKey: "encrypted" });
    try {
      database.exec(`
        DROP INDEX idx_reading_history_created_at;
        CREATE INDEX idx_reading_history_created_at ON reading_history (created_at ASC);
      `);

      expect(() => migrateAppDataSchema(database)).toThrow("unknown unversioned schema");
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
    const database = createCurrentFourTableDatabase(createDatabasePath(), { apiKey: "direct" });
    try {
      database.exec(mutation);

      expect(() => migrateAppDataSchema(database)).toThrow("unknown unversioned schema");
      expect(readUserVersion(database)).toBe(0);
      expect(database.prepare("SELECT value FROM settings WHERE key = ?").get("minimax.apiKey")).toMatchObject({
        value: "direct-key"
      });
    } finally {
      database.close();
    }
  });

  it("rolls back additive DDL, compatibility writes, and version when migration fails", () => {
    const database = createLegacyThreeTableDatabase(createDatabasePath(), {
      apiKey: "encrypted",
      malformedSettings: true
    });
    try {
      expect(() => migrateAppDataSchema(database)).toThrow("App Data schema migration failed");

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
    const contender = new DatabaseSync(databasePath);
    try {
      locker.exec("BEGIN IMMEDIATE");

      expect(() => migrateAppDataSchema(contender)).toThrow("database is locked");
      expect(readUserVersion(contender)).toBe(0);
      expect(listUserTables(contender)).toEqual([]);
    } finally {
      locker.exec("ROLLBACK");
      locker.close();
      contender.close();
    }
  });
});

function createDatabasePath(): string {
  return join(mkdtempSync(join(tmpdir(), "voicereader-schema-")), "voicereader.sqlite");
}
