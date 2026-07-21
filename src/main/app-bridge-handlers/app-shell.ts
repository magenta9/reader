import { appShellRoleContract } from "../../shared/role-bridge-contracts.js";
import type { ImplementationFromContract } from "../../shared/role-bridge-registry.js";
import type { AppBridgeHandlerDependencies } from "./dependencies.js";

export interface AppShellImplementationDependencies {
  readerAppShell: AppBridgeHandlerDependencies["readerAppShell"];
}

export function createAppShellImplementation({
  readerAppShell
}: AppShellImplementationDependencies): ImplementationFromContract<
  typeof appShellRoleContract
> {
  return {
    getBootstrapState: () => readerAppShell.getBootstrapState(),
    setRoute: (route) => {
      const snapshot = readerAppShell.acceptRendererRoute(route);
      if (!snapshot) throw new Error("Invalid Reader route.");
      return snapshot;
    },
    setOnboardingComplete: (complete) => {
      readerAppShell.setOnboardingComplete(complete);
    }
  };
}
