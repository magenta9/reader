import type {
  AppSettings,
  FavoriteRecord,
  PlaybackStartResult,
  ReaderWindowRoleBridge,
  ReadingHistoryRecord
} from "./bridge.js";
import type { HistoryRetention } from "../shared/app-contracts.js";

export type RecordWorkspaceKind = "history" | "favorites";

export type RecordWorkspaceCapabilities = Pick<
  ReaderWindowRoleBridge,
  | "listReadingHistory"
  | "listFavorites"
  | "deleteReadingHistoryRecord"
  | "undoReadingHistoryDeletion"
  | "deleteFavoriteRecord"
  | "undoFavoriteDeletion"
  | "createFavoriteFromHistoryRecord"
  | "playHistoryRecord"
  | "playFavoriteRecord"
  | "stopPlayback"
  | "copyText"
  | "onPlaybackFinish"
  | "onPlaybackFail"
  | "onPlaybackStop"
> & {
  getSettings(): Promise<Pick<AppSettings, "historyRetention">>;
};

export type RecordWorkspaceItem =
  | Readonly<{ kind: "history"; record: Readonly<ReadingHistoryRecord>; time: number }>
  | Readonly<{ kind: "favorites"; record: Readonly<FavoriteRecord>; time: number }>;

export type RecordGroupLabel = "今天" | "昨天" | "本周" | "更早";

export interface RecordWorkspaceGroup {
  readonly label: RecordGroupLabel;
  readonly records: readonly RecordWorkspaceItem[];
}

export interface RecordWorkspaceSnapshot {
  readonly kind: RecordWorkspaceKind;
  readonly disposed: boolean;
  readonly listState: "error" | "loading" | "ready";
  readonly records: readonly RecordWorkspaceItem[];
  readonly groups: readonly RecordWorkspaceGroup[];
  readonly selectedId?: string;
  readonly replaySessionId?: number;
  readonly actionError: string;
  readonly copiedRecordId?: string;
  readonly extraActionFeedbackRecordId?: string;
  readonly historyRetention: HistoryRetention | "loading" | "unavailable";
  readonly pending: Readonly<{
    copy: boolean;
    delete: boolean;
    extraAction: boolean;
    replay: boolean;
    stop: boolean;
  }>;
  readonly focusRequest?: Readonly<{
    sequence: number;
    target: Readonly<{ kind: "record"; id: string }> | Readonly<{ kind: "empty" }>;
  }>;
}

export interface RecordUndoRequest {
  readonly message: string;
  readonly undo: () => Promise<boolean>;
  readonly onRestored: () => Promise<void>;
}

type Listener = () => void;
type OfferUndo = (request: RecordUndoRequest) => void;
type PendingCommand = keyof RecordWorkspaceSnapshot["pending"];
type RefreshPreference = Readonly<{ preferredId: string | undefined; requestFocus: boolean }>;
type StopWaiter = Readonly<{ sessionId: number; resolve: (stopped: boolean) => void }>;

const EMPTY_PENDING = Object.freeze({
  copy: false,
  delete: false,
  extraAction: false,
  replay: false,
  stop: false
});

interface RecordWorkspaceAdapter {
  readonly kind: RecordWorkspaceKind;
  readonly undoMessage: string;
  listRecords(capabilities: RecordWorkspaceCapabilities): Promise<readonly RecordWorkspaceItem[]>;
  deleteRecord(
    capabilities: RecordWorkspaceCapabilities,
    id: string
  ): Promise<string | undefined>;
  undoDeletion(
    capabilities: RecordWorkspaceCapabilities,
    undoToken: string
  ): Promise<boolean>;
  replayRecord(
    capabilities: RecordWorkspaceCapabilities,
    id: string
  ): Promise<PlaybackStartResult>;
  runExtraAction?(
    capabilities: RecordWorkspaceCapabilities,
    id: string
  ): Promise<boolean>;
}

const HISTORY_ADAPTER = Object.freeze({
  kind: "history",
  undoMessage: "已删除 1 条历史记录",
  listRecords: async (capabilities) =>
    (await capabilities.listReadingHistory()).map((record) =>
      Object.freeze({ kind: "history" as const, record: freezeHistoryRecord(record), time: record.createdAt })
    ),
  deleteRecord: (capabilities, id) => capabilities.deleteReadingHistoryRecord(id),
  undoDeletion: (capabilities, undoToken) =>
    capabilities.undoReadingHistoryDeletion(undoToken),
  replayRecord: (capabilities, id) => capabilities.playHistoryRecord(id),
  runExtraAction: async (capabilities, id) =>
    Boolean(await capabilities.createFavoriteFromHistoryRecord(id))
} satisfies RecordWorkspaceAdapter);

const FAVORITES_ADAPTER = Object.freeze({
  kind: "favorites",
  undoMessage: "已移除 1 条收藏",
  listRecords: async (capabilities) =>
    (await capabilities.listFavorites()).map((record) =>
      Object.freeze({
        kind: "favorites" as const,
        record: freezeFavoriteRecord(record),
        time: record.favoritedAt
      })
    ),
  deleteRecord: (capabilities, id) => capabilities.deleteFavoriteRecord(id),
  undoDeletion: (capabilities, undoToken) => capabilities.undoFavoriteDeletion(undoToken),
  replayRecord: (capabilities, id) => capabilities.playFavoriteRecord(id)
} satisfies RecordWorkspaceAdapter);

export class RecordWorkspace {
  private snapshot: RecordWorkspaceSnapshot;
  private readonly listeners = new Set<Listener>();
  private readonly adapter: RecordWorkspaceAdapter;
  private started = false;
  private loadGeneration = 0;
  private visitGeneration = 0;
  private retentionGeneration = 0;
  private focusSequence = 0;
  private copyFeedbackTimer: ReturnType<typeof setTimeout> | undefined;
  private extraActionFeedbackTimer: ReturnType<typeof setTimeout> | undefined;
  private replayStartPromise: Promise<void> | undefined;
  private stopCommandPromise: Promise<boolean> | undefined;
  private stopWaiter: StopWaiter | undefined;
  private refreshPreference: RefreshPreference | undefined;
  private playbackUnsubscribers: Array<() => void> = [];

  constructor(
    kind: RecordWorkspaceKind,
    private readonly capabilities: RecordWorkspaceCapabilities,
    private readonly offerUndo: OfferUndo
  ) {
    this.adapter = kind === "history" ? HISTORY_ADAPTER : FAVORITES_ADAPTER;
    this.snapshot = createInitialSnapshot(kind, false);
  }

  getSnapshot = (): RecordWorkspaceSnapshot => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(): void {
    if (this.started) return;
    if (this.snapshot.disposed) {
      this.snapshot = createInitialSnapshot(this.adapter.kind, false);
    }
    this.started = true;
    this.visitGeneration += 1;
    this.subscribeToPlaybackTerminalEvents();
    void this.loadRecords();
    if (this.adapter.kind === "history") void this.loadHistoryRetention();
  }

  retryList(): void {
    if (!this.snapshot.disposed) void this.loadRecords();
  }

  async selectRecord(id: string): Promise<void> {
    if (
      this.snapshot.disposed ||
      this.snapshot.selectedId === id ||
      this.snapshot.pending.delete ||
      !this.snapshot.records.some((item) => item.record.id === id)
    ) {
      return;
    }
    if (!(await this.prepareSelectionChange())) return;
    if (
      this.snapshot.disposed ||
      this.snapshot.selectedId === id ||
      this.snapshot.pending.delete ||
      !this.snapshot.records.some((item) => item.record.id === id)
    ) {
      return;
    }
    this.refreshPreference = undefined;
    this.replaceSnapshot({ selectedId: id, actionError: "" });
  }

  replaySelected(): Promise<void> {
    const selectedId = this.snapshot.selectedId;
    if (this.replayStartPromise) return this.replayStartPromise;
    if (
      this.snapshot.disposed ||
      !selectedId ||
      this.snapshot.pending.delete ||
      this.snapshot.pending.stop
    ) {
      return Promise.resolve();
    }
    const visitGeneration = this.visitGeneration;
    this.setPending("replay", true);
    const command = this.performReplaySelected(selectedId, visitGeneration);
    this.replayStartPromise = command;
    void command.then(() => {
      if (this.replayStartPromise === command) this.replayStartPromise = undefined;
    });
    return command;
  }

  private async performReplaySelected(
    selectedId: string,
    visitGeneration: number
  ): Promise<void> {
    try {
      const result = await this.adapter.replayRecord(this.capabilities, selectedId);
      if (!this.acceptsSelected(visitGeneration, selectedId)) return;
      if (!result.started || result.sessionId === undefined) {
        this.replaceSnapshot({ actionError: replayError(this.adapter.kind) });
        return;
      }
      this.replaceSnapshot({ replaySessionId: result.sessionId, actionError: "" });
    } catch {
      if (this.acceptsVisit(visitGeneration)) {
        this.replaceSnapshot({ actionError: replayError(this.adapter.kind) });
      }
    } finally {
      if (this.acceptsVisit(visitGeneration)) this.setPending("replay", false);
    }
  }

  stopReplay(): Promise<boolean> {
    if (this.stopCommandPromise) return this.stopCommandPromise;
    if (this.snapshot.disposed || this.snapshot.replaySessionId === undefined) {
      return Promise.resolve(true);
    }
    const sessionId = this.snapshot.replaySessionId;
    const visitGeneration = this.visitGeneration;
    this.setPending("stop", true);
    const terminal = new Promise<boolean>((resolve) => {
      this.stopWaiter = Object.freeze({ sessionId, resolve });
    });
    const command = this.performStopReplay(sessionId, visitGeneration, terminal);
    this.stopCommandPromise = command;
    void command.then(() => {
      if (this.stopCommandPromise === command) this.stopCommandPromise = undefined;
    });
    return command;
  }

  private async performStopReplay(
    sessionId: number,
    visitGeneration: number,
    terminal: Promise<boolean>
  ): Promise<boolean> {
    try {
      await this.capabilities.stopPlayback();
      if (!this.acceptsVisit(visitGeneration)) return false;
      return await terminal;
    } catch {
      const stopped = this.snapshot.replaySessionId !== sessionId;
      if (this.stopWaiter?.sessionId === sessionId) {
        this.stopWaiter.resolve(stopped);
        this.stopWaiter = undefined;
      }
      if (this.acceptsVisit(visitGeneration)) {
        this.replaceSnapshot({
          actionError: stopped ? "" : "停止重播失败，请稍后重试。"
        });
      }
      return stopped;
    } finally {
      if (this.acceptsVisit(visitGeneration)) this.setPending("stop", false);
    }
  }

  async deleteSelected(): Promise<void> {
    const selectedId = this.snapshot.selectedId;
    if (
      this.snapshot.disposed ||
      !selectedId ||
      this.snapshot.pending.delete ||
      this.snapshot.pending.replay ||
      this.snapshot.pending.stop
    ) {
      return;
    }
    const selectedIndex = this.snapshot.records.findIndex(
      (item) => item.record.id === selectedId
    );
    if (selectedIndex < 0) return;
    const deletionVisitGeneration = this.visitGeneration;
    const adjacentId =
      this.snapshot.records[selectedIndex + 1]?.record.id ??
      this.snapshot.records[selectedIndex - 1]?.record.id;
    this.setPending("delete", true);
    try {
      if (!(await this.prepareSelectionChange())) return;
      const undoToken = await this.adapter.deleteRecord(this.capabilities, selectedId);
      if (!undoToken) throw new Error("Record was not deleted.");
      this.offerUndo({
        message: this.adapter.undoMessage,
        undo: () => this.adapter.undoDeletion(this.capabilities, undoToken),
        onRestored: async () => {
          if (!this.acceptsVisit(deletionVisitGeneration)) return;
          if (!(await this.prepareSelectionChange())) return;
          await this.loadRecords(selectedId, true);
        }
      });
      if (this.acceptsVisit(deletionVisitGeneration)) {
        void this.loadRecords(adjacentId, true);
      }
    } catch {
      if (this.acceptsVisit(deletionVisitGeneration)) {
        this.replaceSnapshot({ actionError: deletionError(this.adapter.kind) });
      }
    } finally {
      if (this.acceptsVisit(deletionVisitGeneration)) {
        this.setPending("delete", false);
      }
    }
  }

  async copySelected(): Promise<void> {
    const selected = this.selectedItem();
    if (!selected || this.snapshot.pending.copy) return;
    const visitGeneration = this.visitGeneration;
    const selectedId = selected.record.id;
    this.setPending("copy", true);
    try {
      await this.capabilities.copyText(selected.record.text);
      if (!this.acceptsSelected(visitGeneration, selectedId)) return;
      if (this.copyFeedbackTimer) clearTimeout(this.copyFeedbackTimer);
      this.replaceSnapshot({ copiedRecordId: selectedId, actionError: "" });
      this.copyFeedbackTimer = setTimeout(() => {
        if (this.acceptsVisit(visitGeneration)) {
          this.replaceSnapshot({ copiedRecordId: undefined });
        }
      }, 1_300);
    } catch {
      if (this.acceptsSelected(visitGeneration, selectedId)) {
        this.replaceSnapshot({ actionError: "复制失败，未写入剪切板。请稍后重试。" });
      }
    } finally {
      if (this.acceptsVisit(visitGeneration)) this.setPending("copy", false);
    }
  }

  async runExtraAction(): Promise<void> {
    const selected = this.selectedItem();
    const runExtraAction = this.adapter.runExtraAction;
    if (!selected || !runExtraAction || this.snapshot.pending.extraAction) return;
    const visitGeneration = this.visitGeneration;
    const selectedId = selected.record.id;
    this.setPending("extraAction", true);
    try {
      const completed = await runExtraAction(this.capabilities, selectedId);
      if (!this.acceptsSelected(visitGeneration, selectedId)) return;
      if (!completed) {
        this.replaceSnapshot({ actionError: "添加收藏失败，历史记录仍然保留。请稍后重试。" });
        return;
      }
      if (this.extraActionFeedbackTimer) clearTimeout(this.extraActionFeedbackTimer);
      this.replaceSnapshot({ extraActionFeedbackRecordId: selectedId, actionError: "" });
      this.extraActionFeedbackTimer = setTimeout(() => {
        if (this.acceptsVisit(visitGeneration)) {
          this.replaceSnapshot({ extraActionFeedbackRecordId: undefined });
        }
      }, 1_300);
    } catch {
      if (this.acceptsSelected(visitGeneration, selectedId)) {
        this.replaceSnapshot({ actionError: "添加收藏失败，历史记录仍然保留。请稍后重试。" });
      }
    } finally {
      if (this.acceptsVisit(visitGeneration)) this.setPending("extraAction", false);
    }
  }

  dispose(): void {
    if (this.snapshot.disposed) return;
    this.started = false;
    this.visitGeneration += 1;
    this.loadGeneration += 1;
    this.retentionGeneration += 1;
    if (this.copyFeedbackTimer) clearTimeout(this.copyFeedbackTimer);
    if (this.extraActionFeedbackTimer) clearTimeout(this.extraActionFeedbackTimer);
    this.copyFeedbackTimer = undefined;
    this.extraActionFeedbackTimer = undefined;
    this.replayStartPromise = undefined;
    this.stopCommandPromise = undefined;
    this.stopWaiter?.resolve(false);
    this.stopWaiter = undefined;
    this.refreshPreference = undefined;
    for (const unsubscribe of this.playbackUnsubscribers) unsubscribe();
    this.playbackUnsubscribers = [];
    this.snapshot = createInitialSnapshot(this.adapter.kind, true);
    this.emit();
    this.listeners.clear();
  }

  private async loadRecords(
    preferredSelectedId?: string,
    requestFocus = false
  ): Promise<boolean> {
    if (requestFocus || preferredSelectedId !== undefined) {
      this.refreshPreference = Object.freeze({
        preferredId: preferredSelectedId,
        requestFocus
      });
    }
    const refreshPreference = this.refreshPreference;
    const loadGeneration = ++this.loadGeneration;
    const visitGeneration = this.visitGeneration;
    this.replaceSnapshot({ listState: "loading" });
    try {
      const records = [...(await this.adapter.listRecords(this.capabilities))].sort(
        (left, right) => right.time - left.time
      );
      if (!this.accepts(loadGeneration, visitGeneration)) return false;
      const activePreference =
        this.refreshPreference === refreshPreference ? refreshPreference : undefined;
      const selectedId = resolveSelection(
        records,
        this.snapshot.selectedId,
        activePreference?.preferredId
      );
      this.replaceSnapshot({
        listState: "ready",
        records: Object.freeze(records),
        groups: groupRecords(records),
        selectedId
      });
      if (this.refreshPreference === refreshPreference) this.refreshPreference = undefined;
      if (activePreference?.requestFocus) this.requestFocus(selectedId);
      return true;
    } catch {
      if (this.accepts(loadGeneration, visitGeneration)) {
        this.replaceSnapshot({ listState: "error", records: Object.freeze([]), groups: Object.freeze([]) });
      }
      return false;
    }
  }

  private subscribeToPlaybackTerminalEvents(): void {
    const clearReplay = (payload: { sessionId: number }): void => {
      if (this.snapshot.replaySessionId === payload.sessionId) {
        this.replaceSnapshot({ replaySessionId: undefined, actionError: "" });
      }
      if (this.stopWaiter?.sessionId === payload.sessionId) {
        this.stopWaiter.resolve(true);
        this.stopWaiter = undefined;
      }
    };
    this.playbackUnsubscribers = [
      this.capabilities.onPlaybackFinish(clearReplay),
      this.capabilities.onPlaybackFail(clearReplay),
      this.capabilities.onPlaybackStop(clearReplay)
    ];
  }

  private async loadHistoryRetention(): Promise<void> {
    const retentionGeneration = ++this.retentionGeneration;
    const visitGeneration = this.visitGeneration;
    this.replaceSnapshot({ historyRetention: "loading" });
    try {
      const settings = await this.capabilities.getSettings();
      if (
        !this.acceptsVisit(visitGeneration) ||
        this.retentionGeneration !== retentionGeneration
      ) {
        return;
      }
      this.replaceSnapshot({ historyRetention: settings.historyRetention });
    } catch {
      if (
        this.acceptsVisit(visitGeneration) &&
        this.retentionGeneration === retentionGeneration
      ) {
        this.replaceSnapshot({ historyRetention: "unavailable" });
      }
    }
  }

  private requestFocus(recordId: string | undefined): void {
    this.replaceSnapshot({
      focusRequest: Object.freeze({
        sequence: ++this.focusSequence,
        target: recordId
          ? Object.freeze({ kind: "record" as const, id: recordId })
          : Object.freeze({ kind: "empty" as const })
      })
    });
  }

  private accepts(loadGeneration: number, visitGeneration: number): boolean {
    return (
      this.started &&
      !this.snapshot.disposed &&
      this.loadGeneration === loadGeneration &&
      this.visitGeneration === visitGeneration
    );
  }

  private acceptsVisit(visitGeneration: number): boolean {
    return this.started && !this.snapshot.disposed && this.visitGeneration === visitGeneration;
  }

  private acceptsSelected(visitGeneration: number, selectedId: string): boolean {
    return this.acceptsVisit(visitGeneration) && this.snapshot.selectedId === selectedId;
  }

  private selectedItem(): RecordWorkspaceItem | undefined {
    return this.snapshot.records.find((item) => item.record.id === this.snapshot.selectedId);
  }

  private async prepareSelectionChange(): Promise<boolean> {
    const replayStart = this.replayStartPromise;
    if (replayStart) await replayStart;
    if (this.snapshot.disposed) return false;
    if (this.snapshot.replaySessionId !== undefined) return this.stopReplay();
    return true;
  }

  private setPending(command: PendingCommand, pending: boolean): void {
    this.replaceSnapshot({
      pending: Object.freeze({ ...this.snapshot.pending, [command]: pending })
    });
  }

  private replaceSnapshot(patch: Partial<RecordWorkspaceSnapshot>): void {
    if (this.snapshot.disposed) return;
    this.snapshot = Object.freeze({ ...this.snapshot, ...patch });
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

function createInitialSnapshot(
  kind: RecordWorkspaceKind,
  disposed: boolean
): RecordWorkspaceSnapshot {
  return Object.freeze({
    kind,
    disposed,
    listState: "loading",
    records: Object.freeze([]),
    groups: Object.freeze([]),
    actionError: "",
    pending: EMPTY_PENDING,
    historyRetention: kind === "history" ? "loading" : "unavailable"
  });
}

function groupRecords(
  records: readonly RecordWorkspaceItem[],
  now = Date.now()
): readonly RecordWorkspaceGroup[] {
  const buckets: Record<RecordGroupLabel, RecordWorkspaceItem[]> = {
    今天: [],
    昨天: [],
    本周: [],
    更早: []
  };
  for (const record of records) buckets[classifyRecordTime(record.time, now)].push(record);
  return Object.freeze(
    (["今天", "昨天", "本周", "更早"] as const)
      .map((label) => Object.freeze({ label, records: Object.freeze(buckets[label]) }))
      .filter((group) => group.records.length > 0)
  );
}

function classifyRecordTime(value: number, now: number): RecordGroupLabel {
  const today = startOfDay(new Date(now));
  const yesterday = today - 24 * 60 * 60 * 1000;
  const weekStart = today - ((new Date(now).getDay() + 6) % 7) * 24 * 60 * 60 * 1000;
  if (value >= today) return "今天";
  if (value >= yesterday) return "昨天";
  if (value >= weekStart) return "本周";
  return "更早";
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function freezeHistoryRecord(record: ReadingHistoryRecord): Readonly<ReadingHistoryRecord> {
  return Object.freeze({ ...record });
}

function freezeFavoriteRecord(record: FavoriteRecord): Readonly<FavoriteRecord> {
  return Object.freeze({ ...record });
}

function replayError(kind: RecordWorkspaceKind): string {
  return kind === "history"
    ? "重播失败，当前历史记录仍保留。请稍后重试。"
    : "重播失败，当前收藏仍保留。请稍后重试。";
}

function deletionError(kind: RecordWorkspaceKind): string {
  return kind === "history"
    ? "删除失败，历史记录仍然保留。请稍后重试。"
    : "移除失败，收藏仍然保留。请稍后重试。";
}

function resolveSelection(
  records: readonly RecordWorkspaceItem[],
  currentId: string | undefined,
  preferredId: string | undefined
): string | undefined {
  if (preferredId && records.some((item) => item.record.id === preferredId)) return preferredId;
  if (currentId && records.some((item) => item.record.id === currentId)) return currentId;
  return records[0]?.record.id;
}
