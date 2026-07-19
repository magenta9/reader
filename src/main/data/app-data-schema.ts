import type { DatabaseSync } from "node:sqlite";

import {
  DEFAULT_ACTIVATION_SHORTCUT,
  LEGACY_DEFAULT_ACTIVATION_SHORTCUT
} from "../../shared/app-contracts.js";

export const CURRENT_APP_DATA_SCHEMA_VERSION = 1;

const APP_SETTINGS_KEY = "app.settings";
const LEGACY_ENCRYPTED_MINIMAX_API_KEY = "minimax.apiKey.encrypted";
const SCHEMA_BUSY_TIMEOUT_MS = 2_000;

interface ColumnContract {
  name: string;
  type: "INTEGER" | "TEXT";
  notNull: boolean;
  primaryKeyOrdinal: number;
  defaultValue: string | null;
  hidden: number;
}

interface IndexContract {
  name: string;
  table: string;
  sql: string;
  columns: Array<{ name: string | null; descending: boolean; collation: string }>;
}

const TABLE_CONTRACTS: Record<string, { sql: string; columns: ColumnContract[] }> = {
  settings: {
    sql: "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    columns: [
      column("key", "TEXT", false, 1),
      column("value", "TEXT", true)
    ]
  },
  reading_history: {
    sql: `CREATE TABLE reading_history (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      text TEXT NOT NULL,
      preview TEXT NOT NULL,
      duration_estimate_seconds INTEGER NOT NULL,
      language_summary TEXT NOT NULL,
      source TEXT NOT NULL
    )`,
    columns: [
      column("id", "TEXT", false, 1),
      column("created_at", "INTEGER", true),
      column("text", "TEXT", true),
      column("preview", "TEXT", true),
      column("duration_estimate_seconds", "INTEGER", true),
      column("language_summary", "TEXT", true),
      column("source", "TEXT", true)
    ]
  },
  favorite_records: {
    sql: `CREATE TABLE favorite_records (
      id TEXT PRIMARY KEY,
      favorited_at INTEGER NOT NULL,
      source_created_at INTEGER NOT NULL,
      text TEXT NOT NULL,
      preview TEXT NOT NULL,
      duration_estimate_seconds INTEGER NOT NULL,
      language_summary TEXT NOT NULL,
      source TEXT NOT NULL
    )`,
    columns: [
      column("id", "TEXT", false, 1),
      column("favorited_at", "INTEGER", true),
      column("source_created_at", "INTEGER", true),
      column("text", "TEXT", true),
      column("preview", "TEXT", true),
      column("duration_estimate_seconds", "INTEGER", true),
      column("language_summary", "TEXT", true),
      column("source", "TEXT", true)
    ]
  },
  error_log: {
    sql: `CREATE TABLE error_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL
    )`,
    columns: [
      column("id", "INTEGER", false, 1),
      column("created_at", "INTEGER", true),
      column("category", "TEXT", true),
      column("message", "TEXT", true)
    ]
  }
};

const INDEX_CONTRACTS: IndexContract[] = [
  index(
    "idx_reading_history_created_at",
    "reading_history",
    "created_at",
    "CREATE INDEX idx_reading_history_created_at ON reading_history (created_at DESC)"
  ),
  index(
    "idx_favorite_records_favorited_at",
    "favorite_records",
    "favorited_at",
    "CREATE INDEX idx_favorite_records_favorited_at ON favorite_records (favorited_at DESC)"
  ),
  index(
    "idx_error_log_created_at",
    "error_log",
    "created_at",
    "CREATE INDEX idx_error_log_created_at ON error_log (created_at DESC)"
  )
];

const CURRENT_TABLE_NAMES = Object.keys(TABLE_CONTRACTS).sort();
const CURRENT_INDEX_NAMES = INDEX_CONTRACTS.map(({ name }) => name).sort();
const LEGACY_TABLE_NAMES = CURRENT_TABLE_NAMES.filter((name) => name !== "favorite_records");
const LEGACY_INDEX_NAMES = CURRENT_INDEX_NAMES.filter(
  (name) => name !== "idx_favorite_records_favorited_at"
);

export function migrateAppDataSchema(database: DatabaseSync): void {
  database.exec(`PRAGMA busy_timeout = ${SCHEMA_BUSY_TIMEOUT_MS}`);
  let transactionStarted = false;
  try {
    database.exec("BEGIN IMMEDIATE");
    transactionStarted = true;

    const version = readSchemaVersion(database);
    if (version > CURRENT_APP_DATA_SCHEMA_VERSION) {
      throw new Error(
        `App Data schema version ${version} is newer than supported version ${CURRENT_APP_DATA_SCHEMA_VERSION}`
      );
    }

    if (version === CURRENT_APP_DATA_SCHEMA_VERSION) {
      assertCurrentAppDataSchema(database);
    } else if (version === 0) {
      const schemaKind = classifyUnversionedSchema(database);
      if (schemaKind === "unknown") throw new Error("App Data has an unknown unversioned schema");
      if (schemaKind === "fresh" || schemaKind === "legacy") createCurrentSchema(database);
    } else {
      throw new Error(`App Data schema version ${version} is unsupported`);
    }

    normalizeLegacySettings(database);
    assertCurrentAppDataSchema(database);
    if (version === 0) database.exec(`PRAGMA user_version = ${CURRENT_APP_DATA_SCHEMA_VERSION}`);
    database.exec("COMMIT");
  } catch (error) {
    if (transactionStarted) {
      try {
        database.exec("ROLLBACK");
      } catch {
        // Preserve the original migration failure.
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`App Data schema migration failed: ${message}`, { cause: error });
  }
}

export function assertCurrentAppDataSchema(database: DatabaseSync): void {
  assertSchemaObjects(database, CURRENT_TABLE_NAMES, CURRENT_INDEX_NAMES);
  for (const table of CURRENT_TABLE_NAMES) assertTableContract(database, table);
  for (const contract of INDEX_CONTRACTS) assertIndexContract(database, contract);
}

function classifyUnversionedSchema(database: DatabaseSync): "fresh" | "legacy" | "current" | "unknown" {
  if (matchesSchema(database, [], [])) return "fresh";
  if (matchesSchema(database, LEGACY_TABLE_NAMES, LEGACY_INDEX_NAMES)) return "legacy";
  if (matchesSchema(database, CURRENT_TABLE_NAMES, CURRENT_INDEX_NAMES)) return "current";
  return "unknown";
}

function matchesSchema(database: DatabaseSync, tables: string[], indexes: string[]): boolean {
  try {
    assertSchemaObjects(database, tables, indexes);
    for (const table of tables) assertTableContract(database, table);
    for (const contract of INDEX_CONTRACTS.filter(({ name }) => indexes.includes(name))) {
      assertIndexContract(database, contract);
    }
    return true;
  } catch {
    return false;
  }
}

function assertSchemaObjects(database: DatabaseSync, tables: string[], indexes: string[]): void {
  const objects = database
    .prepare(
      `SELECT type, name, sql
       FROM sqlite_schema
       WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL
       ORDER BY type, name`
    )
    .all() as unknown as Array<{ type: string; name: string; sql: string }>;
  const actual = objects.map(({ type, name, sql }) => `${type}:${name}:${normalizeSchemaSql(sql)}`);
  const expected = [
    ...indexes.map((name) => {
      const contract = INDEX_CONTRACTS.find((candidate) => candidate.name === name);
      return `index:${name}:${normalizeSchemaSql(contract?.sql ?? "")}`;
    }),
    ...tables.map((name) => `table:${name}:${normalizeSchemaSql(TABLE_CONTRACTS[name]?.sql ?? "")}`)
  ].sort();
  if (!sameStrings(actual, expected)) {
    throw new Error(`App Data schema objects do not match: ${actual.join(", ") || "<none>"}`);
  }
}

function assertTableContract(database: DatabaseSync, table: string): void {
  const contract = TABLE_CONTRACTS[table];
  if (!contract) throw new Error(`Missing App Data table contract for ${table}`);
  const columns = database.prepare(`PRAGMA table_xinfo(${quoteIdentifier(table)})`).all() as unknown as Array<{
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
    hidden: number;
  }>;
  const actual = columns.map(({ name, type, notnull, dflt_value, pk, hidden }) => ({
    name,
    type: type.toUpperCase(),
    notNull: notnull === 1,
    primaryKeyOrdinal: pk,
    defaultValue: dflt_value,
    hidden
  }));
  if (JSON.stringify(actual) !== JSON.stringify(contract.columns)) {
    throw new Error(`App Data table ${table} does not match its v1 column contract`);
  }
}

function assertIndexContract(database: DatabaseSync, contract: IndexContract): void {
  const listed = database.prepare(`PRAGMA index_list(${quoteIdentifier(contract.table)})`).all() as unknown as Array<{
    name: string;
    unique: number;
    origin: string;
    partial: number;
  }>;
  const indexInfo = listed.find(({ name }) => name === contract.name);
  if (!indexInfo || indexInfo.unique !== 0 || indexInfo.origin !== "c" || indexInfo.partial !== 0) {
    throw new Error(`App Data index ${contract.name} does not match its v1 index contract`);
  }
  const columns = (database
    .prepare(`PRAGMA index_xinfo(${quoteIdentifier(contract.name)})`)
    .all() as unknown as Array<{ name: string | null; desc: number; coll: string; key: number }>)
    .filter(({ key }) => key === 1)
    .map(({ name, desc, coll }) => ({ name, descending: desc === 1, collation: coll }));
  if (JSON.stringify(columns) !== JSON.stringify(contract.columns)) {
    throw new Error(`App Data index ${contract.name} does not match its v1 column contract`);
  }
}

function createCurrentSchema(database: DatabaseSync): void {
  for (const { sql } of Object.values(TABLE_CONTRACTS)) database.exec(withIfNotExists(sql));
  for (const { sql } of INDEX_CONTRACTS) database.exec(withIfNotExists(sql));
}

function normalizeLegacySettings(database: DatabaseSync): void {
  database.prepare("DELETE FROM settings WHERE key = ?").run(LEGACY_ENCRYPTED_MINIMAX_API_KEY);
  const row = database.prepare("SELECT value FROM settings WHERE key = ?").get(APP_SETTINGS_KEY) as unknown as
    | { value: string }
    | undefined;
  if (!row) return;
  const settings = JSON.parse(row.value) as Record<string, unknown>;
  if (settings.activationShortcut !== LEGACY_DEFAULT_ACTIVATION_SHORTCUT) return;
  database
    .prepare("UPDATE settings SET value = ? WHERE key = ?")
    .run(JSON.stringify({ ...settings, activationShortcut: DEFAULT_ACTIVATION_SHORTCUT }), APP_SETTINGS_KEY);
}

function readSchemaVersion(database: DatabaseSync): number {
  const row = database.prepare("PRAGMA user_version").get() as unknown as { user_version: number };
  return row.user_version;
}

function column(
  name: string,
  type: ColumnContract["type"],
  notNull: boolean,
  primaryKeyOrdinal = 0
): ColumnContract {
  return { name, type, notNull, primaryKeyOrdinal, defaultValue: null, hidden: 0 };
}

function index(name: string, table: string, columnName: string, sql: string): IndexContract {
  return {
    name,
    table,
    sql,
    columns: [{ name: columnName, descending: true, collation: "BINARY" }]
  };
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function sameStrings(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function normalizeSchemaSql(sql: string): string {
  return sql.replaceAll(/\s+/g, "").replace(/;$/, "").toUpperCase();
}

function withIfNotExists(sql: string): string {
  return sql.replace(/^CREATE (TABLE|INDEX) /, "CREATE $1 IF NOT EXISTS ");
}
