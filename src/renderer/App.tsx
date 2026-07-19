import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import type {
  AppRoute,
  AppSettings,
  ReaderWindowRoleBridge,
  RouteSnapshot
} from "./bridge.js";
import { DEFAULT_ACTIVATION_SHORTCUT } from "../shared/app-contracts.js";
import type { HistoryRetention, HistoryRetentionImpact } from "../shared/app-contracts.js";
import type { DetectedLanguage, MiniMaxVoice } from "../shared/types.js";
import { MODEL_OPTIONS } from "../shared/models.js";
import { historyRetentionLabel } from "./history-retention.js";
import { RecordBrowser, type RecordUndoRequest } from "./record-browser.js";

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

const LANGUAGE_GROUPS: Array<{ language: DetectedLanguage; label: string }> = [
  { language: "zh", label: "中文" },
  { language: "en", label: "英文" },
  { language: "ja", label: "日文" },
  { language: "ko", label: "韩文" },
  { language: "latin", label: "其他拉丁语" },
  { language: "unknown", label: "未知" }
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

const DEFAULT_HOME_PLAYBACK_MESSAGE = "准备朗读当前选区";

type SetupRecoveryAction =
  | { kind: "open-settings"; label: string }
  | { kind: "retry-setup"; label: string }
  | { kind: "verify-key"; label: string }
  | { kind: "refresh-voices"; label: string };

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
  const [settings, setSettings] = useState<AppSettings | undefined>();
  const [hasApiKey, setHasApiKey] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<DetectedLanguage>("zh");
  const [playbackMessage, setPlaybackMessage] = useState(DEFAULT_HOME_PLAYBACK_MESSAGE);
  const [isLoadingSetup, setIsLoadingSetup] = useState(true);
  const [isStartingPlayback, setIsStartingPlayback] = useState(false);
  const [isResolvingSetup, setIsResolvingSetup] = useState(false);

  const loadSetup = useCallback(async (): Promise<void> => {
    setIsLoadingSetup(true);
    try {
      const [nextSettings, nextHasApiKey] = await Promise.all([
        readerBridge.getSettings(),
        readerBridge.hasMiniMaxApiKey()
      ]);
      setSettings(nextSettings);
      setHasApiKey(nextHasApiKey);
      setPlaybackMessage(DEFAULT_HOME_PLAYBACK_MESSAGE);
    } catch {
      setSettings(undefined);
      setHasApiKey(false);
      setPlaybackMessage("无法读取朗读配置");
    } finally {
      setIsLoadingSetup(false);
    }
  }, [readerBridge]);

  useEffect(() => {
    void loadSetup();
  }, [loadSetup]);

  const availableLanguageGroups = LANGUAGE_GROUPS.filter(
    (group) => voicesForLanguage(settings?.voices ?? [], group.language).length > 0
  );
  const activeLanguage = availableLanguageGroups.some((group) => group.language === selectedLanguage)
    ? selectedLanguage
    : availableLanguageGroups[0]?.language ?? selectedLanguage;
  const voices = voicesForLanguage(settings?.voices ?? [], activeLanguage);
  const preferredVoice = settings?.preferredVoicesByLanguage[activeLanguage] ?? "";
  const selectedVoice = voices.find((voice) => voice.voice_id === preferredVoice) ?? voices[0];
  const selectedLanguageLabel = LANGUAGE_GROUPS.find((group) => group.language === activeLanguage)?.label ?? "未知";

  const savePreferredVoice = async (voiceId: string): Promise<void> => {
    const next = await readerBridge.setPreferredVoice(activeLanguage, voiceId);
    setSettings(next);
  };
  const canPlay = Boolean(hasApiKey && settings?.apiKeyStatus === "verified" && settings.voices.length);
  const setupRecoveryAction = isLoadingSetup ? undefined : getSetupRecoveryAction(hasApiKey, settings);
  const hasPlaybackFeedback = playbackMessage !== DEFAULT_HOME_PLAYBACK_MESSAGE;
  const showShortcutStatus = Boolean(!isLoadingSetup && canPlay && !hasPlaybackFeedback);
  const statusLabel = isLoadingSetup
    ? "正在检查朗读配置"
    : !settings
      ? playbackMessage
      : hasPlaybackFeedback
        ? playbackMessage
        : canPlay
          ? ""
          : setupBlockerLabel(hasApiKey, settings);

  const playReadingTarget = async (): Promise<void> => {
    if (isStartingPlayback) return;
    setIsStartingPlayback(true);
    setPlaybackMessage("正在读取选区");
    try {
      const result = await readerBridge.playReadingTarget();
      if (result.started) {
        setPlaybackMessage(
          result.stopShortcutAvailable === false
            ? "已开始朗读；Esc 不可用，请从菜单栏停止"
            : "已开始朗读"
        );
      } else {
        setPlaybackMessage(playbackSkippedLabel(result.skipped));
      }
    } catch {
      setPlaybackMessage("朗读未开始，请检查连接和朗读设置后重试");
    } finally {
      setIsStartingPlayback(false);
    }
  };

  const resolveSetupBlocker = async (): Promise<void> => {
    if (!setupRecoveryAction || isResolvingSetup) return;
    if (setupRecoveryAction.kind === "open-settings") {
      onNavigate("settings");
      return;
    }
    setIsResolvingSetup(true);
    try {
      if (setupRecoveryAction.kind === "retry-setup") {
        await loadSetup();
        return;
      }
      if (setupRecoveryAction.kind === "verify-key") {
        setPlaybackMessage("正在验证连接");
        const result = await readerBridge.verifyMiniMaxKey();
        setSettings(result.settings);
        setHasApiKey(await readerBridge.hasMiniMaxApiKey());
        setPlaybackMessage(result.ok ? "连接验证成功" : result.error ?? "连接验证失败");
        return;
      }
      if (setupRecoveryAction.kind === "refresh-voices") {
        setPlaybackMessage("正在刷新 Voice");
        const result = await readerBridge.refreshVoices();
        setSettings(result.settings);
        setPlaybackMessage(
          result.usedCachedVoices
            ? `刷新失败，继续使用本地 Voice 缓存：${result.error}`
            : result.ok
              ? "Voice 列表已刷新"
              : result.error ?? "Voice 列表刷新失败"
        );
      }
    } catch {
      setPlaybackMessage("处理失败，请前往设置重试");
    } finally {
      setIsResolvingSetup(false);
    }
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
              disabled={!canPlay || isStartingPlayback}
              onClick={playReadingTarget}
              type="button"
            >
              {isStartingPlayback ? "读取中" : "播放"}
            </button>
            <div className="home-status-line">
              {showShortcutStatus ? (
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
                  {statusLabel}
                </span>
              )}
              {setupRecoveryAction ? (
                <button
                  className="setup-action"
                  disabled={isResolvingSetup}
                  onClick={resolveSetupBlocker}
                  type="button"
                >
                  {isResolvingSetup ? "处理中" : setupRecoveryAction.label}
                </button>
              ) : null}
              {showShortcutStatus && settings?.shortcutRegistrationError ? (
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
              {selectedLanguageLabel} · {selectedVoice?.display_name ?? "选择 Voice"}
            </span>
          </summary>
          <div className="home-options-body">
            <div className="language-tabs" role="group" aria-label="语言组">
              {availableLanguageGroups.map((group) => (
                <button
                  aria-pressed={activeLanguage === group.language}
                  className={activeLanguage === group.language ? "tab is-active" : "tab"}
                  key={group.language}
                  onClick={() => setSelectedLanguage(group.language)}
                  type="button"
                >
                  {group.label}
                </button>
              ))}
            </div>
            {voices.length ? (
              <label className="field-label home-voice-field">
                Voice
                <select
                  className="voice-select"
                  onChange={(event) => void savePreferredVoice(event.target.value)}
                  value={selectedVoice?.voice_id ?? ""}
                >
                  {voices.map((voice) => (
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

function getSetupRecoveryAction(hasApiKey: boolean, settings: AppSettings | undefined): SetupRecoveryAction | undefined {
  if (!settings) return { kind: "retry-setup", label: "重试" };
  if (!hasApiKey) return { kind: "open-settings", label: "去设置 API Key" };
  if (settings.apiKeyStatus !== "verified") return { kind: "verify-key", label: "验证连接" };
  if (!settings.voices.length) return { kind: "refresh-voices", label: "刷新 Voice" };
  return undefined;
}

function Settings(): ReactElement {
  const { readerBridge } = useAppDependencies();
  const [settings, setSettings] = useState<AppSettings | undefined>();
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [customModelDraft, setCustomModelDraft] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [errorLogCount, setErrorLogCount] = useState(0);
  const [readingHistoryCount, setReadingHistoryCount] = useState(0);
  const [retentionDraft, setRetentionDraft] = useState<HistoryRetention>("1m");
  const [retentionImpact, setRetentionImpact] = useState<HistoryRetentionImpact | undefined>();
  const [isCheckingRetention, setIsCheckingRetention] = useState(false);
  const [isApplyingRetention, setIsApplyingRetention] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [historyActionMessage, setHistoryActionMessage] = useState("");
  const [historyActionError, setHistoryActionError] = useState("");
  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false);
  const [shortcutMessage, setShortcutMessage] = useState("");
  const [setupMessage, setSetupMessage] = useState("");
  const retentionPreviewGeneration = useRef(0);
  const retentionSelect = useRef<HTMLSelectElement | null>(null);
  const retentionCancelButton = useRef<HTMLButtonElement | null>(null);
  const clearHistoryButton = useRef<HTMLButtonElement | null>(null);
  const clearHistoryCancelButton = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    void refreshSettings();
  }, []);

  useEffect(() => {
    if (retentionImpact) retentionCancelButton.current?.focus();
  }, [retentionImpact]);

  useEffect(() => {
    if (confirmClearHistory) clearHistoryCancelButton.current?.focus();
  }, [confirmClearHistory]);

  useEffect(() => {
    if (!isRecordingShortcut) return undefined;
    const recordShortcut = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setIsRecordingShortcut(false);
        setShortcutMessage("未更改开始朗读快捷键");
        return;
      }
      const shortcut = acceleratorFromKeyboardEvent(event);
      if (!shortcut) {
        setShortcutMessage("请按下包含修饰键的组合键");
        return;
      }
      setIsRecordingShortcut(false);
      void saveActivationShortcut(shortcut);
    };
    window.addEventListener("keydown", recordShortcut, true);
    return () => window.removeEventListener("keydown", recordShortcut, true);
  }, [isRecordingShortcut, settings]);

  const refreshSettings = async (): Promise<void> => {
    const [nextSettings, nextHasApiKey, nextErrorLogCount, nextReadingHistoryCount] = await Promise.all([
      readerBridge.getSettings(),
      readerBridge.hasMiniMaxApiKey(),
      readerBridge.getErrorLogCount(),
      readerBridge.getReadingHistoryCount()
    ]);
    setSettings(nextSettings);
    setHasApiKey(nextHasApiKey);
    setErrorLogCount(nextErrorLogCount);
    setReadingHistoryCount(nextReadingHistoryCount);
    setRetentionDraft(nextSettings.historyRetention);
    if (!isBuiltInModel(nextSettings.model)) setCustomModelDraft(nextSettings.model);
  };

  const saveApiKey = async (): Promise<void> => {
    await readerBridge.setMiniMaxApiKey(apiKeyDraft);
    setApiKeyDraft("");
    setSetupMessage("API Key 已保存到本机 SQLite，等待验证");
    await refreshSettings();
  };

  const clearApiKey = async (): Promise<void> => {
    await readerBridge.clearMiniMaxApiKey();
    setSetupMessage("API Key 已清除");
    await refreshSettings();
  };

  const verifyApiKey = async (): Promise<void> => {
    const result = await readerBridge.verifyMiniMaxKey();
    setSetupMessage(result.ok ? "连接验证成功" : result.error ?? "连接验证失败");
    setSettings(result.settings);
    setHasApiKey(await readerBridge.hasMiniMaxApiKey());
  };

  const refreshVoices = async (): Promise<void> => {
    const result = await readerBridge.refreshVoices();
    setSetupMessage(
      result.usedCachedVoices
        ? `刷新失败，继续使用本地 Voice 缓存：${result.error}`
        : result.ok
          ? "Voice 列表已刷新"
          : result.error ?? "Voice 列表刷新失败"
    );
    setSettings(result.settings);
  };

  const toggleLaunchAtLogin = async (): Promise<void> => {
    const next = await readerBridge.setLaunchAtLogin(!settings?.launchAtLogin);
    setSettings(next);
  };

  const saveActivationShortcut = async (shortcut: string): Promise<void> => {
    const result = await readerBridge.setActivationShortcut(shortcut);
    setSettings(result.settings);
    setShortcutMessage(result.ok ? "开始朗读快捷键已更新" : result.error ?? "无法使用这个快捷键");
  };

  const updateSpeechRate = async (speechRate: number): Promise<void> => {
    const next = await readerBridge.setSpeechRate(speechRate);
    setSettings(next);
  };

  const updateModel = async (model: string): Promise<void> => {
    if (model === "custom") {
      if (!customModelDraft && settings?.model && !isBuiltInModel(settings.model)) {
        setCustomModelDraft(settings.model);
      }
      return;
    }
    const next = await readerBridge.setModel(model);
    setSettings(next);
  };

  const saveCustomModel = async (): Promise<void> => {
    const model = customModelDraft.trim();
    if (!model) return;
    const next = await readerBridge.setModel(model);
    setSettings(next);
  };

  const clearErrorLog = async (): Promise<void> => {
    await readerBridge.clearErrorLog();
    setErrorLogCount(0);
  };

  const applyRetention = async (
    historyRetention: HistoryRetention,
    expectedDeleteCount: number
  ): Promise<void> => {
    setIsApplyingRetention(true);
    setHistoryActionError("");
    try {
      const result = await readerBridge.applyReadingHistoryRetention(historyRetention, expectedDeleteCount);
      if (!result.applied) {
        setRetentionImpact(result.impact);
        setReadingHistoryCount(result.impact.deleteCount + result.impact.remainingCount);
        setHistoryActionMessage("历史记录数量已变化，请按最新数量再次确认。");
        return;
      }
      setSettings(result.settings);
      setRetentionDraft(result.settings.historyRetention);
      setRetentionImpact(undefined);
      setReadingHistoryCount(result.impact.remainingCount);
      setConfirmClearHistory(false);
      setHistoryActionMessage(
        result.impact.deleteCount
          ? `保留期限已改为${historyRetentionLabel(result.settings.historyRetention)}，已删除 ${result.impact.deleteCount} 条超期历史记录。收藏未受影响。`
          : `保留期限已改为${historyRetentionLabel(result.settings.historyRetention)}。已删除的历史记录不会恢复。`
      );
    } catch {
      setRetentionDraft(settings?.historyRetention ?? "1m");
      setHistoryActionError("保留期限更新失败，现有历史记录未变更。");
    } finally {
      setIsApplyingRetention(false);
    }
  };

  const requestRetentionChange = async (historyRetention: HistoryRetention): Promise<void> => {
    const requestGeneration = ++retentionPreviewGeneration.current;
    setRetentionDraft(historyRetention);
    setRetentionImpact(undefined);
    setConfirmClearHistory(false);
    setHistoryActionMessage("");
    setHistoryActionError("");
    if (historyRetention === settings?.historyRetention) return;

    setIsCheckingRetention(true);
    try {
      const impact = await readerBridge.previewReadingHistoryRetention(historyRetention);
      if (requestGeneration !== retentionPreviewGeneration.current) return;
      if (impact.deleteCount > 0) {
        setRetentionImpact(impact);
        return;
      }
      await applyRetention(historyRetention, 0);
    } catch {
      if (requestGeneration !== retentionPreviewGeneration.current) return;
      setRetentionDraft(settings?.historyRetention ?? "1m");
      setHistoryActionError("无法检查保留期限的影响，请稍后重试。");
    } finally {
      if (requestGeneration === retentionPreviewGeneration.current) setIsCheckingRetention(false);
    }
  };

  const confirmRetentionChange = async (): Promise<void> => {
    if (!retentionImpact) return;
    await applyRetention(retentionImpact.historyRetention, retentionImpact.deleteCount);
  };

  const cancelRetentionChange = (): void => {
    retentionPreviewGeneration.current += 1;
    setRetentionDraft(settings?.historyRetention ?? "1m");
    setRetentionImpact(undefined);
    setIsCheckingRetention(false);
    setHistoryActionMessage("已取消保留期限变更。");
    setHistoryActionError("");
    window.setTimeout(() => retentionSelect.current?.focus());
  };

  const cancelClearReadingHistory = (): void => {
    setConfirmClearHistory(false);
    setHistoryActionMessage("已取消清空历史记录。");
    setHistoryActionError("");
    window.setTimeout(() => clearHistoryButton.current?.focus());
  };

  const clearReadingHistory = async (): Promise<void> => {
    if (isClearingHistory) return;
    setIsClearingHistory(true);
    setHistoryActionMessage("");
    setHistoryActionError("");
    try {
      const clearedCount = await readerBridge.clearReadingHistory();
      setReadingHistoryCount(0);
      setConfirmClearHistory(false);
      setRetentionImpact(undefined);
      setHistoryActionMessage(`已清空 ${clearedCount} 条历史记录，收藏仍然保留。`);
    } catch {
      setHistoryActionError("清空失败，现有历史记录仍然保留。");
    } finally {
      setIsClearingHistory(false);
    }
  };

  const currentSpeechRate = settings?.speechRate ?? 1;
  const speechRateProgress = ((currentSpeechRate - 0.5) / 2.5) * 100;
  const modelSelectValue = !settings
    ? MODEL_OPTIONS[0]?.id ?? "speech-2.8-turbo"
    : isBuiltInModel(settings.model)
      ? settings.model
      : "custom";

  return (
    <section aria-busy={!settings} aria-label="设置" className="settings-layout">
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
                  {settings ? (hasApiKey ? apiKeyStatusLabel(settings.apiKeyStatus) : "未保存") : "正在读取"}
                </span>
                <span>Voice 缓存：{settings ? `${settings.voices.length} 个` : "—"}</span>
              </div>
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
              {setupMessage && (
                <p className="inline-note" role="status">
                  {setupMessage}
                </p>
              )}
              <div className="setting-field-row">
                <label className="field-label settings-wide-field">
                  MiniMax API Key
                  <input
                    onChange={(event) => setApiKeyDraft(event.target.value)}
                    placeholder="输入后会保存到本机 SQLite"
                    type="password"
                    value={apiKeyDraft}
                  />
                </label>
                <button
                  className="secondary-action"
                  disabled={!apiKeyDraft.trim()}
                  onClick={saveApiKey}
                  type="button"
                >
                  保存 API Key
                </button>
              </div>
              <div className="button-row">
                <button className="secondary-action" disabled={!hasApiKey} onClick={verifyApiKey} type="button">
                  验证连接
                </button>
                <button className="secondary-action" disabled={!hasApiKey} onClick={refreshVoices} type="button">
                  刷新 Voice
                </button>
                <button className="text-action" disabled={!hasApiKey} onClick={clearApiKey} type="button">
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
                  className={isRecordingShortcut ? "shortcut-recorder is-recording" : "shortcut-recorder"}
                  disabled={!settings}
                  onClick={() => {
                    setIsRecordingShortcut(true);
                    setShortcutMessage("请按新的开始朗读快捷键");
                  }}
                  type="button"
                >
                  {isRecordingShortcut
                    ? "按下新的组合键"
                    : settings?.activationShortcut ?? DEFAULT_ACTIVATION_SHORTCUT}
                </button>
                <button
                  className="text-action"
                  disabled={!settings}
                  onClick={() => void saveActivationShortcut(DEFAULT_ACTIVATION_SHORTCUT)}
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
                  {shortcutMessage || (settings ? "开始朗读快捷键可用" : "正在读取快捷键")}
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
                    disabled={!settings}
                    max="3"
                    min="0.5"
                    onChange={(event) => void updateSpeechRate(Number(event.target.value))}
                    step="0.1"
                    style={{ "--range-progress": `${speechRateProgress}%` } as CSSProperties}
                    type="range"
                    value={currentSpeechRate}
                  />
                  <span aria-hidden="true">{currentSpeechRate.toFixed(1)}x</span>
                </div>
              </label>
              <label className="field-label">
                Model
                <select
                  className="voice-select"
                  disabled={!settings}
                  onChange={(event) => void updateModel(event.target.value)}
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
                      onChange={(event) => setCustomModelDraft(event.target.value)}
                      placeholder="例如 speech-2.8-turbo"
                      type="text"
                      value={customModelDraft}
                    />
                  </label>
                  <button
                    className="secondary-action"
                    disabled={!customModelDraft.trim()}
                    onClick={saveCustomModel}
                    type="button"
                  >
                    保存 Model
                  </button>
                </div>
              )}
              <p className="muted">保存 Model 时不做可用性验证；朗读失败会留下一条不含正文的错误记录。</p>
            </div>
          )}
          {group === "历史记录" && (
            <div className="settings-stack">
              <div className="settings-meta-row">
                <span>当前保留期限：{historyRetentionLabel(settings?.historyRetention ?? "1m")}</span>
                <span>当前历史记录：{readingHistoryCount} 条</span>
              </div>
              <label className="field-label">
                保留期限
                <select
                  aria-busy={isCheckingRetention || isApplyingRetention}
                  className="voice-select"
                  onChange={(event) =>
                    void requestRetentionChange(event.target.value as HistoryRetention)
                  }
                  disabled={!settings || isApplyingRetention}
                  ref={retentionSelect}
                  value={retentionDraft}
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
              {retentionImpact ? (
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
                    改为{historyRetentionLabel(retentionImpact.historyRetention)}后，将删除{" "}
                    <strong>{retentionImpact.deleteCount}</strong> 条超期历史记录，保留{" "}
                    <strong>{retentionImpact.remainingCount}</strong> 条。收藏不会受影响。
                  </p>
                  <div className="button-row">
                    <button
                      className="danger-action"
                      disabled={isApplyingRetention || isCheckingRetention}
                      onClick={() => void confirmRetentionChange()}
                      type="button"
                    >
                      {isApplyingRetention ? "正在应用" : `应用并删除 ${retentionImpact.deleteCount} 条`}
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
                {confirmClearHistory ? (
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
                        disabled={isClearingHistory}
                        onClick={() => void clearReadingHistory()}
                        type="button"
                      >
                        {isClearingHistory ? "正在清空" : `清空 ${readingHistoryCount} 条`}
                      </button>
                      <button
                        className="text-action"
                        disabled={isClearingHistory}
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
                    disabled={!readingHistoryCount || isApplyingRetention}
                    onClick={() => {
                      retentionPreviewGeneration.current += 1;
                      setRetentionImpact(undefined);
                      setRetentionDraft(settings?.historyRetention ?? "1m");
                      setIsCheckingRetention(false);
                      setHistoryActionMessage("");
                      setHistoryActionError("");
                      setConfirmClearHistory(true);
                    }}
                    ref={clearHistoryButton}
                    type="button"
                  >
                    清空历史记录
                  </button>
                )}
              </div>
              {historyActionMessage ? (
                <p className="inline-note" role="status">
                  {historyActionMessage}
                </p>
              ) : null}
              {historyActionError ? (
                <p className="inline-error" role="alert">
                  {historyActionError}
                </p>
              ) : null}
            </div>
          )}
          {group === "通用" && (
            <div className="settings-stack">
              <div className="button-row">
                <button className="secondary-action" disabled={!settings} onClick={toggleLaunchAtLogin} type="button">
                  {settings?.launchAtLogin ? "关闭登录时启动" : "开启登录时启动"}
                </button>
              </div>
              <div className="log-count">
                <span>错误记录：{errorLogCount}</span>
                <button className="text-action" disabled={!errorLogCount} onClick={clearErrorLog} type="button">
                  清空
                </button>
              </div>
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

function setupBlockerLabel(hasApiKey: boolean, settings: AppSettings | undefined): string {
  if (!hasApiKey) return "需要 API Key";
  if (settings?.apiKeyStatus !== "verified") return "需要验证连接";
  if (!settings.voices.length) return "需要 Voice 列表";
  return "暂不可播放";
}

function playbackSkippedLabel(skipped: string | undefined): string {
  if (skipped === "empty_clipboard") return "没有检测到选区或剪切板文本";
  if (skipped === "missing_api_key") return "需要 API Key";
  if (skipped === "unverified_api_key") return "需要验证连接";
  if (skipped === "missing_voice") return "需要选择 Voice";
  return "未开始播放";
}

function isBuiltInModel(model: string): boolean {
  return MODEL_OPTIONS.some((option) => option.id === model);
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

function voicesForLanguage(voices: MiniMaxVoice[], language: DetectedLanguage): MiniMaxVoice[] {
  const direct = voices.filter((voice) => voice.language === language);
  if (direct.length) return direct;
  if (language === "en") return voices.filter((voice) => voice.language === "latin");
  return [];
}
