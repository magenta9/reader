import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import {
  DEFAULT_ACTIVATION_SHORTCUT,
  LEGACY_DEFAULT_ACTIVATION_SHORTCUT,
  type AppRoute,
  type AppSettings,
  type FavoriteRecord,
  type HistoryRetention,
  type ReadingHistoryRecord
} from "../../shared/app-contracts.js";
import type { DetectedLanguage, ReadingSegment, ReadingSource } from "../../shared/types.js";

export type RuntimeErrorCategory =
  | "minimax_runtime"
  | "network_runtime"
  | "playback_runtime"
  | "unknown_runtime";

export type SkippedPlaybackReason = "empty_clipboard" | "non_text_clipboard" | "missing_api_key";

interface ReadingHistoryInput {
  text: string;
  source: ReadingSource;
  segments: ReadingSegment[];
  createdAt?: number;
}

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

export interface FavoriteRecordStore {
  createFavoriteFromHistoryRecord(id: string, favoritedAt?: number): FavoriteRecord | undefined;
  listFavoriteRecords(): FavoriteRecord[];
  getFavoriteRecord(id: string): FavoriteRecord | undefined;
  deleteFavoriteRecord(id: string): void;
}

export type MiniMaxAccountDataStore = AppSettingsStore & Pick<MiniMaxCredentialStore, "readMiniMaxApiKey">;

export type PlaybackCommandDataStore = AppSettingsStore;

export type PlaybackDataStore = AppSettingsStore &
  Pick<MiniMaxCredentialStore, "hasMiniMaxApiKey" | "readMiniMaxApiKey"> &
  Pick<ErrorLogStore, "addErrorLog" | "recordSkippedPlaybackInput"> &
  Pick<ReadingHistoryStore, "getReadingHistoryRecord" | "saveOrReuseReadingHistoryRecord"> &
  Pick<FavoriteRecordStore, "getFavoriteRecord">;

const SETTINGS_KEY = "app.settings";
const MINIMAX_API_KEY = "minimax.apiKey";
const LEGACY_ENCRYPTED_MINIMAX_API_KEY = "minimax.apiKey.encrypted";
const MAX_ERROR_LOG_ENTRIES = 100;
const READING_HISTORY_DEDUPE_WINDOW_MS = 5 * 60 * 1000;
const FAVORITE_RECORD_COLUMNS =
  "id, favorited_at, source_created_at, text, preview, duration_estimate_seconds, language_summary, source";
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
  implements AppSettingsStore, MiniMaxCredentialStore, ErrorLogStore, ReadingHistoryStore, FavoriteRecordStore
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

    const record = createReadingHistoryRecord(input, createdAt);
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

  createFavoriteFromHistoryRecord(id: string, favoritedAt = Date.now()): FavoriteRecord | undefined {
    const historyRecord = this.getReadingHistoryRecord(id);
    if (!historyRecord) return undefined;
    const favorite: FavoriteRecord = {
      id: randomUUID(),
      favoritedAt,
      sourceCreatedAt: historyRecord.createdAt,
      text: historyRecord.text,
      preview: historyRecord.preview,
      durationEstimateSeconds: historyRecord.durationEstimateSeconds,
      languageSummary: historyRecord.languageSummary,
      source: historyRecord.source
    };
    this.db
      .prepare(
        `INSERT INTO favorite_records (
          id,
          favorited_at,
          source_created_at,
          text,
          preview,
          duration_estimate_seconds,
          language_summary,
          source
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        favorite.id,
        favorite.favoritedAt,
        favorite.sourceCreatedAt,
        favorite.text,
        favorite.preview,
        favorite.durationEstimateSeconds,
        favorite.languageSummary,
        favorite.source
      );
    return favorite;
  }

  listFavoriteRecords(): FavoriteRecord[] {
    const rows = this.db
      .prepare(
        `SELECT ${FAVORITE_RECORD_COLUMNS}
         FROM favorite_records
         ORDER BY favorited_at DESC, id DESC`
      )
      .all() as unknown as FavoriteRecordRow[];
    return rows.map(toFavoriteRecord);
  }

  getFavoriteRecord(id: string): FavoriteRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT ${FAVORITE_RECORD_COLUMNS}
         FROM favorite_records
         WHERE id = ?`
      )
      .get(id) as unknown as FavoriteRecordRow | undefined;
    return row ? toFavoriteRecord(row) : undefined;
  }

  deleteFavoriteRecord(id: string): void {
    this.db.prepare("DELETE FROM favorite_records WHERE id = ?").run(id);
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

      CREATE TABLE IF NOT EXISTS favorite_records (
        id TEXT PRIMARY KEY,
        favorited_at INTEGER NOT NULL,
        source_created_at INTEGER NOT NULL,
        text TEXT NOT NULL,
        preview TEXT NOT NULL,
        duration_estimate_seconds INTEGER NOT NULL,
        language_summary TEXT NOT NULL,
        source TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_favorite_records_favorited_at
      ON favorite_records (favorited_at DESC);

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

interface FavoriteRecordRow {
  id: string;
  favorited_at: number;
  source_created_at: number;
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
  return value === "home" || value === "history" || value === "favorites" || value === "settings"
    ? value
    : "home";
}

function normalizeApiKeyStatus(value: unknown): AppSettings["apiKeyStatus"] {
  return value === "verified" || value === "failed" || value === "missing" ? value : "missing";
}

function sanitizeErrorMessage(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 240) || "Runtime failure";
}

function createReadingHistoryRecord(input: ReadingHistoryInput, createdAt: number): ReadingHistoryRecord {
  return {
    id: randomUUID(),
    createdAt,
    text: input.text,
    preview: createReadingHistoryPreview(input.text),
    durationEstimateSeconds: estimateReadingDurationSeconds(input.text),
    languageSummary: summarizeReadingSegmentLanguages(input.segments),
    source: input.source
  };
}

function createReadingHistoryPreview(text: string): string {
  const firstBlock = text.split(/\n+/).find((part) => part.trim()) ?? text;
  const normalized = firstBlock.trim().replace(/\s+/g, " ");
  return normalized.length > 120 ? `${normalized.slice(0, 119)}…` : normalized;
}

function estimateReadingDurationSeconds(text: string): number {
  const cjkCount = Array.from(text).filter((char) => /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(char)).length;
  const wordCount = text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)?/g)?.length ?? 0;
  const cjkSeconds = (cjkCount / 280) * 60;
  const wordSeconds = (wordCount / 170) * 60;
  return Math.max(1, Math.ceil(cjkSeconds + wordSeconds));
}

function summarizeReadingSegmentLanguages(segments: ReadingSegment[]): string {
  const ordered: DetectedLanguage[] = ["zh", "en", "ja", "ko", "latin", "unknown"];
  const seen = new Set(segments.map((segment) => segment.language));
  const labels = ordered.filter((language) => seen.has(language)).map(readingHistoryLanguageLabel);
  return labels.length ? labels.join(" / ") : "未知";
}

function readingHistoryRetentionCutoff(now: number, retention: HistoryRetention): number | undefined {
  if (retention === "forever") return undefined;
  if (retention === "7d") return now - 7 * 24 * 60 * 60 * 1000;
  if (retention === "3m") return now - 90 * 24 * 60 * 60 * 1000;
  return now - 30 * 24 * 60 * 60 * 1000;
}

function readingHistoryLanguageLabel(language: DetectedLanguage): string {
  if (language === "zh") return "中文";
  if (language === "en") return "英文";
  if (language === "ja") return "日文";
  if (language === "ko") return "韩文";
  if (language === "latin") return "其他拉丁语";
  return "未知";
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

function toFavoriteRecord(row: FavoriteRecordRow): FavoriteRecord {
  return {
    id: row.id,
    favoritedAt: row.favorited_at,
    sourceCreatedAt: row.source_created_at,
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
