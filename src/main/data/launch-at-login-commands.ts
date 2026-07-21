import type { AppSettings } from "../../shared/app-contracts.js";

export interface LoginItemSettingsPort {
  setLoginItemSettings(settings: { openAtLogin: boolean }): void;
}

export interface LaunchAtLoginDataStore {
  getSettings(): AppSettings;
  updateSettings(patch: { launchAtLogin: boolean }): AppSettings;
}

export class LaunchAtLoginCommands {
  constructor(
    private readonly loginItems: LoginItemSettingsPort,
    private readonly store: LaunchAtLoginDataStore
  ) {}

  initialize(): void {
    this.loginItems.setLoginItemSettings({ openAtLogin: this.store.getSettings().launchAtLogin });
  }

  setLaunchAtLogin(launchAtLogin: boolean): AppSettings {
    this.loginItems.setLoginItemSettings({ openAtLogin: launchAtLogin });
    return this.store.updateSettings({ launchAtLogin });
  }
}
