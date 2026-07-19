import type { AppSettings } from "../../shared/app-contracts.js";

type PlaybackPreferenceUpdate = { speechRate: number } | { model: string };

export interface PlaybackPreferencesDataStore {
  getSettings(): AppSettings;
  updateSettings(patch: PlaybackPreferenceUpdate): AppSettings;
}

export class PlaybackPreferencesCommands {
  constructor(private readonly store: PlaybackPreferencesDataStore) {}

  setSpeechRate(speechRate: number): AppSettings {
    return this.store.updateSettings({ speechRate });
  }

  setModel(model: string): AppSettings {
    const normalizedModel = model.trim();
    if (!normalizedModel) return this.store.getSettings();
    return this.store.updateSettings({ model: normalizedModel });
  }
}
