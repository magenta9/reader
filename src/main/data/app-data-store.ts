import { DatabaseSync } from "node:sqlite";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import {
  DEFAULT_ACTIVATION_SHORTCUT,
  LEGACY_DEFAULT_ACTIVATION_SHORTCUT,
  type AppRoute,
  type AppSettings,
  type HistoryRetention,
  type ReadingHistoryRecord
} from "../../shared/app-contracts.js";
import type { ReadingSource } from "../../shared/types.js";
import {
  createReadingHistoryRecord,
  readingHistoryRetentionCutoff,
  READING_HISTORY_DEDUPE_WINDOW_MS,
  type ReadingHistoryInput
} from "./reading-history-record.js";

export type RuntimeErrorCategory =
  | "minimax_runtime"
  | "network_runtime"
  | "playback_runtime"
  | "unknown_runtime";

export type SkippedPlaybackReason = "empty_clipboard" | "non_text_clipboard" | "missing_api_key";

export interface ErrorLogInput {
  category: RuntimeErrorCategory;
  message: string;
  createdAt?: number;
}

export interface ErrorLogEntry {
  id: number;
  createdAt: number;
  category: RuntimeErrorCategory;
  message: string;
}

export interface AppSettingsStore {
  getSettings(): AppSettings;
  updateSettings(patch: Partial<AppSettings>): AppSettings;
}

export interface MiniMaxCredentialStore {
  saveMiniMaxApiKey(apiKey: string): void;
  readMiniMaxApiKey(): string | undefined;
  clearMiniMaxApiKey(): void;
  hasMiniMaxApiKey(): boolean;
}

export interface ErrorLogStore {
  addErrorLog(input: ErrorLogInput): ErrorLogEntry;
  recordSkippedPlaybackInput(reason: SkippedPlaybackReason): void;
  getErrorLogCount(): number;
  listErrorLogs(): ErrorLogEntry[];
  clearErrorLogs(): void;
}

export interface ReadingHistoryStore {
  saveOrReuseReadingHistoryRecord(input: ReadingHistoryInput): ReadingHistoryRecord;
  listReadingHistoryRecords(): ReadingHistoryRecord[];
  getReadingHistoryRecord(id: string): ReadingHistoryRecord | undefined;
  getReadingHistoryCount(): number;
  clearReadingHistory(): void;
  deleteReadingHistoryRecord(id: string): void;
  cleanupExpiredReadingHistory(now?: number, retention?: HistoryRetention): void;
}

export type MiniMaxAccountDataStore = AppSettingsStore & Pick<MiniMaxCredentialStore, "readMiniMaxApiKey">;

export type PlaybackCommandDataStore = AppSettingsStore;

export type PlaybackDataStore = AppSettingsStore &
  Pick<MiniMaxCredentialStore, "hasMiniMaxApiKey" | "readMiniMaxApiKey"> &
  Pick<ErrorLogStore, "addErrorLog" | "recordSkippedPlaybackInput"> &
  Pick<ReadingHistoryStore, "getReadingHistoryRecord" | "saveOrReuseReadingHistoryRecord">;

const SETTINGS_KEY = "app.settings";
const MINIMAX_API_KEY = "minimax.apiKey";
const LEGACY_ENCRYPTED_MINIMAX_API_KEY = "minimax.apiKey.encrypted";
const MAX_ERROR_LOG_ENTRIES = 100;
export const DEFAULT_APP_SETTINGS: AppSettings = {
  hasCompletedOnboarding: false,
  lastRoute: "home",
  launchAtLogin: false,
  activationShortcut: DEFAULT_ACTIVATION_SHORTCUT,
  speechRate: 1,
  model: "speech-2.8-turbo",
  historyRetention: "1m",
  apiKeyStatus: "missing",
  voices: [],
  preferredVoicesByLanguage: {}
};

export class AppDataStore
  implements AppSettingsStore, MiniMaxCredentialStore, ErrorLogStore, ReadingHistoryStore
{
  private readonly db: DatabaseSync;

  constructor(private readonly dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.migrate();
    this.cleanupExpiredReadingHistory();
  }

  close(): void {
    this.db.close();
  }

  getSettings(): AppSettings {
    const stored = this.getJsonSetting<Partial<AppSettings>>(SETTINGS_KEY) ?? {};
    return normalizeSettings(stored);
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    const previous = this.getSettings();
    const next = normalizeSettings({ ...this.getSettings(), ...patch });
    this.setJsonSetting(SETTINGS_KEY, next);
    if (previous.historyRetention !== next.historyRetention) {
      this.cleanupExpiredReadingHistory(Date.now(), next.historyRetention);
    }
    return next;
  }

  saveMiniMaxApiKey(apiKey: string): void {
    this.setTextSetting(MINIMAX_API_KEY, apiKey);
    this.updateSettings({ apiKeyStatus: apiKey.trim() ? "failed" : "missing" });
  }

  readMiniMaxApiKey(): string | undefined {
    return this.getTextSetting(MINIMAX_API_KEY);
  }

  clearMiniMaxApiKey(): void {
    this.deleteSetting(MINIMAX_API_KEY);
    this.updateSettings({
      apiKeyStatus: "missing",
      apiKeyError: undefined,
      apiKeyVerifiedAt: undefined
    });
  }

  hasMiniMaxApiKey(): boolean {
    return Boolean(this.getTextSetting(MINIMAX_API_KEY));
  }

  addErrorLog(input: ErrorLogInput): ErrorLogEntry {
    const createdAt = input.createdAt ?? Date.now();
    const entry = this.db
      .prepare(
        `INSERT INTO error_log (created_at, category, message)
         VALUES (?, ?, ?)
         RETURNING id, created_at, category, message`
      )
      .get(createdAt, input.category, sanitizeErrorMessage(input.message)) as unknown as ErrorLogRow;
    this.capErrorLogs();
    return toErrorLogEntry(entry);
  }

  recordSkippedPlaybackInput(_reason: SkippedPlaybackReason): void {
    // Skips are expected input boundaries, not runtime failures.
  }

  getErrorLogCount(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM error_log").get() as { count: number };
    return row.count;
  }

  listErrorLogs(): ErrorLogEntry[] {
    const rows = this.db
      .prepare(
        `SELECT id, created_at, category, message
         FROM error_log
         ORDER BY created_at DESC, id DESC`
      )
      .all() as unknown as ErrorLogRow[];
    return rows.map(toErrorLogEntry);
  }

  clearErrorLogs(): void {
    this.db.exec("DELETE FROM error_log");
  }

  saveOrReuseReadingHistoryRecord(input: ReadingHistoryInput): ReadingHistoryRecord {
    const createdAt = input.createdAt ?? Date.now();
    const existing = this.findRecentReadingHistoryRecord(input.text, input.source, createdAt);
    if (existing) {
      this.cleanupExpiredReadingHistory(createdAt);
      return existing;
    }

    const record = createReadingHistoryRecord({ ...input, createdAt });
    this.db
      .prepare(
        `INSERT INTO reading_history (
          id,
          created_at,
          text,
          preview,
          duration_estimate_seconds,
          language_summary,
          source
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.createdAt,
        record.text,
        record.preview,
        record.durationEstimateSeconds,
        record.languageSummary,
        record.source
      );
    this.cleanupExpiredReadingHistory(createdAt);
    return record;
  }

  listReadingHistoryRecords(): ReadingHistoryRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, created_at, text, preview, duration_estimate_seconds, language_summary, source
         FROM reading_history
         ORDER BY created_at DESC, id DESC`
      )
      .all() as unknown as ReadingHistoryRow[];
    return rows.map(toReadingHistoryRecord);
  }

  getReadingHistoryRecord(id: string): ReadingHistoryRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT id, created_at, text, preview, duration_estimate_seconds, language_summary, source
         FROM reading_history
         WHERE id = ?`
      )
      .get(id) as unknown as ReadingHistoryRow | undefined;
    return row ? toReadingHistoryRecord(row) : undefined;
  }

  getReadingHistoryCount(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM reading_history").get() as { count: number };
    return row.count;
  }

  clearReadingHistory(): void {
    this.db.exec("DELETE FROM reading_history");
  }

  deleteReadingHistoryRecord(id: string): void {
    this.db.prepare("DELETE FROM reading_history WHERE id = ?").run(id);
  }

  cleanupExpiredReadingHistory(now = Date.now(), retention = this.getSettings().historyRetention): void {
    const cutoff = readingHistoryRetentionCutoff(now, retention);
    if (cutoff === undefined) return;
    this.db.prepare("DELETE FROM reading_history WHERE created_at < ?").run(cutoff);
  }

  getRawSettingForTest(key: string): string | undefined {
    return this.getTextSetting(key);
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reading_history (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        text TEXT NOT NULL,
        preview TEXT NOT NULL,
        duration_estimate_seconds INTEGER NOT NULL,
        language_summary TEXT NOT NULL,
        source TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_reading_history_created_at
      ON reading_history (created_at DESC);

      CREATE TABLE IF NOT EXISTS error_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at INTEGER NOT NULL,
        category TEXT NOT NULL,
        message TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_error_log_created_at
      ON error_log (created_at DESC);
    `);
    this.deleteSetting(LEGACY_ENCRYPTED_MINIMAX_API_KEY);
    this.migrateLegacyDefaultActivationShortcut();
  }

  private migrateLegacyDefaultActivationShortcut(): void {
    const stored = this.getJsonSetting<Partial<AppSettings>>(SETTINGS_KEY);
    if (stored?.activationShortcut !== LEGACY_DEFAULT_ACTIVATION_SHORTCUT) return;
    this.setJsonSetting(SETTINGS_KEY, {
      ...stored,
      activationShortcut: DEFAULT_ACTIVATION_SHORTCUT
    });
  }

  private capErrorLogs(): void {
    this.db
      .prepare(
        `DELETE FROM error_log
         WHERE id NOT IN (
           SELECT id FROM error_log
           ORDER BY created_at DESC, id DESC
           LIMIT ?
         )`
      )
      .run(MAX_ERROR_LOG_ENTRIES);
  }

  private findRecentReadingHistoryRecord(
    text: string,
    source: ReadingSource,
    now: number
  ): ReadingHistoryRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT id, created_at, text, preview, duration_estimate_seconds, language_summary, source
         FROM reading_history
         WHERE text = ? AND source = ? AND created_at >= ?
         ORDER BY created_at DESC, id DESC
         LIMIT 1`
      )
      .get(text, source, now - READING_HISTORY_DEDUPE_WINDOW_MS) as unknown as ReadingHistoryRow | undefined;
    return row ? toReadingHistoryRecord(row) : undefined;
  }

  private getJsonSetting<T>(key: string): T | undefined {
    const value = this.getTextSetting(key);
    if (!value) return undefined;
    return JSON.parse(value) as T;
  }

  private setJsonSetting(key: string, value: unknown): void {
    this.setTextSetting(key, JSON.stringify(value));
  }

  private getTextSetting(key: string): string | undefined {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value;
  }

  private setTextSetting(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value)
         VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, value);
  }

  private deleteSetting(key: string): void {
    this.db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  }
}

interface ErrorLogRow {
  id: number;
  created_at: number;
  category: RuntimeErrorCategory;
  message: string;
}

interface ReadingHistoryRow {
  id: string;
  created_at: number;
  text: string;
  preview: string;
  duration_estimate_seconds: number;
  language_summary: string;
  source: string;
}

function normalizeSettings(value: Partial<AppSettings>): AppSettings {
  const activationShortcut =
    value.activationShortcut === LEGACY_DEFAULT_ACTIVATION_SHORTCUT
      ? DEFAULT_ACTIVATION_SHORTCUT
      : value.activationShortcut;
  return {
    ...DEFAULT_APP_SETTINGS,
    ...value,
    activationShortcut: activationShortcut ?? DEFAULT_APP_SETTINGS.activationShortcut,
    hasCompletedOnboarding: Boolean(value.hasCompletedOnboarding),
    launchAtLogin: Boolean(value.launchAtLogin),
    lastRoute: normalizeAppRoute(value.lastRoute),
    speechRate: normalizeSpeechRate(value.speechRate),
    historyRetention: normalizeHistoryRetention(value.historyRetention),
    apiKeyStatus: normalizeApiKeyStatus(value.apiKeyStatus),
    voices: Array.isArray(value.voices) ? value.voices : [],
    preferredVoicesByLanguage:
      value.preferredVoicesByLanguage && typeof value.preferredVoicesByLanguage === "object"
        ? value.preferredVoicesByLanguage
        : {}
  };
}

function normalizeSpeechRate(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(3, Math.max(0.5, value)) : 1;
}

function normalizeHistoryRetention(value: unknown): HistoryRetention {
  return value === "7d" || value === "1m" || value === "3m" || value === "forever" ? value : "1m";
}

function normalizeAppRoute(value: unknown): AppRoute {
  return value === "home" || value === "history" || value === "settings" ? value : "home";
}

function normalizeApiKeyStatus(value: unknown): AppSettings["apiKeyStatus"] {
  return value === "verified" || value === "failed" || value === "missing" ? value : "missing";
}

function sanitizeErrorMessage(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 240) || "Runtime failure";
}

function toErrorLogEntry(row: ErrorLogRow): ErrorLogEntry {
  return {
    id: row.id,
    createdAt: row.created_at,
    category: row.category,
    message: row.message
  };
}

function toReadingHistoryRecord(row: ReadingHistoryRow): ReadingHistoryRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    text: row.text,
    preview: row.preview,
    durationEstimateSeconds: row.duration_estimate_seconds,
    languageSummary: row.language_summary,
    source: normalizeReadingSource(row.source)
  };
}

function normalizeReadingSource(value: string): ReadingSource {
  return value === "selected_text" ? "selected_text" : "clipboard";
}
