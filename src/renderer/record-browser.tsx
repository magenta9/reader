import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import type { FavoriteRecord, ReaderWindowRoleBridge, ReadingHistoryRecord } from "./bridge.js";
import type { HistoryRetention } from "../shared/app-contracts.js";
import { historyRetentionLabel } from "./history-retention.js";
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

interface CommonRecordBrowserProps {
  offerUndo: (action: RecordUndoRequest) => void;
  readerBridge: ReaderWindowRoleBridge;
}

export type RecordBrowserProps = CommonRecordBrowserProps &
  ({ kind: "history"; onManageHistory: () => void } | { kind: "favorites"; onManageHistory?: never });

interface BrowserRecord {
  id: string;
  durationEstimateSeconds: number;
  languageSummary: string;
  preview: string;
  source: ReadingHistoryRecord["source"];
  text: string;
}

interface RecordBrowserAdapter<TRecord extends BrowserRecord> {
  ariaLabel: string;
  deleteButtonLabel: string;
  deletingButtonLabel: string;
  deletionError: string;
  emptyDescription: string;
  emptyListLabel: string;
  listErrorDescription: string;
  listErrorTitle: string;
  loadingLabel: string;
  replayError: string;
  replayWaveformLabel: string;
  undoMessage: string;
  clearCopyFeedbackOnDelete: boolean;
  clearCopyFeedbackOnSelect: boolean;
  deleteRecord: (readerBridge: ReaderWindowRoleBridge, id: string) => Promise<string | undefined>;
  extraAction?: {
    completedLabel: string;
    errorLabel: string;
    idleLabel: string;
    run: (readerBridge: ReaderWindowRoleBridge, id: string) => Promise<boolean>;
  };
  getTime: (record: TRecord) => number;
  groupRecords: (records: TRecord[]) => RecordGroup<TRecord>[];
  listRecords: (readerBridge: ReaderWindowRoleBridge) => Promise<TRecord[]>;
  renderMetadata: (record: TRecord) => ReactNode;
  replayRecord: (readerBridge: ReaderWindowRoleBridge, id: string) => Promise<{ started: boolean; sessionId?: number }>;
  undoDeletion: (readerBridge: ReaderWindowRoleBridge, undoToken: string) => Promise<boolean>;
}

const HISTORY_ADAPTER: RecordBrowserAdapter<ReadingHistoryRecord> = {
  ariaLabel: "历史记录",
  deleteButtonLabel: "删除记录",
  deletingButtonLabel: "正在删除",
  deletionError: "删除失败，历史记录仍然保留。请稍后重试。",
  emptyDescription: "朗读选中文本或剪切板后，历史记录会显示在这里。",
  emptyListLabel: "暂无历史记录",
  listErrorDescription: "请确认本机数据可用后重试。",
  listErrorTitle: "无法载入历史记录",
  loadingLabel: "正在载入历史记录",
  replayError: "重播失败，当前历史记录仍保留。请稍后重试。",
  replayWaveformLabel: "历史重播中",
  undoMessage: "已删除 1 条历史记录",
  clearCopyFeedbackOnDelete: false,
  clearCopyFeedbackOnSelect: false,
  deleteRecord: (readerBridge, id) => readerBridge.deleteReadingHistoryRecord(id),
  extraAction: {
    completedLabel: "已添加",
    errorLabel: "添加收藏失败，历史记录仍然保留。请稍后重试。",
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
      <span>{readingSourceLabel(record.source)}</span>
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
  listErrorDescription: "请确认本机数据可用后重试。",
  listErrorTitle: "无法载入收藏",
  loadingLabel: "正在载入收藏",
  replayError: "重播失败，当前收藏仍保留。请稍后重试。",
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

export function RecordBrowser(props: RecordBrowserProps): ReactElement {
  return props.kind === "history" ? (
    <RecordBrowserView
      adapter={HISTORY_ADAPTER}
      kind={props.kind}
      onManageHistory={props.onManageHistory}
      offerUndo={props.offerUndo}
      readerBridge={props.readerBridge}
    />
  ) : (
    <RecordBrowserView
      adapter={FAVORITES_ADAPTER}
      kind={props.kind}
      offerUndo={props.offerUndo}
      readerBridge={props.readerBridge}
    />
  );
}

function RecordBrowserView<TRecord extends BrowserRecord>({
  adapter,
  kind,
  onManageHistory,
  offerUndo,
  readerBridge
}: {
  adapter: RecordBrowserAdapter<TRecord>;
  kind: "history" | "favorites";
  onManageHistory?: () => void;
  offerUndo: (action: RecordUndoRequest) => void;
  readerBridge: ReaderWindowRoleBridge;
}): ReactElement {
  const [records, setRecords] = useState<TRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);
  const [extraActionFeedbackId, setExtraActionFeedbackId] = useState<string | undefined>();
  const [actionError, setActionError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [listState, setListState] = useState<"error" | "loading" | "ready">("loading");
  const [historyRetention, setHistoryRetention] = useState<HistoryRetention | "loading" | "unavailable">("loading");
  const [replaySessionId, setReplaySessionId] = useReplaySessionId(readerBridge);
  const isMounted = useRef(true);
  const sectionRef = useRef<HTMLElement>(null);

  const refreshRecords = useCallback(
    async (preferredSelectedId?: string): Promise<boolean> => {
      try {
        const nextRecords = await adapter.listRecords(readerBridge);
        if (!isMounted.current) return false;
        setRecords(nextRecords);
        setSelectedId((current) => resolveSelectedRecordId(nextRecords, current, preferredSelectedId));
        setListState("ready");
        return true;
      } catch {
        if (isMounted.current) setListState("error");
        return false;
      }
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

  useEffect(() => {
    if (kind !== "history") return;
    void readerBridge
      .getSettings()
      .then((settings) => {
        if (isMounted.current) setHistoryRetention(settings.historyRetention);
      })
      .catch(() => {
        if (isMounted.current) setHistoryRetention("unavailable");
      });
  }, [kind, readerBridge]);

  const selected = records.find((record) => record.id === selectedId);
  const groups = adapter.groupRecords(records);

  const copySelected = async (): Promise<void> => {
    if (!selected) return;
    try {
      await readerBridge.copyText(selected.text);
      setActionError("");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1300);
    } catch {
      setActionError("复制失败，未写入剪切板。请稍后重试。");
    }
  };

  const stopReplay = async (): Promise<boolean> => {
    try {
      await readerBridge.stopPlayback();
      setReplaySessionId(undefined);
      setActionError("");
      return true;
    } catch {
      setActionError("停止重播失败，请稍后重试。");
      return false;
    }
  };

  const deleteSelected = async (): Promise<void> => {
    if (!selected || isDeleting) return;
    const record = selected;
    const nextSelection = resolveAdjacentSelectionAfterDelete(records, record.id);
    setIsDeleting(true);
    try {
      if (replaySessionId && !(await stopReplay())) return;
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
    try {
      const result = await adapter.replayRecord(readerBridge, selected.id);
      if (!result.started) {
        setActionError(adapter.replayError);
        return;
      }
      setActionError("");
      setReplaySessionId(result.sessionId);
    } catch {
      setActionError(adapter.replayError);
    }
  };

  const runExtraAction = async (): Promise<void> => {
    if (!selected || !adapter.extraAction) return;
    try {
      const completed = await adapter.extraAction.run(readerBridge, selected.id);
      if (!completed) {
        setActionError(adapter.extraAction.errorLabel);
        return;
      }
      setActionError("");
      setExtraActionFeedbackId(selected.id);
      window.setTimeout(() => {
        setExtraActionFeedbackId((current) => (current === selected.id ? undefined : current));
      }, 1300);
    } catch {
      setActionError(adapter.extraAction.errorLabel);
    }
  };

  const selectRecord = async (record: TRecord): Promise<void> => {
    if (replaySessionId && !(await stopReplay())) return;
    setSelectedId((current) => (current === record.id ? undefined : record.id));
    if (adapter.clearCopyFeedbackOnSelect) setCopied(false);
    setActionError("");
  };

  return (
    <section className="history-layout" aria-label={adapter.ariaLabel} ref={sectionRef}>
      {kind === "history" ? (
        <div className="history-storage-summary">
          <div>
            <strong>仅存本机</strong>
            <span>
              {historyRetention === "loading"
                ? "正在读取保留期限"
                : historyRetention === "unavailable"
                  ? "保留期限暂不可用"
                  : `保留 ${historyRetentionLabel(historyRetention)}`}
            </span>
          </div>
          <button className="text-action" onClick={onManageHistory} type="button">
            管理
          </button>
        </div>
      ) : null}
      <GroupedRecordList
        emptyDescription={adapter.emptyDescription}
        emptyLabel={adapter.emptyListLabel}
        getTime={adapter.getTime}
        groups={groups}
        listErrorDescription={adapter.listErrorDescription}
        listErrorTitle={adapter.listErrorTitle}
        listState={listState}
        loadingLabel={adapter.loadingLabel}
        onSelect={selectRecord}
        onRetry={() => {
          setListState("loading");
          void refreshRecords();
        }}
        selectedDetail={
          selected ? (
            <RecordDetailPanel id={`record-detail-${selected.id}`}>
              <h2>{selected.preview}</h2>
              <div className="detail-meta">{adapter.renderMetadata(selected)}</div>
              {replaySessionId ? <DetailWaveform label={adapter.replayWaveformLabel} /> : null}
              <ReplayDetailActions
                onReplay={replaySelected}
                onStop={() => void stopReplay()}
                replaySessionId={replaySessionId}
              >
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
              {actionError ? (
                <p className="inline-error record-action-message" role="alert">
                  {actionError}
                </p>
              ) : null}
            </RecordDetailPanel>
          ) : null
        }
        selectedId={selectedId}
      />
    </section>
  );
}

function GroupedRecordList<TRecord extends BrowserRecord>({
  emptyDescription,
  emptyLabel,
  getTime,
  groups,
  listErrorDescription,
  listErrorTitle,
  listState,
  loadingLabel,
  onSelect,
  onRetry,
  selectedDetail,
  selectedId
}: {
  emptyDescription: string;
  emptyLabel: string;
  getTime: (record: TRecord) => number;
  groups: RecordGroup<TRecord>[];
  listErrorDescription: string;
  listErrorTitle: string;
  listState: "error" | "loading" | "ready";
  loadingLabel: string;
  onSelect: (record: TRecord) => Promise<void>;
  onRetry: () => void;
  selectedDetail: ReactNode;
  selectedId: string | undefined;
}): ReactElement {
  return (
    <div className="history-list">
      {listState === "loading" ? (
        <div aria-live="polite" className="empty-list record-list-status" role="status">
          <strong>{loadingLabel}</strong>
        </div>
      ) : listState === "error" ? (
        <div className="empty-list record-list-status" role="alert">
          <strong>{listErrorTitle}</strong>
          <span>{listErrorDescription}</span>
          <button className="secondary-action" onClick={onRetry} type="button">
            重试
          </button>
        </div>
      ) : groups.length ? (
        groups.map((group) => (
          <div className="history-group" key={group.label}>
            <p className="section-kicker">{group.label}</p>
            <div className="history-items">
              {group.records.map((record) => {
                const isExpanded = record.id === selectedId;
                return (
                  <div className="history-record" key={record.id}>
                    <button
                      aria-controls={`record-detail-${record.id}`}
                      aria-expanded={isExpanded}
                      className={`history-item${isExpanded ? " is-active" : ""}`}
                      data-record-id={record.id}
                      onClick={() => void onSelect(record)}
                      type="button"
                    >
                      <span className="history-time">{formatHistoryTime(getTime(record))}</span>
                      <span className="history-preview">{record.preview}</span>
                      <span className="history-meta">
                        {formatDuration(record.durationEstimateSeconds)} · {record.languageSummary} ·{" "}
                        {readingSourceLabel(record.source)}
                      </span>
                    </button>
                    {isExpanded ? selectedDetail : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      ) : (
        <div className="empty-list" data-record-empty tabIndex={-1}>
          <strong>{emptyLabel}</strong>
          <span>{emptyDescription}</span>
        </div>
      )}
    </div>
  );
}

function ReplayDetailActions({
  children,
  onReplay,
  onStop,
  replaySessionId
}: {
  children: ReactNode;
  onReplay: () => void;
  onStop: () => void;
  replaySessionId: number | undefined;
}): ReactElement {
  return (
    <div className="detail-actions">
      <button className="secondary-action" onClick={onReplay} type="button">
        重新播放
      </button>
      {replaySessionId ? (
        <button className="text-action" onClick={onStop} type="button">
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
  id
}: {
  children: ReactNode;
  id: string;
}): ReactElement {
  return (
    <div className="history-detail" id={id}>
      {children}
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
  readerBridge: ReaderWindowRoleBridge
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
