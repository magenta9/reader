import type { AppRoute } from "../../shared/app-contracts.js";
import { APP_SHELL_CHANNELS } from "../../shared/bridge-contracts.js";
import type { AppBridgeHandlerDependencies } from "./dependencies.js";

type AppShellHandlerDependencies = Pick<
  AppBridgeHandlerDependencies,
  "appDataStore" | "ipcMain" | "readBootstrapState" | "setPendingRoute"
>;

export function registerAppShellHandlers({
  appDataStore,
  ipcMain,
  readBootstrapState,
  setPendingRoute
}: AppShellHandlerDependencies): void {
  ipcMain.handle(APP_SHELL_CHANNELS.getBootstrapState, () => readBootstrapState());
  ipcMain.handle(APP_SHELL_CHANNELS.setRoute, (_event, route: AppRoute) => {
    setPendingRoute(route);
    appDataStore.updateSettings({ lastRoute: route });
  });
  ipcMain.handle(APP_SHELL_CHANNELS.setOnboardingComplete, (_event, complete: boolean) => {
    appDataStore.updateSettings({ hasCompletedOnboarding: complete });
  });
}
