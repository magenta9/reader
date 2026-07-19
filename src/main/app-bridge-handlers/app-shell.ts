import { appShellRoleContract } from "../../shared/role-bridge-contracts.js";
import {
  registerRoleHandlers,
  type ImplementationFromContract
} from "../../shared/role-bridge-registry.js";
import { createElectronMainRoleHandlerTransport } from "../electron-main-role-transport.js";
import type { AppBridgeHandlerDependencies } from "./dependencies.js";

export interface AppShellImplementationDependencies {
  appDataStore: Pick<AppBridgeHandlerDependencies["appDataStore"], "updateSettings">;
  readBootstrapState: AppBridgeHandlerDependencies["readBootstrapState"];
  setPendingRoute: AppBridgeHandlerDependencies["setPendingRoute"];
}

type AppShellHandlerDependencies = AppShellImplementationDependencies &
  Pick<AppBridgeHandlerDependencies, "ipcMain">;

export function registerAppShellHandlers({
  appDataStore,
  ipcMain,
  readBootstrapState,
  setPendingRoute
}: AppShellHandlerDependencies): void {
  registerRoleHandlers(
    appShellRoleContract,
    createAppShellImplementation({ appDataStore, readBootstrapState, setPendingRoute }),
    createElectronMainRoleHandlerTransport(ipcMain)
  );
}

export function createAppShellImplementation({
  appDataStore,
  readBootstrapState,
  setPendingRoute
}: AppShellImplementationDependencies): ImplementationFromContract<
  typeof appShellRoleContract
> {
  return {
    getBootstrapState: () => readBootstrapState(),
    setRoute: (route) => {
      setPendingRoute(route);
      appDataStore.updateSettings({ lastRoute: route });
    },
    setOnboardingComplete: (complete) => {
      appDataStore.updateSettings({ hasCompletedOnboarding: complete });
    }
  };
}
