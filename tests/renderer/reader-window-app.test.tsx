// @vitest-environment jsdom

import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ReaderWindowApp } from "../../src/renderer/App.js";
import {
  DEFAULT_ACTIVATION_SHORTCUT,
  type AppSettings,
  type BootstrapState,
  type FavoriteRecord,
  type ReadingHistoryRecord,
  type RouteSnapshot
} from "../../src/shared/app-contracts.js";
import type { ReaderWindowRoleBridge } from "../../src/shared/role-bridge-contracts.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ReaderWindowApp", () => {
  it("does not let a stale bootstrap response overwrite newer navigation", async () => {
    let resolveBootstrap: ((state: BootstrapState) => void) | undefined;
    let navigate: ((snapshot: RouteSnapshot) => void) | undefined;
    const bootstrap = new Promise<BootstrapState>((resolve) => {
      resolveBootstrap = resolve;
    });
    renderReaderWindow({
      history: [],
      readerPatch: {
        getBootstrapState: () => bootstrap,
        onNavigate: (listener) => {
          navigate = listener;
          return () => {
            navigate = undefined;
          };
        }
      }
    });

    act(() => navigate?.({ route: "history", revision: 2 }));
    await screen.findByRole("heading", { name: "历史记录" });
    act(() => navigate?.({ route: "settings", revision: 2 }));
    resolveBootstrap?.({ hasCompletedOnboarding: true, route: { route: "home", revision: 1 } });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "历史记录" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "设置" })).not.toBeInTheDocument();
    });
  });

  it("does not let bootstrap overwrite navigation started locally while it was loading", async () => {
    let resolveBootstrap: ((state: BootstrapState) => void) | undefined;
    const bootstrap = new Promise<BootstrapState>((resolve) => {
      resolveBootstrap = resolve;
    });
    renderReaderWindow({
      history: [],
      readerPatch: { getBootstrapState: () => bootstrap }
    });

    await userEvent.click(screen.getByRole("button", { name: "历史记录" }));
    await screen.findByRole("heading", { name: "历史记录" });
    resolveBootstrap?.({ hasCompletedOnboarding: true, route: { route: "home", revision: 0 } });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "历史记录" })).toBeInTheDocument();
    });
  });

  it("keeps Home task-first and gives utility routes concise page context", async () => {
    renderReaderWindow({ settings: createVerifiedSettings() });

    expect(await screen.findByRole("heading", { name: "朗读当前选区" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "主页" })).not.toBeInTheDocument();

    for (const [route, description] of [
      ["历史记录", "查看、重播与管理仅保存在本机的朗读内容。"],
      ["收藏", "保存重要的朗读内容，随时重新播放。"],
      ["设置", "管理连接、朗读偏好与本机数据。"]
    ] as const) {
      await userEvent.click(screen.getByRole("button", { name: route }));
      expect(await screen.findByRole("heading", { name: route })).toBeInTheDocument();
      expect(screen.getByText(description)).toBeInTheDocument();
    }
  });

  it("shows the Home setup blocker when no MiniMax API key is available", async () => {
    renderReaderWindow({
      hasApiKey: false,
      settings: createSettings({ apiKeyStatus: "missing", voices: [] })
    });

    expect(await screen.findByText("需要 API Key")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "播放" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "去设置 API Key" })).toBeEnabled();
  });

  it.each([
    [
      "需要验证连接",
      "验证连接",
      createVerifiedSettings({ apiKeyStatus: "failed" })
    ],
    [
      "需要 Voice 列表",
      "刷新 Voice",
      createVerifiedSettings({ voices: [], preferredVoicesByLanguage: {} })
    ]
  ])("pairs the %s blocker with one recovery action", async (status, action, settings) => {
    renderReaderWindow({ settings });

    expect(await screen.findByText(status)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: action })).toBeEnabled();
    expect(document.querySelectorAll(".home-status-line")).toHaveLength(1);
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

  it("distills Home to one playback status and progressively disclosed Voice options", async () => {
    renderReaderWindow({ settings: createVerifiedSettings() });

    expect(await screen.findByRole("heading", { name: "朗读当前选区" })).toBeInTheDocument();
    expect(screen.queryByText("准备朗读当前选区")).not.toBeInTheDocument();
    expect(screen.getByText(/文本会发送到 MiniMax；完整历史仅存本机，不保存音频/)).toBeInTheDocument();
    expect(screen.queryByText("快捷键可用")).not.toBeInTheDocument();
    expect(screen.queryByText("配置完成")).not.toBeInTheDocument();
    expect(screen.getByText("朗读选项").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Control+Command+R").parentElement).toHaveAccessibleName(
      "Control+Command+R 开始朗读，Esc 停止"
    );
  });

  it("keeps playback available while isolating a shortcut conflict in the shortcut hint", async () => {
    renderReaderWindow({
      settings: createVerifiedSettings({ shortcutRegistrationError: "快捷键已被占用" })
    });

    expect(await screen.findByText("快捷键不可用")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "播放" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "修复快捷键" })).toBeEnabled();
    expect(screen.getAllByRole("button", { name: /修复/ })).toHaveLength(1);
    expect(screen.queryByText("准备朗读当前选区")).not.toBeInTheDocument();
  });

  it("offers an inline retry when the Home setup cannot be loaded", async () => {
    const settings = createVerifiedSettings();
    const getSettings = vi.fn().mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue(settings);
    renderReaderWindow({
      readerPatch: { getSettings },
      settings
    });

    expect(await screen.findByText("无法读取朗读配置")).toBeInTheDocument();
    expect(screen.queryByText("需要 API Key")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "播放" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByText("Control+Command+R")).toBeInTheDocument();
    expect(getSettings).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "播放" })).toBeEnabled();
  });

  it("points to the Menu Bar fallback when the global Stop Shortcut is unavailable", async () => {
    renderReaderWindow({
      readerPatch: {
        playReadingTarget: async () => ({
          started: true,
          sessionId: 9,
          stopShortcutAvailable: false
        })
      },
      settings: createVerifiedSettings()
    });

    await userEvent.click(await screen.findByRole("button", { name: "播放" }));

    expect(await screen.findByText("已开始朗读；Esc 不可用，请从菜单栏停止")).toBeInTheDocument();
  });

  it("replaces the ready shortcut hint with the latest playback outcome", async () => {
    const playReadingTarget = vi.fn(async () => ({ started: false as const, skipped: "empty_clipboard" as const }));
    renderReaderWindow({
      readerPatch: { playReadingTarget },
      settings: createVerifiedSettings()
    });

    await userEvent.click(await screen.findByRole("button", { name: "播放" }));

    expect(await screen.findByText("没有检测到选区或剪切板文本")).toBeInTheDocument();
    expect(screen.queryByText("可在任意 App 使用")).not.toBeInTheDocument();
    expect(document.querySelector(".status-dot")).toBeNull();
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

    await userEvent.click(await screen.findByText("朗读选项"));
    await userEvent.selectOptions(await screen.findByRole("combobox", { name: "Voice" }), "voice-zh-b");

    await waitFor(() => expect(setPreferredVoice).toHaveBeenCalledWith("zh", "voice-zh-b"));
    expect((screen.getByRole("option", { name: "中文 B" }) as HTMLOptionElement).selected).toBe(true);
  });

  it("defaults Voice options to the first language that actually has a Voice", async () => {
    renderReaderWindow({
      settings: createVerifiedSettings({
        voices: [{ voice_id: "voice-en", display_name: "English Voice", language: "en" }],
        preferredVoicesByLanguage: { en: "voice-en" }
      })
    });

    expect(await screen.findByText("英文 · English Voice")).toBeInTheDocument();
    await userEvent.click(screen.getByText("朗读选项"));
    expect(screen.getByRole("button", { name: "英文" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "中文" })).not.toBeInTheDocument();
  });

  it("shows the Reading History empty state", async () => {
    renderReaderWindow({
      bootstrapRoute: "history",
      history: [],
      settings: createVerifiedSettings()
    });

    expect(await screen.findByText("暂无历史记录")).toBeInTheDocument();
    expect(screen.getByText("朗读选中文本或剪切板后，历史记录会显示在这里。")).toBeInTheDocument();
  });

  it("summarizes local Reading History retention and manages it in Settings", async () => {
    renderReaderWindow({
      bootstrapRoute: "history",
      settings: createVerifiedSettings({ historyRetention: "3m" })
    });

    expect(await screen.findByText("仅存本机")).toBeInTheDocument();
    expect(await screen.findByText("保留 3 个月")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "管理" }));

    expect(await screen.findByRole("heading", { name: "设置" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "历史记录" })).toBeInTheDocument();
  });

  it("keeps the local-only History promise visible when retention settings cannot be loaded", async () => {
    renderReaderWindow({
      bootstrapRoute: "history",
      readerPatch: { getSettings: async () => Promise.reject(new Error("settings unavailable")) },
      settings: createVerifiedSettings()
    });

    expect(await screen.findByText("仅存本机")).toBeInTheDocument();
    expect(await screen.findByText("保留期限暂不可用")).toBeInTheDocument();
  });

  it("recovers inline when Reading History cannot be loaded", async () => {
    const record = createHistoryRecord({ id: "history-recovered", preview: "重新载入后的历史" });
    const listReadingHistory = vi
      .fn<ReaderWindowRoleBridge["listReadingHistory"]>()
      .mockRejectedValueOnce(new Error("database busy"))
      .mockResolvedValueOnce([record]);
    renderReaderWindow({
      bootstrapRoute: "history",
      readerPatch: { listReadingHistory },
      settings: createVerifiedSettings()
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("无法载入历史记录");
    await userEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByRole("button", { name: /重新载入后的历史/ })).toBeInTheDocument();
    expect(listReadingHistory).toHaveBeenCalledTimes(2);
  });

  it("scans Reading History metadata and expands only the selected Record inline", async () => {
    const first = createHistoryRecord({
      id: "history-first",
      preview: "第一条历史记录",
      text: "第一条历史记录的完整正文。",
      durationEstimateSeconds: 125,
      languageSummary: "中文",
      source: "selected_text"
    });
    const second = createHistoryRecord({
      id: "history-second",
      preview: "第二条历史记录",
      text: "第二条历史记录的完整正文。",
      durationEstimateSeconds: 42,
      languageSummary: "英文",
      source: "clipboard"
    });
    renderReaderWindow({
      bootstrapRoute: "history",
      history: [first, second],
      settings: createVerifiedSettings()
    });

    const firstRow = await screen.findByRole("button", { name: /第一条历史记录.*约 2 分钟.*中文.*选区/ });
    const secondRow = screen.getByRole("button", { name: /第二条历史记录.*约 1 分钟.*英文.*剪切板/ });
    expect(firstRow).toHaveAttribute("aria-expanded", "false");
    expect(secondRow).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("第一条历史记录的完整正文。")).not.toBeInTheDocument();

    await userEvent.click(firstRow);

    const detail = screen.getByRole("heading", { name: "第一条历史记录" }).closest(".history-detail");
    expect(detail).not.toBeNull();
    const detailScope = within(detail as HTMLElement);
    expect(detailScope.getByRole("button", { name: "重新播放" })).toBeEnabled();
    expect(detailScope.getByRole("button", { name: "复制全文" })).toBeEnabled();
    expect(detailScope.getByRole("button", { name: "添加收藏" })).toBeEnabled();
    expect(detailScope.getByRole("button", { name: "删除记录" })).toBeEnabled();
    expect(detailScope.getByText("第一条历史记录的完整正文。")).toBeInTheDocument();

    await userEvent.click(secondRow);

    expect(firstRow).toHaveAttribute("aria-expanded", "false");
    expect(secondRow).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByText("第一条历史记录的完整正文。")).not.toBeInTheDocument();
    expect(screen.getByText("第二条历史记录的完整正文。")).toBeInTheDocument();
  });

  it.each([
    {
      route: "history" as const,
      record: createHistoryRecord({ id: "history-actions", text: "历史操作正文", preview: "历史操作" }),
      replayMethod: "playHistoryRecord" as const
    },
    {
      route: "favorites" as const,
      record: createFavoriteRecord({ id: "favorite-actions", text: "收藏操作正文", preview: "收藏操作" }),
      replayMethod: "playFavoriteRecord" as const
    }
  ])("keeps copy, replay, and stop behavior at the $route seam", async ({ route, record, replayMethod }) => {
    const options = route === "history" ? { history: [record] } : { favorites: [record] };
    const bridge = renderReaderWindow({ bootstrapRoute: route, ...options });
    const copyText = vi.spyOn(bridge, "copyText");
    const replay = vi.spyOn(bridge, replayMethod);
    const stopPlayback = vi.spyOn(bridge, "stopPlayback");

    await userEvent.click(await screen.findByRole("button", { name: new RegExp(record.preview) }));
    await userEvent.click(screen.getByRole("button", { name: "复制全文" }));
    expect(copyText).toHaveBeenCalledWith(record.text);

    await userEvent.click(screen.getByRole("button", { name: "重新播放" }));
    await waitFor(() => expect(replay).toHaveBeenCalledWith(record.id));
    await userEvent.click(await screen.findByRole("button", { name: "停止" }));
    expect(stopPlayback).toHaveBeenCalledTimes(1);
  });

  it("stops an inline replay before collapsing it or expanding another History Record", async () => {
    const first = createHistoryRecord({ id: "history-playing", preview: "正在重播的历史" });
    const second = createHistoryRecord({ id: "history-next", preview: "下一条历史" });
    const bridge = renderReaderWindow({ bootstrapRoute: "history", history: [first, second] });
    const stopPlayback = vi.spyOn(bridge, "stopPlayback");

    await userEvent.click(await screen.findByRole("button", { name: /正在重播的历史/ }));
    await userEvent.click(screen.getByRole("button", { name: "重新播放" }));
    expect(await screen.findByLabelText("历史重播中")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /下一条历史/ }));

    expect(stopPlayback).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("历史重播中")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /下一条历史/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps replay failure feedback inside the expanded History Record", async () => {
    const record = createHistoryRecord({ id: "history-replay-error", preview: "无法重播的历史" });
    renderReaderWindow({
      bootstrapRoute: "history",
      history: [record],
      readerPatch: { playHistoryRecord: async () => Promise.reject(new Error("playback unavailable")) }
    });

    await userEvent.click(await screen.findByRole("button", { name: /无法重播的历史/ }));
    const detail = screen.getByRole("heading", { name: "无法重播的历史" }).closest(".history-detail");
    expect(detail).not.toBeNull();
    await userEvent.click(within(detail as HTMLElement).getByRole("button", { name: "重新播放" }));

    expect(await within(detail as HTMLElement).findByRole("alert")).toHaveTextContent("重播失败");
  });

  it("keeps the add-to-Favorites feedback attached to its Reading History Record", async () => {
    const first = createHistoryRecord({ id: "history-first", preview: "第一条历史" });
    const second = createHistoryRecord({ id: "history-second", preview: "第二条历史" });
    const bridge = renderReaderWindow({ bootstrapRoute: "history", history: [first, second] });
    vi.spyOn(bridge, "createFavoriteFromHistoryRecord").mockResolvedValue(createFavoriteRecord());

    await userEvent.click(await screen.findByRole("button", { name: /第一条历史/ }));
    await userEvent.click(screen.getByRole("button", { name: "添加收藏" }));
    expect(await screen.findByRole("button", { name: "已添加" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /第二条历史/ }));
    await userEvent.click(screen.getByRole("button", { name: /第一条历史/ }));
    expect(screen.getByRole("button", { name: "已添加" })).toBeInTheDocument();
  });

  it("does not move focus into a new route when a Reading History deletion finishes late", async () => {
    let finishDeletion!: (undoToken: string | undefined) => void;
    const deletion = new Promise<string | undefined>((resolve) => {
      finishDeletion = resolve;
    });
    const bridge = renderReaderWindow({
      bootstrapRoute: "history",
      history: [createHistoryRecord({ id: "history-late", preview: "延迟删除" })]
    });
    vi.spyOn(bridge, "deleteReadingHistoryRecord").mockReturnValue(deletion);

    await userEvent.click(await screen.findByRole("button", { name: /延迟删除/ }));
    fireEvent.click(screen.getByRole("button", { name: "删除记录" }));
    await userEvent.click(screen.getByRole("button", { name: "收藏" }));
    const favoritesEmptyState = (await screen.findByText("暂无收藏")).closest("[tabindex]");
    expect(favoritesEmptyState).not.toBeNull();

    await act(async () => finishDeletion("late-undo-token"));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(favoritesEmptyState).not.toHaveFocus();
  });

  it("deletes and restores a Reading History Record through the global undo notice", async () => {
    const record = createHistoryRecord({ id: "history-undo", preview: "可撤销历史" });
    const bridge = renderReaderWindow({
      bootstrapRoute: "history",
      history: [record],
      settings: createVerifiedSettings()
    });
    const deleteRecord = vi.spyOn(bridge, "deleteReadingHistoryRecord");
    const undoDeletion = vi.spyOn(bridge, "undoReadingHistoryDeletion");

    await userEvent.click(await screen.findByRole("button", { name: /可撤销历史/ }));
    await userEvent.click(screen.getByRole("button", { name: "删除记录" }));

    expect(await screen.findByText("已删除 1 条历史记录")).toBeInTheDocument();
    expect(deleteRecord).toHaveBeenCalledWith(record.id);
    const historyEmptyState = screen.getByText("暂无历史记录").closest("[tabindex]");
    expect(historyEmptyState).not.toBeNull();
    expect(historyEmptyState).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "撤销" }));

    await waitFor(() => expect(undoDeletion).toHaveBeenCalledWith(`history-undo-${record.id}`));
    expect(await screen.findByRole("heading", { name: "可撤销历史" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /可撤销历史/ })).toHaveFocus());
  });

  it("uses the same undo pattern when removing a Favorite", async () => {
    const favorite = createFavoriteRecord({ id: "favorite-undo", preview: "可撤销收藏" });
    const bridge = renderReaderWindow({
      bootstrapRoute: "favorites",
      favorites: [favorite],
      settings: createVerifiedSettings()
    });
    const deleteFavorite = vi.spyOn(bridge, "deleteFavoriteRecord");
    const undoDeletion = vi.spyOn(bridge, "undoFavoriteDeletion");

    await userEvent.click(await screen.findByRole("button", { name: /可撤销收藏/ }));
    expect(screen.queryByRole("button", { name: "清空收藏" })).not.toBeInTheDocument();
    expect(screen.queryByText("收藏数量")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "移除收藏" }));

    expect(await screen.findByText("已移除 1 条收藏")).toBeInTheDocument();
    expect(deleteFavorite).toHaveBeenCalledWith(favorite.id);
    const favoritesEmptyState = screen.getByText("暂无收藏").closest("[tabindex]");
    expect(favoritesEmptyState).not.toBeNull();
    expect(favoritesEmptyState).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "撤销" }));

    await waitFor(() => expect(undoDeletion).toHaveBeenCalledWith(`favorite-undo-${favorite.id}`));
    expect(await screen.findByRole("heading", { name: "可撤销收藏" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /可撤销收藏/ })).toHaveFocus());
  });

  it("keeps the latest undo action available while navigating between routes", async () => {
    const record = createHistoryRecord({ id: "history-route", preview: "跨页面撤销" });
    renderReaderWindow({
      bootstrapRoute: "history",
      history: [record],
      settings: createVerifiedSettings()
    });

    await userEvent.click(await screen.findByRole("button", { name: /跨页面撤销/ }));
    await userEvent.click(screen.getByRole("button", { name: "删除记录" }));
    await userEvent.click(await screen.findByRole("button", { name: "收藏" }));

    expect(screen.getByText("已删除 1 条历史记录")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "撤销" }));
    await userEvent.click(screen.getByRole("button", { name: "历史记录" }));

    expect(await screen.findByRole("button", { name: /跨页面撤销/ })).toBeInTheDocument();
  });

  it("pauses the undo timeout while its action has keyboard focus", async () => {
    vi.useFakeTimers();
    const record = createHistoryRecord({ id: "history-timeout", preview: "暂停撤销计时" });
    renderReaderWindow({
      bootstrapRoute: "history",
      history: [record],
      settings: createVerifiedSettings()
    });
    await act(async () => Promise.resolve());

    fireEvent.click(screen.getByRole("button", { name: /暂停撤销计时/ }));
    fireEvent.click(screen.getByRole("button", { name: "删除记录" }));
    await act(async () => Promise.resolve());
    const undoButton = screen.getByRole("button", { name: "撤销" });
    await act(async () => Promise.resolve());

    act(() => undoButton.focus());
    act(() => vi.advanceTimersByTime(20_000));
    expect(undoButton).toBeInTheDocument();

    act(() => undoButton.blur());
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.queryByRole("button", { name: "撤销" })).not.toBeInTheDocument();
  });

  it("lays Settings out as one ordered set of named sections", async () => {
    renderReaderWindow({ bootstrapRoute: "settings", settings: createVerifiedSettings() });

    const panel = await screen.findByRole("region", { name: "设置" });
    await waitFor(() => expect(panel).toHaveAttribute("aria-busy", "false"));
    const groups = ["账户与连接", "快捷键", "朗读", "通用", "历史记录"];
    expect(within(panel).getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(groups);
    for (const group of groups) {
      expect(within(panel).getByRole("region", { name: group })).toBeInTheDocument();
    }
    expect(screen.getByRole("slider", { name: "语速" })).toHaveAttribute("aria-valuetext", "1.0 倍");
    expect(screen.queryByRole("button", { name: "标记首次配置完成" })).not.toBeInTheDocument();
  });

  it("updates Speech Rate and Model through their semantic bridge commands", async () => {
    const bridge = renderReaderWindow({
      bootstrapRoute: "settings",
      settings: createVerifiedSettings({ model: "existing-custom-model" })
    });
    const setSpeechRate = vi.spyOn(bridge, "setSpeechRate");
    const setModel = vi.spyOn(bridge, "setModel");

    const speechRate = await screen.findByRole("slider", { name: "语速" });
    fireEvent.change(speechRate, { target: { value: "1.6" } });
    await waitFor(() => expect(setSpeechRate).toHaveBeenCalledWith(1.6));

    const customModel = screen.getByLabelText("自定义 Model ID");
    await userEvent.clear(customModel);
    await userEvent.type(customModel, " custom-model-v2 ");
    await userEvent.click(screen.getByRole("button", { name: "保存 Model" }));
    await waitFor(() => expect(setModel).toHaveBeenCalledWith("custom-model-v2"));

    await userEvent.selectOptions(screen.getByLabelText("Model"), "speech-2.8-hd");
    await waitFor(() => expect(setModel).toHaveBeenCalledWith("speech-2.8-hd"));

    await userEvent.selectOptions(screen.getByLabelText("Model"), "custom");
    expect(screen.getByLabelText("自定义 Model ID")).toHaveValue("custom-model-v2");
  });

  it("keeps the Settings layout stable while settings are loading", async () => {
    const settings = createVerifiedSettings();
    let resolveSettings!: (value: AppSettings) => void;
    const settingsPromise = new Promise<AppSettings>((resolve) => {
      resolveSettings = resolve;
    });
    renderReaderWindow({
      bootstrapRoute: "settings",
      readerPatch: { getSettings: vi.fn(() => settingsPromise) },
      settings
    });

    const panel = await screen.findByRole("region", { name: "设置" });
    expect(panel).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByLabelText("自定义 Model ID")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开启登录时启动" })).toBeDisabled();

    await act(async () => resolveSettings(settings));

    await waitFor(() => expect(panel).toHaveAttribute("aria-busy", "false"));
    expect(screen.getByRole("button", { name: "开启登录时启动" })).toBeEnabled();
  });

  it("keeps the route-scoped Settings workspace usable through StrictMode effect replay", async () => {
    const settings = createVerifiedSettings();
    const readerBridge = createReaderBridge({ bootstrapRoute: "settings", settings });
    render(
      <StrictMode>
        <ReaderWindowApp readerBridge={readerBridge} />
      </StrictMode>
    );

    const panel = await screen.findByRole("region", { name: "设置" });
    await waitFor(() => expect(panel).toHaveAttribute("aria-busy", "false"));
    expect(screen.getByRole("button", { name: "开启登录时启动" })).toBeEnabled();
  });

  it("isolates auxiliary Settings failures and retries only the failed resource", async () => {
    const hasMiniMaxApiKey = vi.fn().mockRejectedValue(new Error("credential unavailable"));
    const getSettings = vi.fn(async () => createVerifiedSettings());
    renderReaderWindow({
      bootstrapRoute: "settings",
      readerPatch: { getSettings, hasMiniMaxApiKey },
      settings: createVerifiedSettings()
    });

    expect(await screen.findByText("API Key 状态读取失败")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开启登录时启动" })).toBeEnabled();
    const settingsReadCount = getSettings.mock.calls.length;
    const credentialReadCount = hasMiniMaxApiKey.mock.calls.length;

    hasMiniMaxApiKey.mockResolvedValue(true);
    await userEvent.click(screen.getByRole("button", { name: "重试 API Key 状态" }));

    await waitFor(() => expect(screen.getByText("API Key 状态：已验证")).toBeInTheDocument());
    expect(hasMiniMaxApiKey).toHaveBeenCalledTimes(credentialReadCount + 1);
    expect(getSettings).toHaveBeenCalledTimes(settingsReadCount);
  });

  it("retries core Settings independently and creates a fresh workspace on re-entry", async () => {
    const settings = createVerifiedSettings();
    const getSettings = vi.fn().mockRejectedValue(new Error("settings unavailable"));
    renderReaderWindow({
      bootstrapRoute: "settings",
      history: [createHistoryRecord({ id: "blocked-write" })],
      readerPatch: { getSettings, getErrorLogCount: async () => 2 },
      settings
    });

    expect(await screen.findByText("无法读取设置")).toBeInTheDocument();
    expect(screen.getByText("API Key 状态：已保存，验证状态不可用")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开启登录时启动" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "清空历史记录" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "清空" })).toBeDisabled();

    getSettings.mockResolvedValue(settings);
    await userEvent.click(screen.getByRole("button", { name: "重试设置" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "开启登录时启动" })).toBeEnabled());

    const apiKey = screen.getByLabelText("MiniMax API Key");
    await userEvent.type(apiKey, "sensitive-draft");
    expect(apiKey).toHaveValue("sensitive-draft");
    const settingsReadCount = getSettings.mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: "主页" }));
    await screen.findByRole("heading", { name: "朗读当前选区" });
    await userEvent.click(screen.getByRole("button", { name: "设置" }));

    expect(await screen.findByLabelText("MiniMax API Key")).toHaveValue("");
    await waitFor(() => expect(getSettings.mock.calls.length).toBeGreaterThan(settingsReadCount));
  });

  it("requires an inline confirmation before clearing all Reading History", async () => {
    const history = [createHistoryRecord({ id: "clear-1" }), createHistoryRecord({ id: "clear-2" })];
    const bridge = renderReaderWindow({ bootstrapRoute: "settings", history, settings: createVerifiedSettings() });
    const clearHistory = vi.spyOn(bridge, "clearReadingHistory");

    await userEvent.click(await screen.findByRole("button", { name: "清空历史记录" }));

    const confirmation = screen.getByRole("group", { name: "确认清空历史记录" });
    expect(confirmation).toHaveTextContent("清空全部 2 条历史记录？收藏不会受影响。");
    expect(clearHistory).not.toHaveBeenCalled();
    await userEvent.click(within(confirmation).getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("group", { name: "确认清空历史记录" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "清空历史记录" }));
    await userEvent.click(screen.getByRole("button", { name: "清空 2 条" }));

    await waitFor(() => expect(clearHistory).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("已清空 2 条历史记录，收藏仍然保留。")).toBeInTheDocument();
  });

  it("previews destructive retention changes and applies the confirmed count atomically", async () => {
    const settings = createVerifiedSettings({ historyRetention: "1m" });
    const bridge = renderReaderWindow({
      bootstrapRoute: "settings",
      history: [createHistoryRecord({ id: "old" }), createHistoryRecord({ id: "new" })],
      settings
    });
    const preview = vi.spyOn(bridge, "previewReadingHistoryRetention").mockResolvedValue({
      historyRetention: "7d",
      deleteCount: 1,
      remainingCount: 1
    });
    const apply = vi.spyOn(bridge, "applyReadingHistoryRetention").mockResolvedValue({
      applied: true,
      impact: { historyRetention: "7d", deleteCount: 1, remainingCount: 1 },
      settings: { ...settings, historyRetention: "7d" }
    });

    const retentionSelect = await screen.findByLabelText("保留期限");
    await waitFor(() => expect(retentionSelect).toBeEnabled());
    await userEvent.selectOptions(retentionSelect, "7d");

    const confirmation = await screen.findByRole("group", { name: "确认保留期限变更" });
    expect(confirmation).toHaveTextContent("改为7 天后，将删除 1 条超期历史记录，保留 1 条。收藏不会受影响。");
    expect(preview).toHaveBeenCalledWith("7d");
    expect(apply).not.toHaveBeenCalled();

    await userEvent.click(within(confirmation).getByRole("button", { name: "应用并删除 1 条" }));

    await waitFor(() => expect(apply).toHaveBeenCalledWith("7d", 1));
    expect(await screen.findByText(/已删除 1 条超期历史记录/)).toBeInTheDocument();
  });

  it("applies a zero-impact retention change without a destructive confirmation", async () => {
    const settings = createVerifiedSettings({ historyRetention: "1m" });
    const bridge = renderReaderWindow({ bootstrapRoute: "settings", settings });
    vi.spyOn(bridge, "previewReadingHistoryRetention").mockResolvedValue({
      historyRetention: "3m",
      deleteCount: 0,
      remainingCount: 0
    });
    const apply = vi.spyOn(bridge, "applyReadingHistoryRetention").mockResolvedValue({
      applied: true,
      impact: { historyRetention: "3m", deleteCount: 0, remainingCount: 0 },
      settings: { ...settings, historyRetention: "3m" }
    });

    const retentionSelect = await screen.findByLabelText("保留期限");
    await waitFor(() => expect(retentionSelect).toBeEnabled());
    await userEvent.selectOptions(retentionSelect, "3m");

    await waitFor(() => expect(apply).toHaveBeenCalledWith("3m", 0));
    expect(screen.queryByRole("group", { name: "确认保留期限变更" })).not.toBeInTheDocument();
    expect(await screen.findByText(/保留期限已改为3 个月/)).toBeInTheDocument();
  });

  it("keeps the retention confirmation open when its preview becomes stale", async () => {
    const settings = createVerifiedSettings({ historyRetention: "1m" });
    const bridge = renderReaderWindow({
      bootstrapRoute: "settings",
      history: [createHistoryRecord({ id: "old" }), createHistoryRecord({ id: "older" })],
      settings
    });
    vi.spyOn(bridge, "previewReadingHistoryRetention").mockResolvedValue({
      historyRetention: "7d",
      deleteCount: 1,
      remainingCount: 1
    });
    vi.spyOn(bridge, "applyReadingHistoryRetention").mockResolvedValue({
      applied: false,
      impact: { historyRetention: "7d", deleteCount: 2, remainingCount: 0 },
      settings
    });

    const retentionSelect = await screen.findByLabelText("保留期限");
    await waitFor(() => expect(retentionSelect).toBeEnabled());
    await userEvent.selectOptions(retentionSelect, "7d");
    await userEvent.click(await screen.findByRole("button", { name: "应用并删除 1 条" }));

    const refreshedConfirmation = await screen.findByRole("group", { name: "确认保留期限变更" });
    expect(refreshedConfirmation).toHaveTextContent("将删除 2 条超期历史记录");
    expect(screen.getByText("历史记录数量已变化，请按最新数量再次确认。")).toBeInTheDocument();
  });
});

interface RenderReaderWindowOptions {
  bootstrapRoute?: "home" | "history" | "favorites" | "settings";
  favorites?: FavoriteRecord[];
  hasApiKey?: boolean;
  history?: ReadingHistoryRecord[];
  readerPatch?: Partial<ReaderWindowRoleBridge>;
  settings?: AppSettings;
}

function renderReaderWindow(options: RenderReaderWindowOptions = {}): ReaderWindowRoleBridge {
  const settings = options.settings ?? createVerifiedSettings();
  const readerBridge = createReaderBridge({
    ...options,
    settings
  });
  render(<ReaderWindowApp readerBridge={readerBridge} />);
  return readerBridge;
}

function createReaderBridge(
  options: Required<Pick<RenderReaderWindowOptions, "settings">> & RenderReaderWindowOptions
): ReaderWindowRoleBridge {
  let settings = options.settings;
  let history = [...(options.history ?? [])];
  let favorites = [...(options.favorites ?? [])];
  let routeRevision = 0;
  const deletedHistory = new Map<string, ReadingHistoryRecord>();
  const deletedFavorites = new Map<string, FavoriteRecord>();
  return {
    getBootstrapState: async () => ({
      hasCompletedOnboarding: settings.hasCompletedOnboarding,
      route: { route: options.bootstrapRoute ?? "home", revision: 0 }
    }),
    setOnboardingComplete: async (complete) => {
      settings = { ...settings, hasCompletedOnboarding: complete };
    },
    setRoute: async (route) => ({ route, revision: ++routeRevision }),
    onNavigate: () => () => undefined,
    getSettings: async () => settings,
    setSpeechRate: async (speechRate) => {
      settings = { ...settings, speechRate };
      return settings;
    },
    setModel: async (model) => {
      settings = { ...settings, model };
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
    getReadingHistoryCount: async () => history.length,
    previewReadingHistoryRetention: async (historyRetention) => ({
      historyRetention,
      deleteCount: 0,
      remainingCount: history.length
    }),
    applyReadingHistoryRetention: async (historyRetention) => {
      settings = { ...settings, historyRetention };
      return {
        applied: true,
        impact: { historyRetention, deleteCount: 0, remainingCount: history.length },
        settings
      };
    },
    listReadingHistory: async () => history,
    deleteReadingHistoryRecord: async (id) => {
      const record = history.find((candidate) => candidate.id === id);
      if (!record) return undefined;
      const token = `history-undo-${id}`;
      deletedHistory.set(token, record);
      history = history.filter((candidate) => candidate.id !== id);
      return token;
    },
    undoReadingHistoryDeletion: async (undoToken) => {
      const record = deletedHistory.get(undoToken);
      if (!record) return false;
      deletedHistory.delete(undoToken);
      history = [...history, record].sort((left, right) => right.createdAt - left.createdAt);
      return true;
    },
    clearReadingHistory: async () => {
      const count = history.length;
      history = [];
      return count;
    },
    createFavoriteFromHistoryRecord: async () => undefined,
    listFavorites: async () => favorites,
    deleteFavoriteRecord: async (id) => {
      const record = favorites.find((candidate) => candidate.id === id);
      if (!record) return undefined;
      const token = `favorite-undo-${id}`;
      deletedFavorites.set(token, record);
      favorites = favorites.filter((candidate) => candidate.id !== id);
      return token;
    },
    undoFavoriteDeletion: async (undoToken) => {
      const record = deletedFavorites.get(undoToken);
      if (!record) return false;
      deletedFavorites.delete(undoToken);
      favorites = [...favorites, record].sort((left, right) => right.favoritedAt - left.favoritedAt);
      return true;
    },
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

function createFavoriteRecord(patch: Partial<FavoriteRecord> = {}): FavoriteRecord {
  return {
    id: "favorite",
    favoritedAt: 1_700_000_100_000,
    sourceCreatedAt: 1_700_000_000_000,
    text: "收藏全文",
    preview: "收藏",
    durationEstimateSeconds: 42,
    languageSummary: "中文",
    source: "selected_text",
    ...patch
  };
}
