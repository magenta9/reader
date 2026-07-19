import { appDataRoleContract } from "../../shared/role-bridge-contracts.js";
import {
  registerRoleHandlers,
  type ImplementationFromContract
} from "../../shared/role-bridge-registry.js";
import { createElectronMainRoleHandlerTransport } from "../electron-main-role-transport.js";
import type { AppBridgeHandlerDependencies } from "./dependencies.js";

export interface AppDataImplementationDependencies {
  app: Pick<AppBridgeHandlerDependencies["app"], "setLoginItemSettings">;
  appDataStore: Pick<
    AppBridgeHandlerDependencies["appDataStore"],
    | "getSettings"
    | "updateSettings"
    | "saveMiniMaxApiKey"
    | "clearMiniMaxApiKey"
    | "hasMiniMaxApiKey"
    | "getErrorLogCount"
    | "clearErrorLogs"
    | "getReadingHistoryCount"
    | "previewReadingHistoryRetention"
    | "applyReadingHistoryRetention"
    | "listReadingHistoryRecords"
    | "deleteReadingHistoryRecord"
    | "undoReadingHistoryDeletion"
    | "clearReadingHistory"
    | "createFavoriteFromHistoryRecord"
    | "listFavoriteRecords"
    | "deleteFavoriteRecord"
    | "undoFavoriteDeletion"
  >;
  minimaxAccountService: Pick<
    AppBridgeHandlerDependencies["minimaxAccountService"],
    "verifyApiKey" | "refreshVoices" | "setPreferredVoice"
  >;
  playbackCommands: Pick<AppBridgeHandlerDependencies["playbackCommands"], "setActivationShortcut">;
  playbackPreferences: Pick<
    AppBridgeHandlerDependencies["playbackPreferences"],
    "setSpeechRate" | "setModel"
  >;
}

type AppDataHandlerDependencies = AppDataImplementationDependencies &
  Pick<AppBridgeHandlerDependencies, "ipcMain">;

export function registerAppDataHandlers({
  app,
  appDataStore,
  ipcMain,
  minimaxAccountService,
  playbackCommands,
  playbackPreferences
}: AppDataHandlerDependencies): void {
  registerRoleHandlers(
    appDataRoleContract,
    createAppDataImplementation({
      app,
      appDataStore,
      minimaxAccountService,
      playbackCommands,
      playbackPreferences
    }),
    createElectronMainRoleHandlerTransport(ipcMain)
  );
}

export function createAppDataImplementation({
  app,
  appDataStore,
  minimaxAccountService,
  playbackCommands,
  playbackPreferences
}: AppDataImplementationDependencies): ImplementationFromContract<
  typeof appDataRoleContract
> {
  return {
    getSettings: () => appDataStore.getSettings(),
    setSpeechRate: (speechRate) => playbackPreferences.setSpeechRate(speechRate),
    setModel: (model) => playbackPreferences.setModel(model),
    setLaunchAtLogin: (launchAtLogin) => {
      app.setLoginItemSettings({ openAtLogin: launchAtLogin });
      return appDataStore.updateSettings({ launchAtLogin });
    },
    setActivationShortcut: (shortcut) => playbackCommands.setActivationShortcut(shortcut),
    setMiniMaxApiKey: (apiKey) => appDataStore.saveMiniMaxApiKey(apiKey),
    clearMiniMaxApiKey: () => appDataStore.clearMiniMaxApiKey(),
    hasMiniMaxApiKey: () => appDataStore.hasMiniMaxApiKey(),
    verifyMiniMaxKey: () => minimaxAccountService.verifyApiKey(),
    refreshVoices: () => minimaxAccountService.refreshVoices(),
    setPreferredVoice: (language, voiceId) =>
      minimaxAccountService.setPreferredVoice(language, voiceId),
    getErrorLogCount: () => appDataStore.getErrorLogCount(),
    clearErrorLog: () => appDataStore.clearErrorLogs(),
    getReadingHistoryCount: () => appDataStore.getReadingHistoryCount(),
    previewReadingHistoryRetention: (historyRetention) =>
      appDataStore.previewReadingHistoryRetention(historyRetention),
    applyReadingHistoryRetention: (historyRetention, expectedDeleteCount) =>
      appDataStore.applyReadingHistoryRetention(historyRetention, expectedDeleteCount),
    listReadingHistory: () => appDataStore.listReadingHistoryRecords(),
    deleteReadingHistoryRecord: (id) => appDataStore.deleteReadingHistoryRecord(id),
    undoReadingHistoryDeletion: (undoToken) => appDataStore.undoReadingHistoryDeletion(undoToken),
    clearReadingHistory: () => appDataStore.clearReadingHistory(),
    createFavoriteFromHistoryRecord: (id) => appDataStore.createFavoriteFromHistoryRecord(id),
    listFavorites: () => appDataStore.listFavoriteRecords(),
    deleteFavoriteRecord: (id) => appDataStore.deleteFavoriteRecord(id),
    undoFavoriteDeletion: (undoToken) => appDataStore.undoFavoriteDeletion(undoToken)
  };
}
