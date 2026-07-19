import type {
  AppSettings,
  AppSettingsPatch,
  FavoriteRecord,
  HistoryRetention,
  HistoryRetentionChangeResult,
  HistoryRetentionImpact,
  MiniMaxSetupResult,
  ReadingHistoryRecord,
  ShortcutUpdateResult
} from "../app-contracts.js";
import type { DetectedLanguage } from "../types.js";

export const APP_DATA_CHANNELS = {
  getSettings: "app-data:get-settings",
  updateSettings: "app-data:update-settings",
  setSpeechRate: "app-data:set-speech-rate",
  setModel: "app-data:set-model",
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
  previewReadingHistoryRetention: "app-data:preview-reading-history-retention",
  applyReadingHistoryRetention: "app-data:apply-reading-history-retention",
  listReadingHistory: "app-data:list-reading-history",
  deleteReadingHistoryRecord: "app-data:delete-reading-history-record",
  undoReadingHistoryDeletion: "app-data:undo-reading-history-deletion",
  clearReadingHistory: "app-data:clear-reading-history",
  createFavoriteFromHistoryRecord: "app-data:create-favorite-from-history-record",
  listFavorites: "app-data:list-favorites",
  deleteFavoriteRecord: "app-data:delete-favorite-record",
  undoFavoriteDeletion: "app-data:undo-favorite-deletion"
} as const;

export interface AppDataBridge {
  getSettings: () => Promise<AppSettings>;
  updateSettings: (patch: AppSettingsPatch) => Promise<AppSettings>;
  setSpeechRate: (speechRate: number) => Promise<AppSettings>;
  setModel: (model: string) => Promise<AppSettings>;
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
  previewReadingHistoryRetention: (historyRetention: HistoryRetention) => Promise<HistoryRetentionImpact>;
  applyReadingHistoryRetention: (
    historyRetention: HistoryRetention,
    expectedDeleteCount: number
  ) => Promise<HistoryRetentionChangeResult>;
  listReadingHistory: () => Promise<ReadingHistoryRecord[]>;
  deleteReadingHistoryRecord: (id: string) => Promise<string | undefined>;
  undoReadingHistoryDeletion: (undoToken: string) => Promise<boolean>;
  clearReadingHistory: () => Promise<number>;
  createFavoriteFromHistoryRecord: (id: string) => Promise<FavoriteRecord | undefined>;
  listFavorites: () => Promise<FavoriteRecord[]>;
  deleteFavoriteRecord: (id: string) => Promise<string | undefined>;
  undoFavoriteDeletion: (undoToken: string) => Promise<boolean>;
}
