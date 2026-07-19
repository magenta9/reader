import { appShellRoleContract } from "../../shared/role-bridge-contracts.js";
import type { ImplementationFromContract } from "../../shared/role-bridge-registry.js";
import type { AppBridgeHandlerDependencies } from "./dependencies.js";

export interface AppShellImplementationDependencies {
  appDataStore: Pick<AppBridgeHandlerDependencies["appDataStore"], "updateSettings">;
  readBootstrapState: AppBridgeHandlerDependencies["readBootstrapState"];
  acceptRendererRoute: AppBridgeHandlerDependencies["acceptRendererRoute"];
}

export function createAppShellImplementation({
  appDataStore,
  readBootstrapState,
  acceptRendererRoute
}: AppShellImplementationDependencies): ImplementationFromContract<
  typeof appShellRoleContract
> {
  return {
    getBootstrapState: () => readBootstrapState(),
    setRoute: (route) => {
      const snapshot = acceptRendererRoute(route);
      if (!snapshot) throw new Error("Invalid Reader route.");
      return snapshot;
    },
    setOnboardingComplete: (complete) => {
      appDataStore.updateSettings({ hasCompletedOnboarding: complete });
    }
  };
}
