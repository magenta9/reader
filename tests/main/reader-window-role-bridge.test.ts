import { describe, expect, it, vi } from "vitest";

import {
  createAppDataImplementation,
  type AppDataImplementationDependencies
} from "../../src/main/app-bridge-handlers/app-data.js";
import {
  createAppShellImplementation,
  type AppShellImplementationDependencies
} from "../../src/main/app-bridge-handlers/app-shell.js";
import {
  createClipboardImplementation,
  type ClipboardImplementationDependencies
} from "../../src/main/app-bridge-handlers/clipboard.js";
import { DEFAULT_APP_SETTINGS } from "../../src/main/data/app-data-store.js";
import {
  appDataRoleContract,
  appShellRoleContract,
  clipboardRoleContract,
  readerWindowRoleContract
} from "../../src/shared/role-bridge-contracts.js";
import { InMemoryRoleBridgeLoopback } from "../../src/shared/role-bridge-loopback.js";
import { createRoleBridge, registerRoleHandlers } from "../../src/shared/role-bridge-registry.js";

describe("Reader Window role bridge", () => {
  it("runs App Shell, App Data, and Clipboard behavior through real implementations", async () => {
    const loopback = new InMemoryRoleBridgeLoopback();
    const settings = { ...DEFAULT_APP_SETTINGS };
    const appDataStore = {
      getSettings: vi.fn(() => settings),
      updateSettings: vi.fn(() => settings),
      saveMiniMaxApiKey: vi.fn(),
      clearMiniMaxApiKey: vi.fn(),
      hasMiniMaxApiKey: vi.fn(() => true),
      getErrorLogCount: vi.fn(() => 3),
      clearErrorLogs: vi.fn(),
      getReadingHistoryCount: vi.fn(() => 4),
      previewReadingHistoryRetention: vi.fn(() => ({
        historyRetention: "1m" as const,
        deleteCount: 2,
        remainingCount: 2
      })),
      applyReadingHistoryRetention: vi.fn(() => ({
        applied: true,
        impact: { historyRetention: "1m" as const, deleteCount: 2, remainingCount: 2 },
        settings
      })),
      listReadingHistoryRecords: vi.fn(() => []),
      deleteReadingHistoryRecord: vi.fn(() => "history-undo"),
      undoReadingHistoryDeletion: vi.fn(() => true),
      clearReadingHistory: vi.fn(() => 4),
      createFavoriteFromHistoryRecord: vi.fn(() => undefined),
      listFavoriteRecords: vi.fn(() => []),
      deleteFavoriteRecord: vi.fn(() => "favorite-undo"),
      undoFavoriteDeletion: vi.fn(() => true)
    };
    const app = { setLoginItemSettings: vi.fn() };
    const minimaxAccountService = {
      verifyApiKey: vi.fn(async () => ({ ok: true, settings })),
      refreshVoices: vi.fn(async () => ({ ok: true, settings })),
      setPreferredVoice: vi.fn(() => settings)
    };
    const playbackCommands = {
      setActivationShortcut: vi.fn(() => ({ ok: true, settings }))
    };
    const playbackPreferences = {
      setSpeechRate: vi.fn(() => settings),
      setModel: vi.fn(() => settings)
    };
    const readBootstrapState = vi.fn(() => ({
      hasCompletedOnboarding: false,
      lastRoute: "home" as const
    }));
    const setPendingRoute = vi.fn();
    const clipboard = { writeText: vi.fn() };
    const appShellDependencies = {
      appDataStore,
      readBootstrapState,
      setPendingRoute
    } satisfies AppShellImplementationDependencies;
    const appDataDependencies = {
      app,
      appDataStore,
      minimaxAccountService,
      playbackCommands,
      playbackPreferences
    } satisfies AppDataImplementationDependencies;
    const clipboardDependencies = { clipboard } satisfies ClipboardImplementationDependencies;

    registerRoleHandlers(
      appShellRoleContract,
      createAppShellImplementation(appShellDependencies),
      loopback
    );
    registerRoleHandlers(
      appDataRoleContract,
      createAppDataImplementation(appDataDependencies),
      loopback
    );
    registerRoleHandlers(
      clipboardRoleContract,
      createClipboardImplementation(clipboardDependencies),
      loopback
    );
    const bridge = createRoleBridge(readerWindowRoleContract, loopback);

    await expect(bridge.getBootstrapState()).resolves.toEqual({
      hasCompletedOnboarding: false,
      lastRoute: "home"
    });
    await bridge.setOnboardingComplete(true);
    await bridge.setRoute("history");
    expect(setPendingRoute).toHaveBeenCalledWith("history");
    expect(appDataStore.updateSettings).toHaveBeenCalledWith({ hasCompletedOnboarding: true });
    expect(appDataStore.updateSettings).toHaveBeenCalledWith({ lastRoute: "history" });

    await expect(bridge.getSettings()).resolves.toBe(settings);
    await bridge.setSpeechRate(1.4);
    await bridge.setModel("speech-2.8-hd");
    await bridge.setLaunchAtLogin(true);
    await bridge.setActivationShortcut("Command+J");
    await bridge.setMiniMaxApiKey("secret");
    await bridge.clearMiniMaxApiKey();
    await expect(bridge.hasMiniMaxApiKey()).resolves.toBe(true);
    await bridge.verifyMiniMaxKey();
    await bridge.refreshVoices();
    await bridge.setPreferredVoice("zh", "voice-1");
    await expect(bridge.getErrorLogCount()).resolves.toBe(3);
    await bridge.clearErrorLog();
    await expect(bridge.getReadingHistoryCount()).resolves.toBe(4);
    await bridge.previewReadingHistoryRetention("1m");
    await bridge.applyReadingHistoryRetention("1m", 2);
    await expect(bridge.listReadingHistory()).resolves.toEqual([]);
    await expect(bridge.deleteReadingHistoryRecord("history-1")).resolves.toBe("history-undo");
    await expect(bridge.undoReadingHistoryDeletion("history-undo")).resolves.toBe(true);
    await expect(bridge.clearReadingHistory()).resolves.toBe(4);
    await expect(bridge.createFavoriteFromHistoryRecord("history-1")).resolves.toBeUndefined();
    await expect(bridge.listFavorites()).resolves.toEqual([]);
    await expect(bridge.deleteFavoriteRecord("favorite-1")).resolves.toBe("favorite-undo");
    await expect(bridge.undoFavoriteDeletion("favorite-undo")).resolves.toBe(true);
    await bridge.copyText("copied text");

    expect(playbackPreferences.setSpeechRate).toHaveBeenCalledWith(1.4);
    expect(playbackPreferences.setModel).toHaveBeenCalledWith("speech-2.8-hd");
    expect(app.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true });
    expect(playbackCommands.setActivationShortcut).toHaveBeenCalledWith("Command+J");
    expect(appDataStore.saveMiniMaxApiKey).toHaveBeenCalledWith("secret");
    expect(minimaxAccountService.setPreferredVoice).toHaveBeenCalledWith("zh", "voice-1");
    expect(appDataStore.applyReadingHistoryRetention).toHaveBeenCalledWith("1m", 2);
    expect(clipboard.writeText).toHaveBeenCalledWith("copied text");
  });

  it("preserves implementation failures as rejected bridge promises", async () => {
    const loopback = new InMemoryRoleBridgeLoopback();
    registerRoleHandlers(
      clipboardRoleContract,
      createClipboardImplementation(
        {
          clipboard: {
            writeText: () => {
              throw new Error("clipboard unavailable");
            }
          }
        } satisfies ClipboardImplementationDependencies
      ),
      loopback
    );

    const bridge = createRoleBridge(clipboardRoleContract, loopback);
    await expect(bridge.copyText("text")).rejects.toThrow("clipboard unavailable");
  });
});
