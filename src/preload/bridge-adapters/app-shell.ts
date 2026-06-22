import type { AppRoute, BootstrapState } from "../../shared/app-contracts.js";
import { APP_SHELL_CHANNELS, type AppShellBridge } from "../../shared/bridge-contracts.js";
import { invoke, subscribe, type PreloadIpc } from "./ipc.js";

export function createAppShellBridge(ipc: PreloadIpc): AppShellBridge {
  return {
    getBootstrapState: () => invoke<BootstrapState>(ipc, APP_SHELL_CHANNELS.getBootstrapState),
    setOnboardingComplete: (complete: boolean) =>
      invoke<void>(ipc, APP_SHELL_CHANNELS.setOnboardingComplete, complete),
    setRoute: (route: AppRoute) => invoke<void>(ipc, APP_SHELL_CHANNELS.setRoute, route),
    onNavigate: (listener: (route: AppRoute) => void) =>
      subscribe(ipc, APP_SHELL_CHANNELS.navigate, listener)
  };
}
