import { DatabaseSync } from "node:sqlite";

export interface AppDataFixtureOptions {
  apiKey?: "direct" | "encrypted";
  malformedSettings?: boolean;
}

export function createLegacyThreeTableDatabase(
  databasePath: string,
  options: AppDataFixtureOptions = {}
): DatabaseSync {
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE reading_history (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      text TEXT NOT NULL,
      preview TEXT NOT NULL,
      duration_estimate_seconds INTEGER NOT NULL,
      language_summary TEXT NOT NULL,
      source TEXT NOT NULL
    );

    CREATE INDEX idx_reading_history_created_at
    ON reading_history (created_at DESC);

    CREATE TABLE error_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL
    );

    CREATE INDEX idx_error_log_created_at
    ON error_log (created_at DESC);
  `);
  seedCommonFixtureData(database, options);
  return database;
}

export function createCurrentFourTableDatabase(
  databasePath: string,
  options: AppDataFixtureOptions = {}
): DatabaseSync {
  const database = createLegacyThreeTableDatabase(databasePath, options);
  database.exec(`
    CREATE TABLE favorite_records (
      id TEXT PRIMARY KEY,
      favorited_at INTEGER NOT NULL,
      source_created_at INTEGER NOT NULL,
      text TEXT NOT NULL,
      preview TEXT NOT NULL,
      duration_estimate_seconds INTEGER NOT NULL,
      language_summary TEXT NOT NULL,
      source TEXT NOT NULL
    );

    CREATE INDEX idx_favorite_records_favorited_at
    ON favorite_records (favorited_at DESC);

    INSERT INTO favorite_records (
      id, favorited_at, source_created_at, text, preview,
      duration_estimate_seconds, language_summary, source
    ) VALUES (
      'favorite-sentinel', 1700000001000, 1700000000000,
      'favorite sentinel text', 'favorite sentinel', 11, '英文', 'clipboard'
    );
  `);
  return database;
}

export function readUserVersion(database: DatabaseSync): number {
  const row = database.prepare("PRAGMA user_version").get() as unknown as { user_version: number };
  return row.user_version;
}

export function listUserTables(database: DatabaseSync): string[] {
  return (database
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as unknown as Array<{ name: string }>).map((row) => row.name);
}

function seedCommonFixtureData(database: DatabaseSync, options: AppDataFixtureOptions): void {
  const settingsValue = options.malformedSettings
    ? "{malformed"
    : JSON.stringify({ activationShortcut: "Command+Shift+R", historyRetention: "forever" });
  database.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("app.settings", settingsValue);
  if (options.apiKey === "direct") {
    database.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("minimax.apiKey", "direct-key");
  }
  if (options.apiKey === "encrypted") {
    database
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
      .run("minimax.apiKey.encrypted", "encrypted-key");
  }
  database.exec(`
    INSERT INTO reading_history (
      id, created_at, text, preview, duration_estimate_seconds, language_summary, source
    ) VALUES (
      'history-sentinel', 1700000000000, 'history sentinel text',
      'history sentinel', 12, '英文', 'selected_text'
    );

    INSERT INTO error_log (created_at, category, message)
    VALUES (1700000002000, 'playback_runtime', 'sentinel error');
  `);
}
