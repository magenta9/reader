import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { ReactElement, ReactNode } from "react";
import type { ReaderWindowRoleBridge, ReadingHistoryRecord } from "./bridge.js";
import type { HistoryRetention } from "../shared/app-contracts.js";
import { historyRetentionLabel } from "./history-retention.js";
import {
  RecordWorkspace,
  type RecordUndoRequest,
  type RecordWorkspaceGroup,
  type RecordWorkspaceItem,
  type RecordWorkspaceKind
} from "./record-workspace.js";

export type { RecordUndoRequest } from "./record-workspace.js";

interface CommonRecordBrowserProps {
  offerUndo: (action: RecordUndoRequest) => void;
  readerBridge: ReaderWindowRoleBridge;
}

export type RecordBrowserProps = CommonRecordBrowserProps &
  ({ kind: "history"; onManageHistory: () => void } | { kind: "favorites"; onManageHistory?: never });

interface RecordBrowserPresentation {
  readonly ariaLabel: string;
  readonly deleteButtonLabel: string;
  readonly deletingButtonLabel: string;
  readonly emptyDescription: string;
  readonly emptyListLabel: string;
  readonly listErrorDescription: string;
  readonly listErrorTitle: string;
  readonly loadingLabel: string;
  readonly replayWaveformLabel: string;
  readonly extraAction?: Readonly<{
    completedLabel: string;
    idleLabel: string;
  }>;
  renderMetadata(item: RecordWorkspaceItem): ReactNode;
}

const HISTORY_PRESENTATION: RecordBrowserPresentation = Object.freeze({
  ariaLabel: "历史记录",
  deleteButtonLabel: "删除记录",
  deletingButtonLabel: "正在删除",
  emptyDescription: "朗读选中文本或剪切板后，历史记录会显示在这里。",
  emptyListLabel: "暂无历史记录",
  listErrorDescription: "请确认本机数据可用后重试。",
  listErrorTitle: "无法载入历史记录",
  loadingLabel: "正在载入历史记录",
  replayWaveformLabel: "历史重播中",
  extraAction: Object.freeze({ completedLabel: "已添加", idleLabel: "添加收藏" }),
  renderMetadata: (item) => {
    if (item.kind !== "history") return null;
    const record = item.record;
    return (
      <>
        <span>{formatHistoryDateTime(record.createdAt)}</span>
        <span>{formatDuration(record.durationEstimateSeconds)}</span>
        <span>{record.languageSummary}</span>
        <span>{readingSourceLabel(record.source)}</span>
      </>
    );
  }
} satisfies RecordBrowserPresentation);

const FAVORITES_PRESENTATION: RecordBrowserPresentation = Object.freeze({
  ariaLabel: "收藏",
  deleteButtonLabel: "移除收藏",
  deletingButtonLabel: "正在移除",
  emptyDescription: "在历史记录详情中添加收藏后，会显示在这里。",
  emptyListLabel: "暂无收藏",
  listErrorDescription: "请确认本机数据可用后重试。",
  listErrorTitle: "无法载入收藏",
  loadingLabel: "正在载入收藏",
  replayWaveformLabel: "收藏重播中",
  renderMetadata: (item) => {
    if (item.kind !== "favorites") return null;
    const record = item.record;
    return (
      <>
        <span>收藏于 {formatHistoryDateTime(record.favoritedAt)}</span>
        <span>原朗读 {formatHistoryDateTime(record.sourceCreatedAt)}</span>
        <span>{formatDuration(record.durationEstimateSeconds)}</span>
        <span>{record.languageSummary}</span>
        <span>{readingSourceLabel(record.source)}</span>
      </>
    );
  }
} satisfies RecordBrowserPresentation);

export function RecordBrowser(props: RecordBrowserProps): ReactElement {
  return (
    <RecordBrowserView
      kind={props.kind}
      onManageHistory={props.onManageHistory}
      offerUndo={props.offerUndo}
      readerBridge={props.readerBridge}
    />
  );
}

function RecordBrowserView({
  kind,
  onManageHistory,
  offerUndo,
  readerBridge
}: {
  kind: RecordWorkspaceKind;
  onManageHistory?: () => void;
  offerUndo: (action: RecordUndoRequest) => void;
  readerBridge: ReaderWindowRoleBridge;
}): ReactElement {
  const presentation = kind === "history" ? HISTORY_PRESENTATION : FAVORITES_PRESENTATION;
  const workspace = useMemo(
    () => new RecordWorkspace(kind, readerBridge, offerUndo),
    [kind, offerUndo, readerBridge]
  );
  const snapshot = useSyncExternalStore(
    workspace.subscribe,
    workspace.getSnapshot,
    workspace.getSnapshot
  );
  const sectionRef = useRef<HTMLElement>(null);
  const selected = snapshot.records.find((item) => item.record.id === snapshot.selectedId);

  useEffect(() => {
    workspace.start();
    return () => workspace.dispose();
  }, [workspace]);

  useEffect(() => {
    const request = snapshot.focusRequest;
    if (!request) return;
    focusRecordAfterMutation(
      sectionRef.current,
      request.target.kind === "record" ? request.target.id : undefined
    );
  }, [snapshot.focusRequest]);

  return (
    <section className="history-layout" aria-label={presentation.ariaLabel} ref={sectionRef}>
      {kind === "history" ? (
        <HistoryStorageSummary
          historyRetention={snapshot.historyRetention}
          onManageHistory={onManageHistory}
        />
      ) : null}
      <GroupedRecordList
        emptyDescription={presentation.emptyDescription}
        emptyLabel={presentation.emptyListLabel}
        groups={snapshot.groups}
        listErrorDescription={presentation.listErrorDescription}
        listErrorTitle={presentation.listErrorTitle}
        listState={snapshot.listState}
        loadingLabel={presentation.loadingLabel}
        onRetry={() => workspace.retryList()}
        onSelect={(id) => void workspace.selectRecord(id)}
        selectedDetail={
          selected ? (
            <RecordDetailPanel id={`record-detail-${selected.record.id}`}>
              <h2>{selected.record.preview}</h2>
              <div className="detail-meta">{presentation.renderMetadata(selected)}</div>
              {snapshot.replaySessionId !== undefined ? (
                <DetailWaveform label={presentation.replayWaveformLabel} />
              ) : null}
              <ReplayDetailActions
                onReplay={() => void workspace.replaySelected()}
                onStop={() => void workspace.stopReplay()}
                replaySessionId={snapshot.replaySessionId}
              >
                <CopyTextButton
                  copied={snapshot.copiedRecordId === selected.record.id}
                  onCopy={() => void workspace.copySelected()}
                />
                {presentation.extraAction ? (
                  <button
                    className="text-action"
                    disabled={snapshot.pending.extraAction}
                    onClick={() => void workspace.runExtraAction()}
                    type="button"
                  >
                    {snapshot.extraActionFeedbackRecordId === selected.record.id
                      ? presentation.extraAction.completedLabel
                      : presentation.extraAction.idleLabel}
                  </button>
                ) : null}
                <button
                  className="text-action"
                  disabled={snapshot.pending.delete}
                  onClick={() => void workspace.deleteSelected()}
                  type="button"
                >
                  {snapshot.pending.delete
                    ? presentation.deletingButtonLabel
                    : presentation.deleteButtonLabel}
                </button>
              </ReplayDetailActions>
              <article className="history-full-text">{selected.record.text}</article>
              {snapshot.actionError ? (
                <p className="inline-error record-action-message" role="alert">
                  {snapshot.actionError}
                </p>
              ) : null}
            </RecordDetailPanel>
          ) : null
        }
        selectedId={snapshot.selectedId}
      />
    </section>
  );
}

function HistoryStorageSummary({
  historyRetention,
  onManageHistory
}: {
  historyRetention: HistoryRetention | "loading" | "unavailable";
  onManageHistory?: () => void;
}): ReactElement {
  return (
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
  );
}

function GroupedRecordList({
  emptyDescription,
  emptyLabel,
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
  groups: readonly RecordWorkspaceGroup[];
  listErrorDescription: string;
  listErrorTitle: string;
  listState: "error" | "loading" | "ready";
  loadingLabel: string;
  onSelect: (id: string) => void;
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
              {group.records.map((item) => {
                const record = item.record;
                const isExpanded = record.id === selectedId;
                return (
                  <div className="history-record" key={record.id}>
                    <button
                      aria-controls={`record-detail-${record.id}`}
                      aria-expanded={isExpanded}
                      className={`history-item${isExpanded ? " is-active" : ""}`}
                      data-record-id={record.id}
                      onClick={() => onSelect(record.id)}
                      type="button"
                    >
                      <span className="history-time">{formatHistoryTime(item.time)}</span>
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
      {replaySessionId !== undefined ? (
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

function RecordDetailPanel({ children, id }: { children: ReactNode; id: string }): ReactElement {
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
