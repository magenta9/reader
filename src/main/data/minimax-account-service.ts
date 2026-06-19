import { getMiniMaxVoices } from "../../shared/minimax.js";
import type { AppSettings, MiniMaxSetupResult } from "../../shared/app-contracts.js";
import type { DetectedLanguage, MiniMaxVoice } from "../../shared/types.js";
import type { MiniMaxAccountDataStore } from "./app-data-store.js";

export interface MiniMaxAccountServiceOptions {
  getVoices?: (apiKey: string) => Promise<MiniMaxVoice[]>;
  now?: () => number;
}

export class MiniMaxAccountService {
  private readonly getVoices: (apiKey: string) => Promise<MiniMaxVoice[]>;
  private readonly now: () => number;

  constructor(
    private readonly store: MiniMaxAccountDataStore,
    options: MiniMaxAccountServiceOptions = {}
  ) {
    this.getVoices = options.getVoices ?? getMiniMaxVoices;
    this.now = options.now ?? Date.now;
  }

  async verifyApiKey(): Promise<MiniMaxSetupResult> {
    return this.loadVoices({ requireFreshSuccess: true });
  }

  async refreshVoices(): Promise<MiniMaxSetupResult> {
    return this.loadVoices({ requireFreshSuccess: false });
  }

  setPreferredVoice(language: DetectedLanguage, voiceId: string): AppSettings {
    const settings = this.store.getSettings();
    return this.store.updateSettings({
      preferredVoicesByLanguage: {
        ...settings.preferredVoicesByLanguage,
        [language]: voiceId
      }
    });
  }

  private async loadVoices(options: { requireFreshSuccess: boolean }): Promise<MiniMaxSetupResult> {
    const apiKey = this.store.readMiniMaxApiKey();
    if (!apiKey) {
      const settings = this.store.updateSettings({
        apiKeyStatus: "missing",
        apiKeyError: undefined,
        voiceRefreshError: undefined
      });
      return { ok: false, settings, error: "MiniMax API Key 未配置" };
    }

    try {
      const voices = await this.getVoices(apiKey);
      const settings = this.store.updateSettings({
        apiKeyStatus: "verified",
        apiKeyVerifiedAt: this.now(),
        apiKeyError: undefined,
        voiceRefreshError: undefined,
        voices
      });
      return { ok: true, settings };
    } catch (error) {
      const safeError = safeMiniMaxSetupError(error);
      const current = this.store.getSettings();
      const hasCachedVoices = current.voices.length > 0;

      if (hasCachedVoices && !options.requireFreshSuccess) {
        const settings = this.store.updateSettings({
          voiceRefreshError: safeError,
          apiKeyStatus: current.apiKeyStatus === "verified" ? "verified" : "failed",
          apiKeyError: current.apiKeyStatus === "verified" ? undefined : safeError
        });
        return { ok: true, settings, error: safeError, usedCachedVoices: true };
      }

      const settings = this.store.updateSettings({
        apiKeyStatus: "failed",
        apiKeyError: safeError,
        voiceRefreshError: safeError
      });
      return { ok: false, settings, error: safeError };
    }
  }
}

export function safeMiniMaxSetupError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/invalid api key|login fail|authorization|unauthorized/i.test(message)) return "Invalid API key";
  if (/no voices/i.test(message)) return "MiniMax returned no voices";
  if (/fetch|network|ENOTFOUND|ECONN|timeout/i.test(message)) return "Network error";
  return message.trim().slice(0, 160) || "MiniMax connection failed";
}
