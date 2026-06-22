import type { AppRoute, BootstrapState } from "../app-contracts.js";

export const APP_SHELL_CHANNELS = {
  getBootstrapState: "app-shell:get-bootstrap-state",
  setOnboardingComplete: "app-shell:set-onboarding-complete",
  setRoute: "app-shell:set-route",
  navigate: "app-shell:navigate"
} as const;

export interface AppShellBridge {
  getBootstrapState: () => Promise<BootstrapState>;
  setOnboardingComplete: (complete: boolean) => Promise<void>;
  setRoute: (route: AppRoute) => Promise<void>;
  onNavigate: (listener: (route: AppRoute) => void) => () => void;
}
