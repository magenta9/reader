import { afterEach, describe, expect, it, vi } from "vitest";

import type { FavoriteRecord, ReadingHistoryRecord } from "../../src/renderer/bridge.js";
import {
  RecordWorkspace,
  type RecordWorkspaceCapabilities
} from "../../src/renderer/record-workspace.js";

describe("RecordWorkspace", () => {
  afterEach(() => vi.useRealTimers());

  it.each([
    {
      kind: "history" as const,
      expectedId: "history-newest"
    },
    {
      kind: "favorites" as const,
      expectedId: "favorite-newest"
    }
  ])("selects the newest Record when a $kind visit starts", async ({ kind, expectedId }) => {
    const capabilities = createCapabilities();
    const workspace = new RecordWorkspace(kind, capabilities, vi.fn());

    workspace.start();
    await settlePromises();

    expect(workspace.getSnapshot()).toMatchObject({
      kind,
      listState: "ready",
      selectedId: expectedId
    });
  });

  it("keeps the current selection and stops its Replay before selecting another Record", async () => {
    const capabilities = createCapabilities();
    const workspace = new RecordWorkspace("history", capabilities, vi.fn());
    workspace.start();
    await settlePromises();

    await workspace.selectRecord("history-newest");
    expect(workspace.getSnapshot().selectedId).toBe("history-newest");
    expect(capabilities.stopPlayback).not.toHaveBeenCalled();

    await workspace.replaySelected();
    expect(workspace.getSnapshot().replaySessionId).toBe(21);

    await workspace.selectRecord("history-older");
    expect(capabilities.stopPlayback).toHaveBeenCalledOnce();
    expect(workspace.getSnapshot()).toMatchObject({
      selectedId: "history-older",
      replaySessionId: undefined
    });
  });

  it("selects the adjacent Record after deletion and restores the original selection through undo", async () => {
    const capabilities = createCapabilities();
    let history = [
      createHistoryRecord("history-newest", 3_000),
      createHistoryRecord("history-older", 1_000)
    ];
    capabilities.listReadingHistory.mockImplementation(async () => history);
    capabilities.deleteReadingHistoryRecord.mockImplementation(async (id) => {
      history = history.filter((record) => record.id !== id);
      return `history-undo-${id}`;
    });
    capabilities.undoReadingHistoryDeletion.mockImplementation(async () => {
      history = [...history, createHistoryRecord("history-newest", 3_000)];
      return true;
    });
    const offerUndo = vi.fn();
    const workspace = new RecordWorkspace("history", capabilities, offerUndo);
    workspace.start();
    await settlePromises();

    await workspace.deleteSelected();
    await settlePromises();

    expect(workspace.getSnapshot()).toMatchObject({
      selectedId: "history-older",
      focusRequest: { target: { kind: "record", id: "history-older" } }
    });
    expect(offerUndo).toHaveBeenCalledOnce();

    const undo = offerUndo.mock.calls[0]?.[0];
    expect(await undo.undo()).toBe(true);
    await undo.onRestored();
    expect(workspace.getSnapshot()).toMatchObject({
      selectedId: "history-newest",
      focusRequest: { target: { kind: "record", id: "history-newest" } }
    });
  });

  it("recovers a failed list through retry without accepting a previous visit result", async () => {
    const staleList = deferred<ReadingHistoryRecord[]>();
    const capabilities = createCapabilities();
    capabilities.listReadingHistory
      .mockReturnValueOnce(staleList.promise)
      .mockRejectedValueOnce(new Error("database busy"))
      .mockResolvedValueOnce([createHistoryRecord("history-recovered", 5_000)]);
    const workspace = new RecordWorkspace("history", capabilities, vi.fn());

    workspace.start();
    workspace.dispose();
    workspace.start();
    await settlePromises();
    expect(workspace.getSnapshot().listState).toBe("error");

    workspace.retryList();
    await settlePromises();
    expect(workspace.getSnapshot()).toMatchObject({
      listState: "ready",
      selectedId: "history-recovered"
    });

    staleList.resolve([createHistoryRecord("history-stale", 9_000)]);
    await settlePromises();
    expect(workspace.getSnapshot().selectedId).toBe("history-recovered");
  });

  it("keeps copy and add-to-Favorites feedback attached to the selected Record", async () => {
    vi.useFakeTimers();
    const capabilities = createCapabilities();
    capabilities.createFavoriteFromHistoryRecord.mockResolvedValue(
      createFavoriteRecord("favorite-created", 6_000)
    );
    const workspace = new RecordWorkspace("history", capabilities, vi.fn());
    workspace.start();
    await settleMicrotasks();

    await workspace.copySelected();
    expect(capabilities.copyText).toHaveBeenCalledWith("history-newest text");
    expect(workspace.getSnapshot().copiedRecordId).toBe("history-newest");

    await workspace.runExtraAction();
    expect(capabilities.createFavoriteFromHistoryRecord).toHaveBeenCalledWith("history-newest");
    expect(workspace.getSnapshot().extraActionFeedbackRecordId).toBe("history-newest");

    vi.advanceTimersByTime(1_300);
    expect(workspace.getSnapshot()).toMatchObject({
      copiedRecordId: undefined,
      extraActionFeedbackRecordId: undefined
    });
  });

  it("loads Reading History retention independently from the Record list", async () => {
    const capabilities = createCapabilities();
    capabilities.getSettings.mockResolvedValue({ historyRetention: "3m" });
    const workspace = new RecordWorkspace("history", capabilities, vi.fn());

    workspace.start();
    await settlePromises();

    expect(workspace.getSnapshot().historyRetention).toBe("3m");
  });

  it("clears only the active detail Replay when its terminal event arrives", async () => {
    let finishListener: Parameters<RecordWorkspaceCapabilities["onPlaybackFinish"]>[0] | undefined;
    const capabilities = createCapabilities();
    capabilities.onPlaybackFinish.mockImplementation((listener) => {
      finishListener = listener;
      return () => undefined;
    });
    const workspace = new RecordWorkspace("history", capabilities, vi.fn());
    workspace.start();
    await settlePromises();
    await workspace.replaySelected();

    finishListener?.({ sessionId: 999 });
    expect(workspace.getSnapshot().replaySessionId).toBe(21);

    finishListener?.({ sessionId: 21 });
    expect(workspace.getSnapshot().replaySessionId).toBeUndefined();
  });

  it("keeps Replay active until main publishes its matching Stop terminal event", async () => {
    let stopListener: Parameters<RecordWorkspaceCapabilities["onPlaybackStop"]>[0] | undefined;
    const capabilities = createCapabilities();
    capabilities.onPlaybackStop.mockImplementation((listener) => {
      stopListener = listener;
      return () => undefined;
    });
    capabilities.stopPlayback.mockResolvedValue(undefined);
    const workspace = new RecordWorkspace("history", capabilities, vi.fn());
    workspace.start();
    await settlePromises();
    await workspace.replaySelected();

    const stopping = workspace.stopReplay();
    await settleMicrotasks();
    expect(workspace.getSnapshot()).toMatchObject({
      replaySessionId: 21,
      pending: { stop: true }
    });

    stopListener?.({ sessionId: 21 });
    expect(await stopping).toBe(true);
    expect(workspace.getSnapshot()).toMatchObject({
      replaySessionId: undefined,
      pending: { stop: false }
    });
  });

  it("keeps the current selection and Replay feedback when Stop fails", async () => {
    const capabilities = createCapabilities();
    capabilities.stopPlayback.mockRejectedValue(new Error("stop unavailable"));
    const workspace = new RecordWorkspace("history", capabilities, vi.fn());
    workspace.start();
    await settlePromises();
    await workspace.replaySelected();

    await workspace.selectRecord("history-older");

    expect(workspace.getSnapshot()).toMatchObject({
      selectedId: "history-newest",
      replaySessionId: 21,
      actionError: "停止重播失败，请稍后重试。",
      pending: { stop: false }
    });
  });

  it("keeps Record commands single-flight within one visit", async () => {
    const copying = deferred<void>();
    const capabilities = createCapabilities();
    capabilities.copyText.mockReturnValue(copying.promise);
    const workspace = new RecordWorkspace("history", capabilities, vi.fn());
    workspace.start();
    await settlePromises();

    void workspace.copySelected();
    void workspace.copySelected();

    expect(capabilities.copyText).toHaveBeenCalledOnce();
    expect(workspace.getSnapshot().pending.copy).toBe(true);

    copying.resolve(undefined);
    await settlePromises();
    expect(workspace.getSnapshot().pending.copy).toBe(false);
  });

  it("projects sorted Favorite Records into the visible time groups", async () => {
    vi.useFakeTimers();
    const now = new Date(2026, 5, 17, 12).getTime();
    vi.setSystemTime(now);
    const capabilities = createCapabilities();
    capabilities.listFavorites.mockResolvedValue([
      createFavoriteRecord("older", new Date(2026, 5, 1, 9).getTime()),
      createFavoriteRecord("today-early", new Date(2026, 5, 17, 8).getTime()),
      createFavoriteRecord("week", new Date(2026, 5, 15, 10).getTime()),
      createFavoriteRecord("yesterday", new Date(2026, 5, 16, 11).getTime()),
      createFavoriteRecord("today-late", new Date(2026, 5, 17, 10).getTime())
    ]);
    const workspace = new RecordWorkspace("favorites", capabilities, vi.fn());

    workspace.start();
    await settleMicrotasks();

    expect(
      workspace.getSnapshot().groups.map((group) => [
        group.label,
        group.records.map((item) => item.record.id)
      ])
    ).toEqual([
      ["今天", ["today-late", "today-early"]],
      ["昨天", ["yesterday"]],
      ["本周", ["week"]],
      ["更早", ["older"]]
    ]);
  });

  it("falls back to the newer neighbor when deleting the oldest Record", async () => {
    const capabilities = createCapabilities();
    let history = [
      createHistoryRecord("history-newest", 3_000),
      createHistoryRecord("history-oldest", 1_000)
    ];
    capabilities.listReadingHistory.mockImplementation(async () => history);
    capabilities.deleteReadingHistoryRecord.mockImplementation(async (id) => {
      history = history.filter((record) => record.id !== id);
      return `history-undo-${id}`;
    });
    const workspace = new RecordWorkspace("history", capabilities, vi.fn());
    workspace.start();
    await settlePromises();
    await workspace.selectRecord("history-oldest");

    await workspace.deleteSelected();
    await settlePromises();

    expect(workspace.getSnapshot()).toMatchObject({
      selectedId: "history-newest",
      focusRequest: { target: { kind: "record", id: "history-newest" } }
    });
  });

  it("does not let a previous visit command mutate or unlock a restarted visit", async () => {
    const staleCopy = deferred<void>();
    const freshCopy = deferred<void>();
    const capabilities = createCapabilities();
    capabilities.copyText
      .mockReturnValueOnce(staleCopy.promise)
      .mockReturnValueOnce(freshCopy.promise);
    const workspace = new RecordWorkspace("history", capabilities, vi.fn());
    workspace.start();
    await settlePromises();
    void workspace.copySelected();

    workspace.dispose();
    workspace.start();
    await settlePromises();
    void workspace.copySelected();
    staleCopy.resolve(undefined);
    await settlePromises();

    expect(workspace.getSnapshot().pending.copy).toBe(true);
    expect(workspace.getSnapshot().copiedRecordId).toBeUndefined();

    freshCopy.resolve(undefined);
    await settlePromises();
    expect(workspace.getSnapshot()).toMatchObject({
      pending: { copy: false },
      copiedRecordId: "history-newest"
    });
  });

  it("waits for a starting Replay and stops it before changing the selected Record", async () => {
    let stopListener: Parameters<RecordWorkspaceCapabilities["onPlaybackStop"]>[0] | undefined;
    const replayStart = deferred<{ started: true; sessionId: number }>();
    const capabilities = createCapabilities();
    capabilities.playHistoryRecord.mockReturnValue(replayStart.promise);
    capabilities.onPlaybackStop.mockImplementation((listener) => {
      stopListener = listener;
      return () => undefined;
    });
    capabilities.stopPlayback.mockImplementation(async () => {
      stopListener?.({ sessionId: 71 });
    });
    const workspace = new RecordWorkspace("history", capabilities, vi.fn());
    workspace.start();
    await settlePromises();

    void workspace.replaySelected();
    const selection = workspace.selectRecord("history-older");
    expect(workspace.getSnapshot().selectedId).toBe("history-newest");

    replayStart.resolve({ started: true, sessionId: 71 });
    await selection;

    expect(capabilities.stopPlayback).toHaveBeenCalledOnce();
    expect(workspace.getSnapshot()).toMatchObject({
      selectedId: "history-older",
      replaySessionId: undefined,
      pending: { replay: false, stop: false }
    });
  });

  it("does not let selection overtake an in-flight deletion", async () => {
    const deletion = deferred<string | undefined>();
    const capabilities = createCapabilities();
    let history = [
      createHistoryRecord("history-newest", 3_000),
      createHistoryRecord("history-middle", 2_000),
      createHistoryRecord("history-oldest", 1_000)
    ];
    capabilities.listReadingHistory.mockImplementation(async () => history);
    capabilities.deleteReadingHistoryRecord.mockReturnValue(deletion.promise);
    const workspace = new RecordWorkspace("history", capabilities, vi.fn());
    workspace.start();
    await settlePromises();

    const deleting = workspace.deleteSelected();
    await workspace.selectRecord("history-oldest");
    expect(workspace.getSnapshot().selectedId).toBe("history-newest");
    history = history.filter((record) => record.id !== "history-newest");
    deletion.resolve("history-undo-history-newest");
    await deleting;
    await settlePromises();

    expect(workspace.getSnapshot().selectedId).toBe("history-middle");
  });

  it("offers undo before a deletion refresh settles", async () => {
    const refresh = deferred<ReadingHistoryRecord[]>();
    const capabilities = createCapabilities();
    capabilities.listReadingHistory
      .mockResolvedValueOnce([createHistoryRecord("history-newest", 3_000)])
      .mockReturnValueOnce(refresh.promise);
    capabilities.deleteReadingHistoryRecord.mockResolvedValue("history-undo-history-newest");
    capabilities.undoReadingHistoryDeletion.mockResolvedValue(true);
    const offerUndo = vi.fn();
    const workspace = new RecordWorkspace("history", capabilities, offerUndo);
    workspace.start();
    await settlePromises();

    const deleting = workspace.deleteSelected();
    await settleMicrotasks();
    expect(offerUndo).toHaveBeenCalledOnce();
    await deleting;
    expect(workspace.getSnapshot().pending.delete).toBe(false);

    const undo = offerUndo.mock.calls[0]?.[0];
    expect(await undo.undo()).toBe(true);
    await undo.onRestored();
    expect(workspace.getSnapshot()).toMatchObject({
      selectedId: "history-newest",
      pending: { delete: false }
    });

    refresh.resolve([]);
    await settlePromises();
  });

  it("preserves deletion and undo selection targets across list retries", async () => {
    const capabilities = createCapabilities();
    let history = [
      createHistoryRecord("history-newest", 3_000),
      createHistoryRecord("history-middle", 2_000),
      createHistoryRecord("history-oldest", 1_000)
    ];
    capabilities.listReadingHistory
      .mockResolvedValueOnce(history)
      .mockRejectedValueOnce(new Error("refresh failed"))
      .mockImplementation(async () => history);
    capabilities.deleteReadingHistoryRecord.mockImplementation(async (id) => {
      history = history.filter((record) => record.id !== id);
      return `history-undo-${id}`;
    });
    capabilities.undoReadingHistoryDeletion.mockImplementation(async () => {
      history = [...history, createHistoryRecord("history-newest", 3_000)];
      return true;
    });
    const offerUndo = vi.fn();
    const workspace = new RecordWorkspace("history", capabilities, offerUndo);
    workspace.start();
    await settlePromises();

    await workspace.deleteSelected();
    await settlePromises();
    expect(workspace.getSnapshot().listState).toBe("error");
    workspace.retryList();
    await settlePromises();
    expect(workspace.getSnapshot().selectedId).toBe("history-middle");

    capabilities.listReadingHistory.mockRejectedValueOnce(new Error("undo refresh failed"));
    const undo = offerUndo.mock.calls[0]?.[0];
    expect(await undo.undo()).toBe(true);
    await undo.onRestored();
    expect(workspace.getSnapshot().listState).toBe("error");
    workspace.retryList();
    await settlePromises();
    expect(workspace.getSnapshot().selectedId).toBe("history-newest");
  });

  it("does not start Replay while delete or Stop owns the detail command lane", async () => {
    const deletion = deferred<string | undefined>();
    let stopListener: Parameters<RecordWorkspaceCapabilities["onPlaybackStop"]>[0] | undefined;
    const capabilities = createCapabilities();
    capabilities.deleteReadingHistoryRecord.mockReturnValue(deletion.promise);
    capabilities.onPlaybackStop.mockImplementation((listener) => {
      stopListener = listener;
      return () => undefined;
    });
    capabilities.stopPlayback.mockResolvedValue(undefined);
    const workspace = new RecordWorkspace("history", capabilities, vi.fn());
    workspace.start();
    await settlePromises();

    const deleting = workspace.deleteSelected();
    await workspace.replaySelected();
    expect(capabilities.playHistoryRecord).not.toHaveBeenCalled();
    deletion.resolve("history-undo-history-newest");
    await deleting;
    await settlePromises();

    await workspace.replaySelected();
    expect(capabilities.playHistoryRecord).toHaveBeenCalledOnce();

    const stopping = workspace.stopReplay();
    await workspace.replaySelected();
    expect(capabilities.playHistoryRecord).toHaveBeenCalledOnce();
    stopListener?.({ sessionId: 21 });
    await stopping;
  });
});

function createCapabilities() {
  const stopListeners = new Set<Parameters<RecordWorkspaceCapabilities["onPlaybackStop"]>[0]>();
  const history = [
    createHistoryRecord("history-older", 1_000),
    createHistoryRecord("history-newest", 3_000)
  ];
  const favorites = [
    createFavoriteRecord("favorite-older", 2_000),
    createFavoriteRecord("favorite-newest", 4_000)
  ];
  return {
    getSettings: vi.fn<RecordWorkspaceCapabilities["getSettings"]>(async () => ({ historyRetention: "1m" })),
    listReadingHistory: vi.fn(async () => history),
    listFavorites: vi.fn(async () => favorites),
    deleteReadingHistoryRecord: vi.fn<RecordWorkspaceCapabilities["deleteReadingHistoryRecord"]>(async () => undefined),
    undoReadingHistoryDeletion: vi.fn<RecordWorkspaceCapabilities["undoReadingHistoryDeletion"]>(async () => false),
    deleteFavoriteRecord: vi.fn<RecordWorkspaceCapabilities["deleteFavoriteRecord"]>(async () => undefined),
    undoFavoriteDeletion: vi.fn<RecordWorkspaceCapabilities["undoFavoriteDeletion"]>(async () => false),
    createFavoriteFromHistoryRecord: vi.fn<RecordWorkspaceCapabilities["createFavoriteFromHistoryRecord"]>(async () => undefined),
    playHistoryRecord: vi.fn(async () => ({ started: true, sessionId: 21 })),
    playFavoriteRecord: vi.fn(async () => ({ started: true, sessionId: 22 })),
    stopPlayback: vi.fn(async () => {
      for (const listener of stopListeners) {
        listener({ sessionId: 21 });
        listener({ sessionId: 22 });
      }
    }),
    copyText: vi.fn<RecordWorkspaceCapabilities["copyText"]>(async () => undefined),
    onPlaybackFinish: vi.fn<RecordWorkspaceCapabilities["onPlaybackFinish"]>(() => () => undefined),
    onPlaybackFail: vi.fn<RecordWorkspaceCapabilities["onPlaybackFail"]>(() => () => undefined),
    onPlaybackStop: vi.fn<RecordWorkspaceCapabilities["onPlaybackStop"]>((listener) => {
      stopListeners.add(listener);
      return () => stopListeners.delete(listener);
    })
  } satisfies RecordWorkspaceCapabilities;
}

function createHistoryRecord(id: string, createdAt: number): ReadingHistoryRecord {
  return {
    id,
    createdAt,
    text: `${id} text`,
    preview: id,
    durationEstimateSeconds: 1,
    languageSummary: "英文",
    source: "clipboard"
  };
}

function createFavoriteRecord(id: string, favoritedAt: number): FavoriteRecord {
  return {
    id,
    favoritedAt,
    sourceCreatedAt: favoritedAt - 500,
    text: `${id} text`,
    preview: id,
    durationEstimateSeconds: 1,
    languageSummary: "英文",
    source: "clipboard"
  };
}

async function settlePromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function settleMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}
