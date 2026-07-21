import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from "react";
import type { CSSProperties, ReactElement } from "react";
import type {
  AppRoute,
  AppSettings,
  ReaderWindowRoleBridge,
  RouteSnapshot
} from "./bridge.js";
import { DEFAULT_ACTIVATION_SHORTCUT } from "../shared/app-contracts.js";
import type { HistoryRetention } from "../shared/app-contracts.js";
import { MODEL_OPTIONS } from "../shared/models.js";
import { HomeWorkspace } from "./home-workspace.js";
import { historyRetentionLabel } from "./history-retention.js";
import { RecordBrowser, type RecordUndoRequest } from "./record-browser.js";
import { SettingsWorkspace } from "./settings-workspace.js";

export interface ReaderWindowAppProps {
  readerBridge: ReaderWindowRoleBridge;
}

const AppDependenciesContext = createContext<ReaderWindowAppProps | undefined>(undefined);

interface UndoAction extends RecordUndoRequest {
  id: number;
}

const NAV_ITEMS: Array<{ route: AppRoute; label: string; description: string; mark: string }> = [
  { route: "home", label: "主页", description: "", mark: "⌂" },
  {
    route: "history",
    label: "历史记录",
    description: "查看、重播与管理仅保存在本机的朗读内容。",
    mark: "◷"
  },
  { route: "favorites", label: "收藏", description: "保存重要的朗读内容，随时重新播放。", mark: "★" },
  { route: "settings", label: "设置", description: "管理连接、朗读偏好与本机数据。", mark: "⚙" }
];

const SETTINGS_GROUPS = ["账户与连接", "快捷键", "朗读", "通用", "历史记录"] as const;

const SETTINGS_GROUP_IDS: Record<(typeof SETTINGS_GROUPS)[number], string> = {
  账户与连接: "settings-account",
  快捷键: "settings-shortcut",
  朗读: "settings-reading",
  通用: "settings-general",
  历史记录: "settings-history"
};

const SETTINGS_GROUP_DESCRIPTIONS: Record<(typeof SETTINGS_GROUPS)[number], string> = {
  账户与连接: "完成 MiniMax 连接后才能开始播放。",
  快捷键: "设置从任意 App 开始朗读的快捷键；朗读中按 Esc 停止。",
  朗读: "调整播放速度和语音模型。",
  历史记录: "控制本机全文历史的保留方式。",
  通用: "低频维护和启动选项。"
};

const DELETION_UNDO_WINDOW_MS = 10_000;

export function ReaderWindowApp({ readerBridge }: ReaderWindowAppProps): ReactElement {
  return (
    <AppDependenciesContext.Provider value={{ readerBridge }}>
      <AppContent />
    </AppDependenciesContext.Provider>
  );
}

function AppContent(): ReactElement {
  const { readerBridge } = useAppDependencies();
  const [route, setRoute] = useState<AppRoute>("home");
  const [undoAction, setUndoAction] = useState<UndoAction | undefined>();
  const [isUndoing, setIsUndoing] = useState(false);
  const [undoError, setUndoError] = useState("");
  const undoActionId = useRef(0);
  const routeRevision = useRef(-1);
  const isMounted = useRef(true);

  const applyRoute = useCallback((snapshot: RouteSnapshot): void => {
    if (!isMounted.current || snapshot.revision <= routeRevision.current) return;
    routeRevision.current = snapshot.revision;
    setRoute(snapshot.route);
  }, []);

  useEffect(() => {
    isMounted.current = true;
    const unsubscribe = readerBridge.onNavigate(applyRoute);
    void readerBridge.getBootstrapState().then((state) => {
      applyRoute(state.route);
    });
    return () => {
      isMounted.current = false;
      unsubscribe();
    };
  }, [applyRoute, readerBridge]);

  const activeNavigationItem = useMemo(() => NAV_ITEMS.find((item) => item.route === route) ?? NAV_ITEMS[0], [route]);

  const navigate = (nextRoute: AppRoute): void => {
    void readerBridge.setRoute(nextRoute).then(applyRoute);
  };

  const offerUndo = (action: RecordUndoRequest): void => {
    setUndoError("");
    setUndoAction({ ...action, id: ++undoActionId.current });
  };

  const runUndo = async (): Promise<void> => {
    if (!undoAction || isUndoing) return;
    const action = undoAction;
    setIsUndoing(true);
    setUndoError("");
    try {
      const restored = await action.undo();
      if (!restored) {
        setUndoAction(undefined);
        setUndoError("无法撤销这次操作；撤销凭据可能已失效或记录已存在。");
        return;
      }
      setUndoAction(undefined);
      await action.onRestored();
    } catch {
      setUndoError("撤销失败，请保持窗口打开后重试。");
    } finally {
      setIsUndoing(false);
    }
  };

  return (
    <>
      <div className="app-shell">
        <aside className="sidebar" aria-label="VoiceReader navigation">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              <img src="./assets/voicereader-icon.svg" alt="" />
            </div>
            <div>
              <p className="brand-name">VoiceReader</p>
              <p className="brand-subtitle">文字转语音</p>
            </div>
          </div>

          <nav className="nav-list">
            {NAV_ITEMS.map((item) => (
              <button
                className={`nav-item${route === item.route ? " is-active" : ""}`}
                key={item.route}
                onClick={() => navigate(item.route)}
                type="button"
              >
                <span className="nav-mark" aria-hidden="true">
                  {item.mark}
                </span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <main
          className={`workspace${route === "home" ? " is-home" : route === "settings" ? " is-settings" : ""}`}
          id="main-content"
        >
          {route === "home" ? null : (
            <header className="workspace-header">
              <h1>{activeNavigationItem.label}</h1>
              <p className="workspace-description">{activeNavigationItem.description}</p>
            </header>
          )}
          {route === "home" && <Home onNavigate={navigate} />}
          {route === "history" && (
            <RecordBrowser
              kind="history"
              onManageHistory={() => navigate("settings")}
              offerUndo={offerUndo}
              readerBridge={readerBridge}
            />
          )}
          {route === "favorites" && (
            <RecordBrowser
              kind="favorites"
              offerUndo={offerUndo}
              readerBridge={readerBridge}
            />
          )}
          {route === "settings" && <Settings />}
        </main>
      </div>
      {undoAction ? (
        <UndoNotice
          isUndoing={isUndoing}
          key={undoAction.id}
          message={undoAction.message}
          onExpire={() => setUndoAction((current) => (current?.id === undoAction.id ? undefined : current))}
          onUndo={() => void runUndo()}
        />
      ) : null}
      {undoError ? (
        <div className="global-action-error" role="alert">
          <span>{undoError}</span>
          <button className="text-action" onClick={() => setUndoError("")} type="button">
            关闭
          </button>
        </div>
      ) : null}
    </>
  );
}

function useAppDependencies(): ReaderWindowAppProps {
  const dependencies = useContext(AppDependenciesContext);
  if (!dependencies) throw new Error("ReaderWindowApp dependencies are missing.");
  return dependencies;
}

function Home({ onNavigate }: { onNavigate: (route: AppRoute) => void }): ReactElement {
  const { readerBridge } = useAppDependencies();
  const workspace = useMemo(() => new HomeWorkspace(readerBridge), [readerBridge]);
  const snapshot = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot);
  const settings = snapshot.setup.status === "ready" ? snapshot.setup.value.settings : undefined;

  useEffect(() => {
    workspace.start();
    return () => workspace.dispose();
  }, [workspace]);

  const resolveSetupBlocker = async (): Promise<void> => {
    const route = await workspace.runRecovery();
    if (route) onNavigate(route);
  };

  return (
    <section className="home-dashboard" aria-labelledby="home-title">
      <div className="command-panel">
        <div className="command-copy">
          <h2 id="home-title">朗读当前选区</h2>
          <p className="command-description">
            优先读取前台 App 选区，选区为空时使用剪贴板。文本会发送到 MiniMax；完整历史仅存本机，不保存音频。
          </p>
          <div className="command-actions">
            <button
              className="primary-action"
              disabled={!snapshot.canPlay || snapshot.pending.playback}
              onClick={() => void workspace.playReadingTarget()}
              type="button"
            >
              {snapshot.pending.playback ? "读取中" : "播放"}
            </button>
            <div className="home-status-line">
              {snapshot.showShortcutStatus ? (
                <span
                  aria-label={
                    settings?.shortcutRegistrationError
                      ? `${settings.activationShortcut} 快捷键不可用`
                      : `${settings?.activationShortcut ?? DEFAULT_ACTIVATION_SHORTCUT} 开始朗读，Esc 停止`
                  }
                  className="shortcut-status"
                >
                  <kbd>{settings?.activationShortcut ?? DEFAULT_ACTIVATION_SHORTCUT}</kbd>
                  {settings?.shortcutRegistrationError ? (
                    <span>快捷键不可用</span>
                  ) : (
                    <>
                      <span>朗读</span>
                      <span aria-hidden="true">·</span>
                      <kbd>Esc</kbd>
                      <span>停止</span>
                    </>
                  )}
                </span>
              ) : (
                <span className="playback-status" role="status">
                  {snapshot.statusLabel}
                </span>
              )}
              {snapshot.recoveryAction ? (
                <button
                  className="setup-action"
                  disabled={snapshot.pending.setup}
                  onClick={() => void resolveSetupBlocker()}
                  type="button"
                >
                  {snapshot.pending.setup ? "处理中" : snapshot.recoveryAction.label}
                </button>
              ) : null}
              {snapshot.showShortcutStatus && settings?.shortcutRegistrationError ? (
                <button className="text-action" onClick={() => onNavigate("settings")} type="button">
                  修复快捷键
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {(settings?.voices.length ?? 0) > 0 ? (
        <details className="home-options">
          <summary>
            <span>朗读选项</span>
            <span className="home-options-summary">
              {snapshot.activeLanguageLabel} · {snapshot.selectedVoice?.display_name ?? "选择 Voice"}
            </span>
          </summary>
          <div className="home-options-body">
            <div className="language-tabs" role="group" aria-label="语言组">
              {snapshot.availableLanguageGroups.map((group) => (
                <button
                  aria-pressed={snapshot.activeLanguage === group.language}
                  className={snapshot.activeLanguage === group.language ? "tab is-active" : "tab"}
                  key={group.language}
                  onClick={() => workspace.selectLanguage(group.language)}
                  type="button"
                >
                  {group.label}
                </button>
              ))}
            </div>
            {snapshot.voices.length ? (
              <label className="field-label home-voice-field">
                Voice
                <select
                  className="voice-select"
                  onChange={(event) => workspace.selectPreferredVoice(event.target.value)}
                  value={snapshot.selectedVoice?.voice_id ?? ""}
                >
                  {snapshot.voices.map((voice) => (
                    <option key={voice.voice_id} value={voice.voice_id}>
                      {voice.display_name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="muted home-options-empty">当前语言没有可用 Voice。</p>
            )}
          </div>
        </details>
      ) : null}
    </section>
  );
}


function UndoNotice({
  isUndoing,
  message,
  onExpire,
  onUndo
}: {
  isUndoing: boolean;
  message: string;
  onExpire: () => void;
  onUndo: () => void;
}): ReactElement {
  const remainingMs = useRef(DELETION_UNDO_WINDOW_MS);
  const onExpireRef = useRef(onExpire);
  const [hasFocus, setHasFocus] = useState(false);
  const [hasPointer, setHasPointer] = useState(false);
  const [windowIsBlurred, setWindowIsBlurred] = useState(false);
  const isPaused = hasFocus || hasPointer || windowIsBlurred;

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const pauseForWindow = (): void => setWindowIsBlurred(true);
    const resumeForWindow = (): void => setWindowIsBlurred(false);
    window.addEventListener("blur", pauseForWindow);
    window.addEventListener("focus", resumeForWindow);
    return () => {
      window.removeEventListener("blur", pauseForWindow);
      window.removeEventListener("focus", resumeForWindow);
    };
  }, []);

  useEffect(() => {
    if (isPaused || remainingMs.current <= 0) return undefined;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => onExpireRef.current(), remainingMs.current);
    return () => {
      window.clearTimeout(timer);
      remainingMs.current = Math.max(0, remainingMs.current - (Date.now() - startedAt));
    };
  }, [isPaused]);

  return (
    <div
      className="undo-notice"
      onBlur={() => setHasFocus(false)}
      onFocus={() => setHasFocus(true)}
      onMouseEnter={() => setHasPointer(true)}
      onMouseLeave={() => setHasPointer(false)}
    >
      <span aria-live="polite" role="status">
        {message}
      </span>
      <button disabled={isUndoing} onClick={onUndo} type="button">
        {isUndoing ? "正在撤销" : "撤销"}
      </button>
    </div>
  );
}

function Settings(): ReactElement {
  const { readerBridge } = useAppDependencies();
  const workspace = useMemo(() => new SettingsWorkspace(readerBridge), [readerBridge]);
  const snapshot = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot);
  const retentionSelect = useRef<HTMLSelectElement | null>(null);
  const retentionCancelButton = useRef<HTMLButtonElement | null>(null);
  const clearHistoryButton = useRef<HTMLButtonElement | null>(null);
  const clearHistoryCancelButton = useRef<HTMLButtonElement | null>(null);
  const settings = snapshot.settings.status === "ready" ? snapshot.settings.value : undefined;
  const hasApiKey = snapshot.miniMaxCredential.status === "ready" && snapshot.miniMaxCredential.value;
  const errorLogCount = snapshot.errorLogCount.status === "ready" ? snapshot.errorLogCount.value : 0;
  const readingHistoryCount =
    snapshot.readingHistoryCount.status === "ready" ? snapshot.readingHistoryCount.value : 0;
  const isCheckingRetention = snapshot.visit.retentionPhase === "checking";
  const isApplyingRetention = snapshot.visit.retentionPhase === "applying";

  useEffect(() => {
    workspace.start();
    return () => workspace.dispose();
  }, [workspace]);

  useEffect(() => {
    if (snapshot.visit.retentionImpact) retentionCancelButton.current?.focus();
  }, [snapshot.visit.retentionImpact]);

  useEffect(() => {
    if (snapshot.visit.confirmClearHistory) clearHistoryCancelButton.current?.focus();
  }, [snapshot.visit.confirmClearHistory]);

  useEffect(() => {
    if (!snapshot.visit.isRecordingShortcut) return undefined;
    const recordShortcut = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        workspace.cancelShortcutRecording();
        return;
      }
      const shortcut = acceleratorFromKeyboardEvent(event);
      if (!shortcut) {
        workspace.rejectShortcutCandidate();
        return;
      }
      void workspace.recordActivationShortcut(shortcut);
    };
    window.addEventListener("keydown", recordShortcut, true);
    return () => window.removeEventListener("keydown", recordShortcut, true);
  }, [snapshot.visit.isRecordingShortcut, workspace]);

  const cancelRetentionChange = (): void => {
    workspace.cancelRetentionChange();
    window.setTimeout(() => retentionSelect.current?.focus());
  };

  const cancelClearReadingHistory = (): void => {
    workspace.cancelClearHistory();
    window.setTimeout(() => clearHistoryButton.current?.focus());
  };

  const currentSpeechRate = snapshot.presentation.speechRate;
  const speechRateProgress = ((currentSpeechRate - 0.5) / 2.5) * 100;
  const modelSelectValue = snapshot.visit.customModelSelected
    ? "custom"
    : settings?.model ?? MODEL_OPTIONS[0]?.id ?? "speech-2.8-turbo";

  return (
    <section aria-busy={snapshot.settings.status === "loading"} aria-label="设置" className="settings-layout">
      {snapshot.settings.status === "error" ? (
        <div className="inline-error" role="alert">
          <p>无法读取设置</p>
          <button className="text-action" onClick={() => workspace.retrySettings()} type="button">
            重试设置
          </button>
        </div>
      ) : null}
      {SETTINGS_GROUPS.map((group) => (
        <section aria-labelledby={SETTINGS_GROUP_IDS[group]} className="settings-section" key={group}>
          <div className="settings-heading">
            <h2 id={SETTINGS_GROUP_IDS[group]}>{group}</h2>
            <p>{SETTINGS_GROUP_DESCRIPTIONS[group]}</p>
          </div>
          {group === "账户与连接" && (
            <div className="settings-stack">
              <div className="settings-meta-row">
                <span>
                  API Key 状态：
                  {snapshot.miniMaxCredential.status === "loading"
                    ? "正在读取"
                    : snapshot.miniMaxCredential.status === "error"
                      ? "—"
                      : !hasApiKey
                        ? "未保存"
                        : settings
                          ? apiKeyStatusLabel(settings.apiKeyStatus)
                          : "已保存，验证状态不可用"}
                </span>
                <span>Voice 缓存：{settings ? `${settings.voices.length} 个` : "—"}</span>
              </div>
              {snapshot.miniMaxCredential.status === "error" ? (
                <div className="inline-error" role="alert">
                  <span>API Key 状态读取失败</span>
                  <button className="text-action" onClick={() => workspace.retryMiniMaxCredential()} type="button">
                    重试 API Key 状态
                  </button>
                </div>
              ) : null}
              {settings?.apiKeyError && (
                <p className="inline-error" role="alert">
                  {settings.apiKeyError}
                </p>
              )}
              {settings?.voiceRefreshError && (
                <p className="inline-error" role="alert">
                  {settings.voiceRefreshError}
                </p>
              )}
              {snapshot.visit.feedback.setup && (
                <p className="inline-note" role="status">
                  {snapshot.visit.feedback.setup}
                </p>
              )}
              <div className="setting-field-row">
                <label className="field-label settings-wide-field">
                  MiniMax API Key
                  <input
                    disabled={!snapshot.canWrite || snapshot.pending.account}
                    onChange={(event) => workspace.updateApiKeyDraft(event.target.value)}
                    placeholder="输入后会保存到本机 SQLite"
                    type="password"
                    value={snapshot.visit.apiKeyDraft}
                  />
                </label>
                <button
                  className="secondary-action"
                  disabled={!snapshot.canWrite || snapshot.pending.account || !snapshot.visit.apiKeyDraft.trim()}
                  onClick={() => void workspace.saveApiKey()}
                  type="button"
                >
                  保存 API Key
                </button>
              </div>
              <div className="button-row">
                <button className="secondary-action" disabled={!snapshot.canWrite || !hasApiKey || snapshot.pending.account} onClick={() => void workspace.verifyApiKey()} type="button">
                  验证连接
                </button>
                <button className="secondary-action" disabled={!snapshot.canWrite || !hasApiKey || snapshot.pending.account} onClick={() => void workspace.refreshVoices()} type="button">
                  刷新 Voice
                </button>
                <button className="text-action" disabled={!snapshot.canWrite || !hasApiKey || snapshot.pending.account} onClick={() => void workspace.clearApiKey()} type="button">
                  清除 API Key
                </button>
              </div>
            </div>
          )}
          {group === "快捷键" && (
            <div className="settings-stack">
              <p className="muted">开始朗读：{settings?.activationShortcut ?? DEFAULT_ACTIVATION_SHORTCUT}</p>
              <div className="button-row shortcut-setting-row">
                <button
                  className={snapshot.visit.isRecordingShortcut ? "shortcut-recorder is-recording" : "shortcut-recorder"}
                  disabled={!snapshot.canWrite || snapshot.pending.shortcut}
                  onClick={() => workspace.beginShortcutRecording()}
                  type="button"
                >
                  {snapshot.visit.isRecordingShortcut
                    ? "按下新的组合键"
                    : settings?.activationShortcut ?? DEFAULT_ACTIVATION_SHORTCUT}
                </button>
                <button
                  className="text-action"
                  disabled={!snapshot.canWrite || snapshot.pending.shortcut}
                  onClick={() => void workspace.setActivationShortcut(DEFAULT_ACTIVATION_SHORTCUT)}
                  type="button"
                >
                  恢复默认快捷键
                </button>
              </div>
              {settings?.shortcutRegistrationError ? (
                <p className="inline-error" role="alert">
                  {settings.shortcutRegistrationError}
                </p>
              ) : (
                <p className="inline-note" role="status">
                  {snapshot.visit.feedback.shortcut || (settings ? "开始朗读快捷键可用" : "正在读取快捷键")}
                </p>
              )}
              <p className="muted">
                胶囊只显示朗读状态和估算进度，不会拦截鼠标操作。若 Esc 不可用，可从菜单栏停止朗读。
              </p>
            </div>
          )}
          {group === "朗读" && (
            <div className="settings-stack">
              <label className="field-label">
                语速
                <div className="range-row">
                  <input
                    aria-valuetext={`${currentSpeechRate.toFixed(1)} 倍`}
                    className="range-control"
                    disabled={!snapshot.canWrite}
                    max="3"
                    min="0.5"
                    onChange={(event) => workspace.updateSpeechRate(Number(event.target.value))}
                    step="0.1"
                    style={{ "--range-progress": `${speechRateProgress}%` } as CSSProperties}
                    type="range"
                    value={currentSpeechRate}
                  />
                  <span aria-hidden="true">{currentSpeechRate.toFixed(1)}x</span>
                </div>
              </label>
              {snapshot.visit.feedback.speechRate ? (
                <p className="inline-error" role="alert">{snapshot.visit.feedback.speechRate}</p>
              ) : null}
              <label className="field-label">
                Model
                <select
                  className="voice-select"
                  disabled={!snapshot.canWrite || snapshot.pending.model}
                  onChange={(event) => void workspace.selectModel(event.target.value)}
                  value={modelSelectValue}
                >
                  {MODEL_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label} · {option.id}
                    </option>
                  ))}
                  <option value="custom">自定义 Model ID</option>
                </select>
              </label>
              {modelSelectValue === "custom" && (
                <div className="setting-field-row">
                  <label className="field-label settings-wide-field">
                    自定义 Model ID
                    <input
                      disabled={!snapshot.canWrite || snapshot.pending.model}
                      onChange={(event) => workspace.updateCustomModelDraft(event.target.value)}
                      placeholder="例如 speech-2.8-turbo"
                      type="text"
                      value={snapshot.visit.customModelDraft}
                    />
                  </label>
                  <button
                    className="secondary-action"
                    disabled={!snapshot.canWrite || snapshot.pending.model || !snapshot.visit.customModelDraft.trim()}
                    onClick={() => void workspace.saveCustomModel()}
                    type="button"
                  >
                    保存 Model
                  </button>
                </div>
              )}
              {snapshot.visit.feedback.model ? (
                <p className="inline-error" role="alert">{snapshot.visit.feedback.model}</p>
              ) : null}
              <p className="muted">保存 Model 时不做可用性验证；朗读失败会留下一条不含正文的错误记录。</p>
            </div>
          )}
          {group === "历史记录" && (
            <div className="settings-stack">
              <div className="settings-meta-row">
                <span>当前保留期限：{historyRetentionLabel(settings?.historyRetention ?? "1m")}</span>
                <span>
                  当前历史记录：
                  {snapshot.readingHistoryCount.status === "loading"
                    ? "正在读取"
                    : snapshot.readingHistoryCount.status === "error"
                      ? "—"
                      : `${readingHistoryCount} 条`}
                </span>
              </div>
              {snapshot.readingHistoryCount.status === "error" ? (
                <div className="inline-error" role="alert">
                  <span>历史记录数量读取失败</span>
                  <button className="text-action" onClick={() => workspace.retryReadingHistoryCount()} type="button">
                    重试历史记录数量
                  </button>
                </div>
              ) : null}
              <label className="field-label">
                保留期限
                <select
                  aria-busy={isCheckingRetention || isApplyingRetention}
                  className="voice-select"
                  onChange={(event) =>
                    void workspace.requestRetentionChange(event.target.value as HistoryRetention)
                  }
                  disabled={!settings || isApplyingRetention}
                  ref={retentionSelect}
                  value={snapshot.visit.retentionDraft}
                >
                  <option value="7d">7 天</option>
                  <option value="1m">1 个月</option>
                  <option value="3m">3 个月</option>
                  <option value="forever">永久</option>
                </select>
              </label>
              {isCheckingRetention ? (
                <p className="inline-note" role="status">
                  正在计算保留期限的影响…
                </p>
              ) : null}
              {snapshot.visit.retentionImpact ? (
                <div
                  aria-label="确认保留期限变更"
                  className="destructive-confirmation"
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      event.stopPropagation();
                      cancelRetentionChange();
                    }
                  }}
                  role="group"
                >
                  <p>
                    改为{historyRetentionLabel(snapshot.visit.retentionImpact.historyRetention)}后，将删除{" "}
                    <strong>{snapshot.visit.retentionImpact.deleteCount}</strong> 条超期历史记录，保留{" "}
                    <strong>{snapshot.visit.retentionImpact.remainingCount}</strong> 条。收藏不会受影响。
                  </p>
                  <div className="button-row">
                    <button
                      className="danger-action"
                      disabled={!snapshot.canWrite || isApplyingRetention || isCheckingRetention}
                      onClick={() => void workspace.confirmRetentionChange()}
                      type="button"
                    >
                      {isApplyingRetention ? "正在应用" : `应用并删除 ${snapshot.visit.retentionImpact.deleteCount} 条`}
                    </button>
                    <button
                      className="text-action"
                      disabled={isApplyingRetention}
                      onClick={cancelRetentionChange}
                      ref={retentionCancelButton}
                      type="button"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="settings-danger-zone">
                <p className="muted">
                  历史全文和收藏全文只保存在本机，不保存音频；当前朗读文本会发送给 MiniMax 生成语音。
                </p>
                {snapshot.visit.confirmClearHistory ? (
                  <div
                    aria-label="确认清空历史记录"
                    className="destructive-confirmation"
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        cancelClearReadingHistory();
                      }
                    }}
                    role="group"
                  >
                    <p>
                      清空全部 <strong>{readingHistoryCount}</strong> 条历史记录？收藏不会受影响。
                    </p>
                    <div className="button-row">
                      <button
                        className="danger-action"
                        disabled={!snapshot.canWrite || snapshot.pending.clearHistory}
                        onClick={() => void workspace.clearReadingHistory()}
                        type="button"
                      >
                        {snapshot.pending.clearHistory ? "正在清空" : `清空 ${readingHistoryCount} 条`}
                      </button>
                      <button
                        className="text-action"
                        disabled={snapshot.pending.clearHistory}
                        onClick={cancelClearReadingHistory}
                        ref={clearHistoryCancelButton}
                        type="button"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="secondary-action"
                    disabled={!snapshot.canWrite || snapshot.readingHistoryCount.status !== "ready" || !readingHistoryCount || isApplyingRetention}
                    onClick={() => workspace.requestClearHistoryConfirmation()}
                    ref={clearHistoryButton}
                    type="button"
                  >
                    清空历史记录
                  </button>
                )}
              </div>
              {snapshot.visit.feedback.historyAction ? (
                <p className="inline-note" role="status">
                  {snapshot.visit.feedback.historyAction}
                </p>
              ) : null}
              {snapshot.visit.feedback.historyError ? (
                <p className="inline-error" role="alert">
                  {snapshot.visit.feedback.historyError}
                </p>
              ) : null}
            </div>
          )}
          {group === "通用" && (
            <div className="settings-stack">
              <div className="button-row">
                <button className="secondary-action" disabled={!snapshot.canWrite || snapshot.pending.launchAtLogin} onClick={() => void workspace.setLaunchAtLogin(!settings?.launchAtLogin)} type="button">
                  {settings?.launchAtLogin ? "关闭登录时启动" : "开启登录时启动"}
                </button>
              </div>
              {snapshot.visit.feedback.launchAtLogin ? (
                <p className="inline-error" role="alert">{snapshot.visit.feedback.launchAtLogin}</p>
              ) : null}
              <div className="log-count">
                <span>
                  错误记录：
                  {snapshot.errorLogCount.status === "loading"
                    ? "正在读取"
                    : snapshot.errorLogCount.status === "error"
                      ? "—"
                      : errorLogCount}
                </span>
                {snapshot.errorLogCount.status === "error" ? (
                  <button className="text-action" onClick={() => workspace.retryErrorLogCount()} type="button">
                    重试错误记录数量
                  </button>
                ) : (
                  <button className="text-action" disabled={!snapshot.canWrite || !errorLogCount || snapshot.pending.errorLog} onClick={() => void workspace.clearErrorLog()} type="button">
                    清空
                  </button>
                )}
              </div>
              {snapshot.visit.feedback.errorLog ? (
                <p className="inline-error" role="alert">{snapshot.visit.feedback.errorLog}</p>
              ) : null}
            </div>
          )}
        </section>
      ))}
    </section>
  );
}

function apiKeyStatusLabel(status: AppSettings["apiKeyStatus"] | undefined): string {
  if (status === "verified") return "已验证";
  if (status === "failed") return "待验证";
  return "未配置";
}

function acceleratorFromKeyboardEvent(event: KeyboardEvent): string | undefined {
  const key = normalizeAcceleratorKey(event.key);
  if (!key) return undefined;
  const modifiers = [
    event.metaKey ? "Command" : undefined,
    event.altKey ? "Option" : undefined,
    event.ctrlKey ? "Control" : undefined,
    event.shiftKey ? "Shift" : undefined
  ].filter((part): part is string => Boolean(part));
  if (!modifiers.length) return undefined;
  return [...modifiers, key].join("+");
}

function normalizeAcceleratorKey(key: string): string | undefined {
  if (["Meta", "Shift", "Alt", "Control"].includes(key)) return undefined;
  if (key.length === 1) return key.toUpperCase();
  const map: Record<string, string> = {
    " ": "Space",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Escape: "Esc",
    Enter: "Return",
    Backspace: "Backspace",
    Delete: "Delete",
    Tab: "Tab"
  };
  return map[key] ?? key;
}
