import { appShellRoleContract } from "../../shared/role-bridge-contracts.js";
import type { ImplementationFromContract } from "../../shared/role-bridge-registry.js";
import type { AppBridgeHandlerDependencies } from "./dependencies.js";

export interface AppShellImplementationDependencies {
  appDataStore: Pick<AppBridgeHandlerDependencies["appDataStore"], "updateSettings">;
  readBootstrapState: AppBridgeHandlerDependencies["readBootstrapState"];
  setPendingRoute: AppBridgeHandlerDependencies["setPendingRoute"];
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
