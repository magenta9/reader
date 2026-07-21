import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AppDataStore } from "../../../src/main/data/app-data-store.js";
import { MiniMaxAccountService } from "../../../src/main/data/minimax-account-service.js";
import type { MiniMaxVoice } from "../../../src/shared/types.js";

const zhVoice: MiniMaxVoice = {
  voice_id: "voice-zh",
  display_name: "Chinese Voice",
  language: "zh"
};

describe("MiniMaxAccountService", () => {
  it("verifies a MiniMax API key, persists Voice cache, and updates Preferred Voice", async () => {
    const store = await createStore();
    try {
      store.saveMiniMaxApiKey("valid-key");
      const account = new MiniMaxAccountService(store, {
        now: () => 12345,
        getVoices: async (apiKey) => {
          expect(apiKey).toBe("valid-key");
          return [zhVoice];
        }
      });

      const result = await account.verifyApiKey();
      expect(result.ok).toBe(true);
      expect(result.settings.apiKeyStatus).toBe("verified");
      expect(result.settings.apiKeyVerifiedAt).toBe(12345);
      expect(result.settings.voices[0]?.voice_id).toBe("voice-zh");
      expect(store.getSettings().voices[0]?.voice_id).toBe("voice-zh");
      expect(store.getErrorLogCount()).toBe(0);

      const preferredSettings = account.setPreferredVoice("zh", "voice-zh");
      expect(preferredSettings.preferredVoicesByLanguage.zh).toBe("voice-zh");
    } finally {
      store.close();
    }
  });

  it("uses cached Voices on refresh failure without writing Error Log", async () => {
    const store = await createStore();
    try {
      store.saveMiniMaxApiKey("valid-key");
      store.updateSettings({
        apiKeyStatus: "verified",
        voices: [zhVoice]
      });
      const account = new MiniMaxAccountService(store, {
        getVoices: async () => {
          throw new Error("fetch failed");
        }
      });

      const result = await account.refreshVoices();

      expect(result.ok).toBe(true);
      expect(result.usedCachedVoices).toBe(true);
      expect(result.settings.apiKeyStatus).toBe("verified");
      expect(result.settings.voices[0]?.voice_id).toBe("voice-zh");
      expect(result.error).toBe("Network error");
      expect(store.getErrorLogCount()).toBe(0);
    } finally {
      store.close();
    }
  });

  it("handles missing and invalid API keys without writing Error Log", async () => {
    const store = await createStore();
    try {
      const missingAccount = new MiniMaxAccountService(store, {
        getVoices: async () => [zhVoice]
      });
      const missing = await missingAccount.verifyApiKey();

      expect(missing.ok).toBe(false);
      expect(missing.settings.apiKeyStatus).toBe("missing");
      expect(store.getErrorLogCount()).toBe(0);

      store.saveMiniMaxApiKey("bad-key");
      const failingAccount = new MiniMaxAccountService(store, {
        getVoices: async () => {
          throw new Error("invalid api key");
        }
      });
      const failed = await failingAccount.verifyApiKey();

      expect(failed.ok).toBe(false);
      expect(failed.settings.apiKeyStatus).toBe("failed");
      expect(failed.error).toBe("Invalid API key");
      expect(store.getErrorLogCount()).toBe(0);
    } finally {
      store.close();
    }
  });
});

async function createStore(): Promise<AppDataStore> {
  const dataDir = await mkdtemp(join(tmpdir(), "voicereader-minimax-account-"));
  return AppDataStore.open(join(dataDir, "voicereader.sqlite"));
}
