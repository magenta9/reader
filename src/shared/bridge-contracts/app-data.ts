import type {
  AppSettings,
  FavoriteRecord,
  MiniMaxSetupResult,
  ReadingHistoryRecord,
  ShortcutUpdateResult
} from "../app-contracts.js";
import type { DetectedLanguage } from "../types.js";

export const APP_DATA_CHANNELS = {
  getSettings: "app-data:get-settings",
  updateSettings: "app-data:update-settings",
  setLaunchAtLogin: "app-data:set-launch-at-login",
  setActivationShortcut: "app-data:set-activation-shortcut",
  setMiniMaxApiKey: "app-data:set-minimax-api-key",
  clearMiniMaxApiKey: "app-data:clear-minimax-api-key",
  hasMiniMaxApiKey: "app-data:has-minimax-api-key",
  verifyMiniMaxKey: "app-data:verify-minimax-key",
  refreshVoices: "app-data:refresh-voices",
  setPreferredVoice: "app-data:set-preferred-voice",
  getErrorLogCount: "app-data:get-error-log-count",
  clearErrorLog: "app-data:clear-error-log",
  getReadingHistoryCount: "app-data:get-reading-history-count",
  listReadingHistory: "app-data:list-reading-history",
  deleteReadingHistoryRecord: "app-data:delete-reading-history-record",
  clearReadingHistory: "app-data:clear-reading-history",
  createFavoriteFromHistoryRecord: "app-data:create-favorite-from-history-record",
  listFavorites: "app-data:list-favorites",
  deleteFavoriteRecord: "app-data:delete-favorite-record"
} as const;

export interface AppDataBridge {
  getSettings: () => Promise<AppSettings>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
  setLaunchAtLogin: (launchAtLogin: boolean) => Promise<AppSettings>;
  setActivationShortcut: (shortcut: string) => Promise<ShortcutUpdateResult>;
  setMiniMaxApiKey: (apiKey: string) => Promise<void>;
  clearMiniMaxApiKey: () => Promise<void>;
  hasMiniMaxApiKey: () => Promise<boolean>;
  verifyMiniMaxKey: () => Promise<MiniMaxSetupResult>;
  refreshVoices: () => Promise<MiniMaxSetupResult>;
  setPreferredVoice: (language: DetectedLanguage, voiceId: string) => Promise<AppSettings>;
  getErrorLogCount: () => Promise<number>;
  clearErrorLog: () => Promise<void>;
  getReadingHistoryCount: () => Promise<number>;
  listReadingHistory: () => Promise<ReadingHistoryRecord[]>;
  deleteReadingHistoryRecord: (id: string) => Promise<void>;
  clearReadingHistory: () => Promise<void>;
  createFavoriteFromHistoryRecord: (id: string) => Promise<FavoriteRecord | undefined>;
  listFavorites: () => Promise<FavoriteRecord[]>;
  deleteFavoriteRecord: (id: string) => Promise<void>;
}
