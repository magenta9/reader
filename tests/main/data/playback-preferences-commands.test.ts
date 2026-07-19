import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AppDataStore } from "../../../src/main/data/app-data-store.js";
import { PlaybackPreferencesCommands } from "../../../src/main/data/playback-preferences-commands.js";

describe("PlaybackPreferencesCommands", () => {
  it("updates Speech Rate through the store normalization without changing main-owned settings", async () => {
    const store = await createStore();
    try {
      store.updateSettings({
        hasCompletedOnboarding: true,
        lastRoute: "favorites",
        launchAtLogin: true,
        activationShortcut: "Control+Option+P",
        apiKeyStatus: "verified",
        model: "speech-2.8-turbo",
        historyRetention: "forever"
      });
      const commands = new PlaybackPreferencesCommands(store);

      expect(commands.setSpeechRate(0.5).speechRate).toBe(0.5);
      expect(commands.setSpeechRate(0.1).speechRate).toBe(0.5);
      expect(commands.setSpeechRate(1.7).speechRate).toBe(1.7);
      expect(commands.setSpeechRate(3).speechRate).toBe(3);
      expect(commands.setSpeechRate(9).speechRate).toBe(3);
      const settings = commands.setSpeechRate(Number.NaN);

      expect(settings.speechRate).toBe(1);
      expect(settings).toMatchObject({
        hasCompletedOnboarding: true,
        lastRoute: "favorites",
        launchAtLogin: true,
        activationShortcut: "Control+Option+P",
        apiKeyStatus: "verified",
        model: "speech-2.8-turbo",
        historyRetention: "forever"
      });
    } finally {
      store.close();
    }
  });

  it("stores a trimmed non-empty Model and ignores an empty value", async () => {
    const store = await createStore();
    try {
      store.updateSettings({ speechRate: 1.5, model: "speech-2.8-hd" });
      const commands = new PlaybackPreferencesCommands(store);

      expect(commands.setModel("speech-2.8-turbo").model).toBe("speech-2.8-turbo");
      const updated = commands.setModel("  custom-model-v1  ");
      expect(updated.model).toBe("custom-model-v1");
      expect(updated.speechRate).toBe(1.5);

      const unchanged = commands.setModel("   ");
      expect(unchanged.model).toBe("custom-model-v1");
      expect(store.getSettings().model).toBe("custom-model-v1");
    } finally {
      store.close();
    }
  });
});

async function createStore(): Promise<AppDataStore> {
  const dataDir = await mkdtemp(join(tmpdir(), "voicereader-playback-preferences-"));
  return new AppDataStore(join(dataDir, "voicereader.sqlite"));
}
