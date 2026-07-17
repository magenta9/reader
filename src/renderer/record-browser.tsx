import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import type { FavoriteRecord, ReaderWindowRuntimeBridge, ReadingHistoryRecord } from "./bridge.js";
import {
  groupFavoriteRecords,
  groupHistoryRecords,
  type RecordGroup,
  resolveAdjacentSelectionAfterDelete,
  resolveSelectedRecordId
} from "./record-view-model.js";

export interface RecordUndoRequest {
  message: string;
  undo: () => Promise<boolean>;
  onRestored: () => Promise<void>;
}

export interface RecordBrowserProps {
  kind: "history" | "favorites";
  offerUndo: (action: RecordUndoRequest) => void;
  readerBridge: ReaderWindowRuntimeBridge;
}

interface BrowserRecord {
  id: string;
  durationEstimateSeconds: number;
  languageSummary: string;
  preview: string;
  text: string;
}

interface RecordBrowserAdapter<TRecord extends BrowserRecord> {
  ariaLabel: string;
  deleteButtonLabel: string;
  deletingButtonLabel: string;
  deletionError: string;
  emptyDescription: string;
  emptyListLabel: string;
  emptyTitle: string;
  replayWaveformLabel: string;
  undoMessage: string;
  clearCopyFeedbackOnDelete: boolean;
  clearCopyFeedbackOnSelect: boolean;
  deleteRecord: (readerBridge: ReaderWindowRuntimeBridge, id: string) => Promise<string | undefined>;
  extraAction?: {
    completedLabel: string;
    idleLabel: string;
    run: (readerBridge: ReaderWindowRuntimeBridge, id: string) => Promise<boolean>;
  };
  getTime: (record: TRecord) => number;
  groupRecords: (records: TRecord[]) => RecordGroup<TRecord>[];
  listRecords: (readerBridge: ReaderWindowRuntimeBridge) => Promise<TRecord[]>;
  renderMetadata: (record: TRecord) => ReactNode;
  replayRecord: (readerBridge: ReaderWindowRuntimeBridge, id: string) => Promise<{ started: boolean; sessionId?: number }>;
  undoDeletion: (readerBridge: ReaderWindowRuntimeBridge, undoToken: string) => Promise<boolean>;
}

const HISTORY_ADAPTER: RecordBrowserAdapter<ReadingHistoryRecord> = {
  ariaLabel: "历史记录",
  deleteButtonLabel: "删除记录",
  deletingButtonLabel: "正在删除",
  deletionError: "删除失败，历史记录仍然保留。请稍后重试。",
  emptyDescription: "朗读选中文本或剪切板后，历史记录会显示在这里。",
  emptyListLabel: "暂无历史记录",
  emptyTitle: "选择一条历史记录",
  replayWaveformLabel: "历史重播中",
  undoMessage: "已删除 1 条历史记录",
  clearCopyFeedbackOnDelete: false,
  clearCopyFeedbackOnSelect: false,
  deleteRecord: (readerBridge, id) => readerBridge.deleteReadingHistoryRecord(id),
  extraAction: {
    completedLabel: "已添加",
    idleLabel: "添加收藏",
    run: async (readerBridge, id) => Boolean(await readerBridge.createFavoriteFromHistoryRecord(id))
  },
  getTime: (record) => record.createdAt,
  groupRecords: groupHistoryRecords,
  listRecords: (readerBridge) => readerBridge.listReadingHistory(),
  renderMetadata: (record) => (
    <>
      <span>{formatHistoryDateTime(record.createdAt)}</span>
      <span>{formatDuration(record.durationEstimateSeconds)}</span>
      <span>{record.languageSummary}</span>
    </>
  ),
  replayRecord: (readerBridge, id) => readerBridge.playHistoryRecord(id),
  undoDeletion: (readerBridge, undoToken) => readerBridge.undoReadingHistoryDeletion(undoToken)
};

const FAVORITES_ADAPTER: RecordBrowserAdapter<FavoriteRecord> = {
  ariaLabel: "收藏",
  deleteButtonLabel: "移除收藏",
  deletingButtonLabel: "正在移除",
  deletionError: "移除失败，收藏仍然保留。请稍后重试。",
  emptyDescription: "在历史记录详情中添加收藏后，会显示在这里。",
  emptyListLabel: "暂无收藏",
  emptyTitle: "暂无收藏",
  replayWaveformLabel: "收藏重播中",
  undoMessage: "已移除 1 条收藏",
  clearCopyFeedbackOnDelete: true,
  clearCopyFeedbackOnSelect: true,
  deleteRecord: (readerBridge, id) => readerBridge.deleteFavoriteRecord(id),
  getTime: (record) => record.favoritedAt,
  groupRecords: groupFavoriteRecords,
  listRecords: (readerBridge) => readerBridge.listFavorites(),
  renderMetadata: (record) => (
    <>
      <span>收藏于 {formatHistoryDateTime(record.favoritedAt)}</span>
      <span>原朗读 {formatHistoryDateTime(record.sourceCreatedAt)}</span>
      <span>{formatDuration(record.durationEstimateSeconds)}</span>
      <span>{record.languageSummary}</span>
      <span>{readingSourceLabel(record.source)}</span>
    </>
  ),
  replayRecord: (readerBridge, id) => readerBridge.playFavoriteRecord(id),
  undoDeletion: (readerBridge, undoToken) => readerBridge.undoFavoriteDeletion(undoToken)
};

export function RecordBrowser({ kind, offerUndo, readerBridge }: RecordBrowserProps): ReactElement {
  return kind === "history" ? (
    <RecordBrowserView adapter={HISTORY_ADAPTER} offerUndo={offerUndo} readerBridge={readerBridge} />
  ) : (
    <RecordBrowserView adapter={FAVORITES_ADAPTER} offerUndo={offerUndo} readerBridge={readerBridge} />
  );
}

function RecordBrowserView<TRecord extends BrowserRecord>({
  adapter,
  offerUndo,
  readerBridge
}: {
  adapter: RecordBrowserAdapter<TRecord>;
  offerUndo: (action: RecordUndoRequest) => void;
  readerBridge: ReaderWindowRuntimeBridge;
}): ReactElement {
  const [records, setRecords] = useState<TRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);
  const [extraActionFeedbackId, setExtraActionFeedbackId] = useState<string | undefined>();
  const [actionError, setActionError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [replaySessionId, setReplaySessionId] = useReplaySessionId(readerBridge);
  const isMounted = useRef(true);
  const sectionRef = useRef<HTMLElement>(null);

  const refreshRecords = useCallback(
    async (preferredSelectedId?: string): Promise<boolean> => {
      const nextRecords = await adapter.listRecords(readerBridge);
      if (!isMounted.current) return false;
      setRecords(nextRecords);
      setSelectedId((current) => resolveSelectedRecordId(nextRecords, current, preferredSelectedId));
      return true;
    },
    [adapter, readerBridge]
  );

  useEffect(() => {
    isMounted.current = true;
    void refreshRecords();
    return () => {
      isMounted.current = false;
    };
  }, [refreshRecords]);

  const selected = records.find((record) => record.id === selectedId);
  const groups = adapter.groupRecords(records);

  const copySelected = async (): Promise<void> => {
    if (!selected) return;
    await readerBridge.copyText(selected.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1300);
  };

  const deleteSelected = async (): Promise<void> => {
    if (!selected || isDeleting) return;
    const record = selected;
    const nextSelection = resolveAdjacentSelectionAfterDelete(records, record.id);
    setIsDeleting(true);
    try {
      if (replaySessionId) {
        await readerBridge.stopPlayback();
        setReplaySessionId(undefined);
      }
      const undoToken = await adapter.deleteRecord(readerBridge, record.id);
      if (!undoToken) throw new Error("Record was not deleted.");
      if (adapter.clearCopyFeedbackOnDelete) setCopied(false);
      setActionError("");
      const stillMounted = await refreshRecords(nextSelection);
      if (stillMounted) focusRecordAfterMutation(sectionRef.current, nextSelection);
      offerUndo({
        message: adapter.undoMessage,
        undo: () => adapter.undoDeletion(readerBridge, undoToken),
        onRestored: async () => {
          if (!isMounted.current) return;
          const restored = await refreshRecords(record.id);
          if (restored) focusRecordAfterMutation(sectionRef.current, record.id);
        }
      });
    } catch {
      setActionError(adapter.deletionError);
    } finally {
      setIsDeleting(false);
    }
  };

  const replaySelected = async (): Promise<void> => {
    if (!selected) return;
    const result = await adapter.replayRecord(readerBridge, selected.id);
    if (result.started) setReplaySessionId(result.sessionId);
  };

  const runExtraAction = async (): Promise<void> => {
    if (!selected || !adapter.extraAction) return;
    const completed = await adapter.extraAction.run(readerBridge, selected.id);
    if (!completed) return;
    setExtraActionFeedbackId(selected.id);
    window.setTimeout(() => {
      setExtraActionFeedbackId((current) => (current === selected.id ? undefined : current));
    }, 1300);
  };

  return (
    <section className="history-layout" aria-label={adapter.ariaLabel} ref={sectionRef}>
      <GroupedRecordList
        emptyLabel={adapter.emptyListLabel}
        getTime={adapter.getTime}
        groups={groups}
        onSelect={(record) => {
          setSelectedId(record.id);
          if (adapter.clearCopyFeedbackOnSelect) setCopied(false);
          setActionError("");
        }}
        selectedId={selectedId}
      />
      <RecordDetailPanel
        emptyDescription={adapter.emptyDescription}
        emptyTitle={adapter.emptyTitle}
        hasSelection={Boolean(selected)}
      >
        {selected && (
          <>
            <p className="section-kicker">详情</p>
            <h2>{selected.preview}</h2>
            <div className="detail-meta">{adapter.renderMetadata(selected)}</div>
            {replaySessionId ? <DetailWaveform label={adapter.replayWaveformLabel} /> : null}
            <ReplayDetailActions onReplay={replaySelected} replaySessionId={replaySessionId} readerBridge={readerBridge}>
              <CopyTextButton copied={copied} onCopy={copySelected} />
              {adapter.extraAction ? (
                <button className="text-action" onClick={runExtraAction} type="button">
                  {extraActionFeedbackId === selected.id
                    ? adapter.extraAction.completedLabel
                    : adapter.extraAction.idleLabel}
                </button>
              ) : null}
              <button className="text-action" disabled={isDeleting} onClick={deleteSelected} type="button">
                {isDeleting ? adapter.deletingButtonLabel : adapter.deleteButtonLabel}
              </button>
            </ReplayDetailActions>
            <article className="history-full-text">{selected.text}</article>
          </>
        )}
      </RecordDetailPanel>
      {actionError ? (
        <p className="inline-error record-action-message" role="alert">
          {actionError}
        </p>
      ) : null}
    </section>
  );
}

function GroupedRecordList<TRecord extends BrowserRecord>({
  emptyLabel,
  getTime,
  groups,
  onSelect,
  selectedId
}: {
  emptyLabel: string;
  getTime: (record: TRecord) => number;
  groups: RecordGroup<TRecord>[];
  onSelect: (record: TRecord) => void;
  selectedId: string | undefined;
}): ReactElement {
  return (
    <div className="history-list">
      {groups.length ? (
        groups.map((group) => (
          <div className="history-group" key={group.label}>
            <p className="section-kicker">{group.label}</p>
            <div className="history-items">
              {group.records.map((record) => (
                <button
                  className={`history-item${record.id === selectedId ? " is-active" : ""}`}
                  data-record-id={record.id}
                  key={record.id}
                  onClick={() => onSelect(record)}
                  type="button"
                >
                  <span className="history-time">{formatHistoryTime(getTime(record))}</span>
                  <span className="history-preview">{record.preview}</span>
                  <span className="history-meta">
                    {formatDuration(record.durationEstimateSeconds)} · {record.languageSummary}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="empty-list" data-record-empty tabIndex={-1}>
          {emptyLabel}
        </div>
      )}
    </div>
  );
}

function ReplayDetailActions({
  children,
  onReplay,
  readerBridge,
  replaySessionId
}: {
  children: ReactNode;
  onReplay: () => void;
  readerBridge: ReaderWindowRuntimeBridge;
  replaySessionId: number | undefined;
}): ReactElement {
  return (
    <div className="detail-actions">
      <button className="secondary-action" onClick={onReplay} type="button">
        重新播放
      </button>
      {replaySessionId ? (
        <button className="text-action" onClick={() => void readerBridge.stopPlayback()} type="button">
          停止
        </button>
      ) : null}
      {children}
    </div>
  );
}

function CopyTextButton({ copied, onCopy }: { copied: boolean; onCopy: () => void }): ReactElement {
  return (
    <button className="text-action" onClick={onCopy} type="button">
      {copied ? "已复制" : "复制全文"}
    </button>
  );
}

function RecordDetailPanel({
  children,
  emptyDescription,
  emptyTitle,
  hasSelection
}: {
  children: ReactNode;
  emptyDescription: string;
  emptyTitle: string;
  hasSelection: boolean;
}): ReactElement {
  return (
    <div className="history-detail">
      {hasSelection ? (
        <>{children}</>
      ) : (
        <>
          <p className="section-kicker">详情</p>
          <h2>{emptyTitle}</h2>
          <p className="muted">{emptyDescription}</p>
        </>
      )}
    </div>
  );
}

function DetailWaveform({ label }: { label: string }): ReactElement {
  return (
    <div className="detail-waveform" aria-label={label}>
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

function useReplaySessionId(
  readerBridge: ReaderWindowRuntimeBridge
): readonly [number | undefined, (sessionId: number | undefined) => void] {
  const [replaySessionId, setReplaySessionId] = useState<number | undefined>();

  useEffect(() => {
    const clearReplay = (payload: { sessionId: number }) => {
      setReplaySessionId((current) => (current === payload.sessionId ? undefined : current));
    };
    const subscriptions = [
      readerBridge.onPlaybackFinish(clearReplay),
      readerBridge.onPlaybackFail(clearReplay),
      readerBridge.onPlaybackStop(clearReplay)
    ];
    return () => {
      for (const unsubscribe of subscriptions) unsubscribe();
    };
  }, [readerBridge]);

  return [replaySessionId, setReplaySessionId];
}

function readingSourceLabel(source: ReadingHistoryRecord["source"]): string {
  return source === "selected_text" ? "选区" : "剪切板";
}

function formatHistoryTime(value: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}

function formatHistoryDateTime(value: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return "约 1 分钟";
  return `约 ${Math.max(1, Math.round(seconds / 60))} 分钟`;
}

function focusRecordAfterMutation(container: HTMLElement | null, recordId: string | undefined): void {
  window.setTimeout(() => {
    if (!container?.isConnected) return;
    const record = Array.from(container.querySelectorAll<HTMLElement>("[data-record-id]")).find(
      (element) => element.dataset.recordId === recordId
    );
    (record ?? container.querySelector<HTMLElement>("[data-record-empty]"))?.focus();
  });
}
