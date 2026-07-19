import type { HistoryRetention } from "../../shared/app-contracts.js";
import { APP_DATA_CHANNELS } from "../../shared/bridge-contracts.js";
import type { DetectedLanguage } from "../../shared/types.js";
import type { AppBridgeHandlerDependencies } from "./dependencies.js";

type AppDataHandlerDependencies = Pick<
  AppBridgeHandlerDependencies,
  | "app"
  | "appDataStore"
  | "ipcMain"
  | "minimaxAccountService"
  | "playbackCommands"
  | "playbackPreferences"
>;

export function registerAppDataHandlers({
  app,
  appDataStore,
  ipcMain,
  minimaxAccountService,
  playbackCommands,
  playbackPreferences
}: AppDataHandlerDependencies): void {
  ipcMain.handle(APP_DATA_CHANNELS.getSettings, () => appDataStore.getSettings());
  ipcMain.handle(APP_DATA_CHANNELS.setSpeechRate, (_event, speechRate: number) =>
    playbackPreferences.setSpeechRate(speechRate)
  );
  ipcMain.handle(APP_DATA_CHANNELS.setModel, (_event, model: string) =>
    playbackPreferences.setModel(model)
  );
  ipcMain.handle(APP_DATA_CHANNELS.setLaunchAtLogin, (_event, launchAtLogin: boolean) => {
    app.setLoginItemSettings({ openAtLogin: launchAtLogin });
    return appDataStore.updateSettings({ launchAtLogin });
  });
  ipcMain.handle(APP_DATA_CHANNELS.setActivationShortcut, (_event, shortcut: string) =>
    playbackCommands.setActivationShortcut(shortcut)
  );
  ipcMain.handle(APP_DATA_CHANNELS.setMiniMaxApiKey, (_event, apiKey: string) => {
    appDataStore.saveMiniMaxApiKey(apiKey);
  });
  ipcMain.handle(APP_DATA_CHANNELS.clearMiniMaxApiKey, () => {
    appDataStore.clearMiniMaxApiKey();
  });
  ipcMain.handle(APP_DATA_CHANNELS.hasMiniMaxApiKey, () => appDataStore.hasMiniMaxApiKey());
  ipcMain.handle(APP_DATA_CHANNELS.verifyMiniMaxKey, () => minimaxAccountService.verifyApiKey());
  ipcMain.handle(APP_DATA_CHANNELS.refreshVoices, () => minimaxAccountService.refreshVoices());
  ipcMain.handle(APP_DATA_CHANNELS.setPreferredVoice, (_event, language: DetectedLanguage, voiceId: string) =>
    minimaxAccountService.setPreferredVoice(language, voiceId)
  );
  ipcMain.handle(APP_DATA_CHANNELS.getErrorLogCount, () => appDataStore.getErrorLogCount());
  ipcMain.handle(APP_DATA_CHANNELS.clearErrorLog, () => appDataStore.clearErrorLogs());
  ipcMain.handle(APP_DATA_CHANNELS.getReadingHistoryCount, () => appDataStore.getReadingHistoryCount());
  ipcMain.handle(APP_DATA_CHANNELS.previewReadingHistoryRetention, (_event, historyRetention: HistoryRetention) =>
    appDataStore.previewReadingHistoryRetention(historyRetention)
  );
  ipcMain.handle(
    APP_DATA_CHANNELS.applyReadingHistoryRetention,
    (_event, historyRetention: HistoryRetention, expectedDeleteCount: number) =>
      appDataStore.applyReadingHistoryRetention(historyRetention, expectedDeleteCount)
  );
  ipcMain.handle(APP_DATA_CHANNELS.listReadingHistory, () => appDataStore.listReadingHistoryRecords());
  ipcMain.handle(APP_DATA_CHANNELS.deleteReadingHistoryRecord, (_event, id: string) =>
    appDataStore.deleteReadingHistoryRecord(id)
  );
  ipcMain.handle(APP_DATA_CHANNELS.undoReadingHistoryDeletion, (_event, undoToken: string) =>
    appDataStore.undoReadingHistoryDeletion(undoToken)
  );
  ipcMain.handle(APP_DATA_CHANNELS.clearReadingHistory, () => appDataStore.clearReadingHistory());
  ipcMain.handle(APP_DATA_CHANNELS.createFavoriteFromHistoryRecord, (_event, id: string) =>
    appDataStore.createFavoriteFromHistoryRecord(id)
  );
  ipcMain.handle(APP_DATA_CHANNELS.listFavorites, () => appDataStore.listFavoriteRecords());
  ipcMain.handle(APP_DATA_CHANNELS.deleteFavoriteRecord, (_event, id: string) =>
    appDataStore.deleteFavoriteRecord(id)
  );
  ipcMain.handle(APP_DATA_CHANNELS.undoFavoriteDeletion, (_event, undoToken: string) =>
    appDataStore.undoFavoriteDeletion(undoToken)
  );
}
