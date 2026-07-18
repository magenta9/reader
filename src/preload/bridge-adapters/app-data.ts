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
} from "../../shared/app-contracts.js";
import { APP_DATA_CHANNELS, type AppDataBridge } from "../../shared/bridge-contracts.js";
import type { DetectedLanguage } from "../../shared/types.js";
import { invoke, type PreloadIpc } from "./ipc.js";

export function createAppDataBridge(ipc: PreloadIpc): AppDataBridge {
  return {
    getSettings: () => invoke<AppSettings>(ipc, APP_DATA_CHANNELS.getSettings),
    updateSettings: (patch: AppSettingsPatch) =>
      invoke<AppSettings>(ipc, APP_DATA_CHANNELS.updateSettings, patch),
    setLaunchAtLogin: (launchAtLogin: boolean) =>
      invoke<AppSettings>(ipc, APP_DATA_CHANNELS.setLaunchAtLogin, launchAtLogin),
    setActivationShortcut: (shortcut: string) =>
      invoke<ShortcutUpdateResult>(ipc, APP_DATA_CHANNELS.setActivationShortcut, shortcut),
    setMiniMaxApiKey: (apiKey: string) => invoke<void>(ipc, APP_DATA_CHANNELS.setMiniMaxApiKey, apiKey),
    clearMiniMaxApiKey: () => invoke<void>(ipc, APP_DATA_CHANNELS.clearMiniMaxApiKey),
    hasMiniMaxApiKey: () => invoke<boolean>(ipc, APP_DATA_CHANNELS.hasMiniMaxApiKey),
    verifyMiniMaxKey: () => invoke<MiniMaxSetupResult>(ipc, APP_DATA_CHANNELS.verifyMiniMaxKey),
    refreshVoices: () => invoke<MiniMaxSetupResult>(ipc, APP_DATA_CHANNELS.refreshVoices),
    setPreferredVoice: (language: DetectedLanguage, voiceId: string) =>
      invoke<AppSettings>(ipc, APP_DATA_CHANNELS.setPreferredVoice, language, voiceId),
    getErrorLogCount: () => invoke<number>(ipc, APP_DATA_CHANNELS.getErrorLogCount),
    clearErrorLog: () => invoke<void>(ipc, APP_DATA_CHANNELS.clearErrorLog),
    getReadingHistoryCount: () => invoke<number>(ipc, APP_DATA_CHANNELS.getReadingHistoryCount),
    previewReadingHistoryRetention: (historyRetention: HistoryRetention) =>
      invoke<HistoryRetentionImpact>(ipc, APP_DATA_CHANNELS.previewReadingHistoryRetention, historyRetention),
    applyReadingHistoryRetention: (historyRetention: HistoryRetention, expectedDeleteCount: number) =>
      invoke<HistoryRetentionChangeResult>(
        ipc,
        APP_DATA_CHANNELS.applyReadingHistoryRetention,
        historyRetention,
        expectedDeleteCount
      ),
    listReadingHistory: () => invoke<ReadingHistoryRecord[]>(ipc, APP_DATA_CHANNELS.listReadingHistory),
    deleteReadingHistoryRecord: (id: string) =>
      invoke<string | undefined>(ipc, APP_DATA_CHANNELS.deleteReadingHistoryRecord, id),
    undoReadingHistoryDeletion: (undoToken: string) =>
      invoke<boolean>(ipc, APP_DATA_CHANNELS.undoReadingHistoryDeletion, undoToken),
    clearReadingHistory: () => invoke<number>(ipc, APP_DATA_CHANNELS.clearReadingHistory),
    createFavoriteFromHistoryRecord: (id: string) =>
      invoke<FavoriteRecord | undefined>(ipc, APP_DATA_CHANNELS.createFavoriteFromHistoryRecord, id),
    listFavorites: () => invoke<FavoriteRecord[]>(ipc, APP_DATA_CHANNELS.listFavorites),
    deleteFavoriteRecord: (id: string) =>
      invoke<string | undefined>(ipc, APP_DATA_CHANNELS.deleteFavoriteRecord, id),
    undoFavoriteDeletion: (undoToken: string) =>
      invoke<boolean>(ipc, APP_DATA_CHANNELS.undoFavoriteDeletion, undoToken)
  };
}
