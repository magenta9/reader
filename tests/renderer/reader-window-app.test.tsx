// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ReaderWindowApp } from "../../src/renderer/App.js";
import {
  DEFAULT_ACTIVATION_SHORTCUT,
  type AppSettings,
  type FavoriteRecord,
  type ReadingHistoryRecord
} from "../../src/shared/app-contracts.js";
import type { ReaderWindowRuntimeBridge } from "../../src/shared/bridge-contracts.js";

afterEach(() => {
  cleanup();
});

describe("ReaderWindowApp", () => {
  it("shows the Home setup blocker when no MiniMax API key is available", async () => {
    renderReaderWindow({
      hasApiKey: false,
      settings: createSettings({ apiKeyStatus: "missing", voices: [] })
    });

    expect(await screen.findByText("需要 API Key")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "播放" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "去设置 API Key" })).toBeEnabled();
  });

  it("starts verified playback through the bridge and shows successful feedback", async () => {
    const playReadingTarget = vi.fn(async () => ({ started: true, sessionId: 42 }));
    renderReaderWindow({
      readerPatch: { playReadingTarget },
      settings: createVerifiedSettings()
    });

    await userEvent.click(await screen.findByRole("button", { name: "播放" }));

    await waitFor(() => expect(playReadingTarget).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("已开始朗读")).toBeInTheDocument();
  });

  it("updates language-scoped Voice preference from the visible select control", async () => {
    const settings = createVerifiedSettings({
      voices: [
        { voice_id: "voice-zh-a", display_name: "中文 A", language: "zh" },
        { voice_id: "voice-zh-b", display_name: "中文 B", language: "zh" }
      ],
      preferredVoicesByLanguage: { zh: "voice-zh-a" }
    });
    const setPreferredVoice = vi.fn(async (_language: string, voiceId: string) =>
      createVerifiedSettings({
        ...settings,
        preferredVoicesByLanguage: { zh: voiceId }
      })
    );
    renderReaderWindow({
      readerPatch: { setPreferredVoice },
      settings
    });

    await userEvent.selectOptions(await screen.findByRole("combobox"), "voice-zh-b");

    await waitFor(() => expect(setPreferredVoice).toHaveBeenCalledWith("zh", "voice-zh-b"));
    expect((screen.getByRole("option", { name: "中文 B" }) as HTMLOptionElement).selected).toBe(true);
  });

  it("shows the Reading History empty state", async () => {
    renderReaderWindow({
      bootstrapRoute: "history",
      history: [],
      settings: createVerifiedSettings()
    });

    expect(await screen.findByText("暂无历史记录")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "选择一条历史记录" })).toBeInTheDocument();
  });

  it("selects a Reading History Record and shows detail actions", async () => {
    const record = createHistoryRecord({
      id: "history-1",
      preview: "历史记录预览",
      text: "历史记录预览。完整正文。",
      createdAt: 1_700_000_000_000
    });
    renderReaderWindow({
      bootstrapRoute: "history",
      history: [record],
      settings: createVerifiedSettings()
    });

    await userEvent.click(await screen.findByRole("button", { name: /历史记录预览/ }));

    const detail = screen.getByRole("heading", { name: "历史记录预览" }).closest(".history-detail");
    expect(detail).not.toBeNull();
    const detailScope = within(detail as HTMLElement);
    expect(detailScope.getByRole("button", { name: "重新播放" })).toBeEnabled();
    expect(detailScope.getByRole("button", { name: "复制全文" })).toBeEnabled();
    expect(detailScope.getByRole("button", { name: "添加收藏" })).toBeEnabled();
    expect(detailScope.getByRole("button", { name: "删除" })).toBeEnabled();
    expect(detailScope.getByText("历史记录预览。完整正文。")).toBeInTheDocument();
  });
});

interface RenderReaderWindowOptions {
  bootstrapRoute?: "home" | "history" | "favorites" | "settings";
  favorites?: FavoriteRecord[];
  hasApiKey?: boolean;
  history?: ReadingHistoryRecord[];
  readerPatch?: Partial<ReaderWindowRuntimeBridge>;
  settings?: AppSettings;
}

function renderReaderWindow(options: RenderReaderWindowOptions = {}): void {
  const settings = options.settings ?? createVerifiedSettings();
  const readerBridge = createReaderBridge({
    ...options,
    settings
  });
  render(<ReaderWindowApp readerBridge={readerBridge} />);
}

function createReaderBridge(
  options: Required<Pick<RenderReaderWindowOptions, "settings">> & RenderReaderWindowOptions
): ReaderWindowRuntimeBridge {
  let settings = options.settings;
  return {
    getBootstrapState: async () => ({
      hasCompletedOnboarding: settings.hasCompletedOnboarding,
      lastRoute: options.bootstrapRoute ?? "home"
    }),
    setOnboardingComplete: async (complete) => {
      settings = { ...settings, hasCompletedOnboarding: complete };
    },
    setRoute: async () => undefined,
    onNavigate: () => () => undefined,
    getSettings: async () => settings,
    updateSettings: async (patch) => {
      settings = { ...settings, ...patch };
      return settings;
    },
    setLaunchAtLogin: async (launchAtLogin) => {
      settings = { ...settings, launchAtLogin };
      return settings;
    },
    setActivationShortcut: async (activationShortcut) => {
      settings = { ...settings, activationShortcut };
      return { ok: true, settings };
    },
    setMiniMaxApiKey: async () => undefined,
    clearMiniMaxApiKey: async () => undefined,
    hasMiniMaxApiKey: async () => options.hasApiKey ?? true,
    verifyMiniMaxKey: async () => ({ ok: true, settings }),
    refreshVoices: async () => ({ ok: true, settings }),
    setPreferredVoice: async (language, voiceId) => {
      settings = {
        ...settings,
        preferredVoicesByLanguage: {
          ...settings.preferredVoicesByLanguage,
          [language]: voiceId
        }
      };
      return settings;
    },
    getErrorLogCount: async () => 0,
    clearErrorLog: async () => undefined,
    getReadingHistoryCount: async () => options.history?.length ?? 0,
    listReadingHistory: async () => options.history ?? [],
    deleteReadingHistoryRecord: async () => undefined,
    clearReadingHistory: async () => undefined,
    createFavoriteFromHistoryRecord: async () => undefined,
    listFavorites: async () => options.favorites ?? [],
    deleteFavoriteRecord: async () => undefined,
    playReadingTarget: async () => ({ started: true, sessionId: 1 }),
    playHistoryRecord: async () => ({ started: true, sessionId: 2 }),
    playFavoriteRecord: async () => ({ started: true, sessionId: 3 }),
    stopPlayback: async () => undefined,
    copyText: async () => undefined,
    onPlaybackFinish: () => () => undefined,
    onPlaybackFail: () => () => undefined,
    onPlaybackStop: () => () => undefined,
    ...options.readerPatch
  };
}

function createVerifiedSettings(patch: Partial<AppSettings> = {}): AppSettings {
  return createSettings({
    apiKeyStatus: "verified",
    voices: [{ voice_id: "voice-zh", display_name: "中文 Voice", language: "zh" }],
    preferredVoicesByLanguage: { zh: "voice-zh" },
    ...patch
  });
}

function createSettings(patch: Partial<AppSettings> = {}): AppSettings {
  return {
    hasCompletedOnboarding: true,
    lastRoute: "home",
    launchAtLogin: false,
    activationShortcut: DEFAULT_ACTIVATION_SHORTCUT,
    speechRate: 1,
    model: "speech-2.8-turbo",
    historyRetention: "1m",
    apiKeyStatus: "missing",
    voices: [],
    preferredVoicesByLanguage: {},
    ...patch
  };
}

function createHistoryRecord(patch: Partial<ReadingHistoryRecord> = {}): ReadingHistoryRecord {
  return {
    id: "history",
    createdAt: 1_700_000_000_000,
    text: "历史记录全文",
    preview: "历史记录",
    durationEstimateSeconds: 42,
    languageSummary: "中文",
    source: "selected_text",
    ...patch
  };
}
