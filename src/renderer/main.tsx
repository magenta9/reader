import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ReactElement } from "react";
import type { AppRoute, AppSettings, ReadingHistoryRecord } from "./bridge.js";
import type { DetectedLanguage, MiniMaxVoice } from "../shared/types.js";
import { MODEL_OPTIONS } from "../shared/models.js";
import { PlaybackAudioQueue } from "./audio-player.js";
import "./styles.css";

const NAV_ITEMS: Array<{ route: AppRoute; label: string; mark: string }> = [
  { route: "home", label: "主页", mark: "⌂" },
  { route: "history", label: "历史记录", mark: "◷" },
  { route: "settings", label: "设置", mark: "⚙" }
];

const LANGUAGE_GROUPS: Array<{ language: DetectedLanguage; label: string }> = [
  { language: "zh", label: "中文" },
  { language: "en", label: "英文" },
  { language: "ja", label: "日文" },
  { language: "ko", label: "韩文" },
  { language: "latin", label: "其他拉丁语" },
  { language: "unknown", label: "未知" }
];

function App(): ReactElement {
  const [route, setRoute] = useState<AppRoute>("home");

  useEffect(() => {
    const audioQueue = new PlaybackAudioQueue();
    let mounted = true;
    void window.voiceReader.getBootstrapState().then((state) => {
      if (mounted) setRoute(state.lastRoute);
    });
    const unsubscribe = window.voiceReader.onNavigate((nextRoute) => {
      setRoute(nextRoute);
    });
    const subscriptions = [
      unsubscribe,
      window.voiceReader.onPlaybackStart((session) => audioQueue.startSession(session)),
      window.voiceReader.onAudioChunk((payload) => audioQueue.pushChunk(payload.sessionId, payload.bytes)),
      window.voiceReader.onSegmentEnd((payload) => audioQueue.endSegment(payload.sessionId)),
      window.voiceReader.onPlaybackFinish((payload) => audioQueue.finishSession(payload.sessionId)),
      window.voiceReader.onPlaybackFail((payload) => audioQueue.failSession(payload.sessionId)),
      window.voiceReader.onPlaybackStop((payload) => audioQueue.stopSession(payload.sessionId))
    ];
    return () => {
      mounted = false;
      audioQueue.stop();
      for (const unsubscribeListener of subscriptions) unsubscribeListener();
    };
  }, []);

  const title = useMemo(() => NAV_ITEMS.find((item) => item.route === route)?.label ?? "主页", [route]);

  const navigate = (nextRoute: AppRoute): void => {
    setRoute(nextRoute);
    void window.voiceReader.setRoute(nextRoute);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="VoiceReader navigation">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span />
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

        <div className="sidebar-footer">
          <button
            aria-label="打开设置"
            className="gear-button"
            onClick={() => navigate("settings")}
            type="button"
          >
            ⚙
          </button>
        </div>
      </aside>

      <main className="workspace" id="main-content">
        <header className="workspace-header">
          <p className="eyebrow">VoiceReader</p>
          <h1>{title}</h1>
        </header>
        {route === "home" && <Home />}
        {route === "history" && <History />}
        {route === "settings" && <Settings />}
      </main>
    </div>
  );
}

function Home(): ReactElement {
  const [settings, setSettings] = useState<AppSettings | undefined>();
  const [hasApiKey, setHasApiKey] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<DetectedLanguage>("zh");

  useEffect(() => {
    void Promise.all([window.voiceReader.getSettings(), window.voiceReader.hasMiniMaxApiKey()]).then(
      ([nextSettings, nextHasApiKey]) => {
        setSettings(nextSettings);
        setHasApiKey(nextHasApiKey);
      }
    );
  }, []);

  const voices = voicesForLanguage(settings?.voices ?? [], selectedLanguage);
  const preferredVoice = settings?.preferredVoicesByLanguage[selectedLanguage] ?? "";

  const savePreferredVoice = async (voiceId: string): Promise<void> => {
    const next = await window.voiceReader.setPreferredVoice(selectedLanguage, voiceId);
    setSettings(next);
  };
  const canPlay = Boolean(hasApiKey && settings?.apiKeyStatus === "verified" && settings.voices.length);
  const playClipboard = async (): Promise<void> => {
    await window.voiceReader.playClipboard();
  };

  return (
    <section className="surface home-layout" aria-labelledby="home-title">
      <div className="home-primary">
        <p className="section-kicker">选择文本优先</p>
        <h2 id="home-title">播放当前选择文本或剪切板</h2>
        <p className="muted">有选中文本时优先朗读选中内容；否则读取剪切板。主页不会显示全文。</p>
        <button className="primary-action" disabled={!canPlay} onClick={playClipboard} type="button">
          播放
        </button>
      </div>
      <div className="status-panel" aria-label="配置状态">
        <p className="section-kicker">配置状态</p>
        <div className="status-row">
          <span className={`status-dot ${settings?.apiKeyStatus === "verified" ? "ready" : "pending"}`} />
          <span>{hasApiKey ? apiKeyStatusLabel(settings?.apiKeyStatus) : "等待 MiniMax API Key"}</span>
        </div>
        <div className="status-row">
          <span className={`status-dot ${(settings?.voices.length ?? 0) > 0 ? "ready" : "pending"}`} />
          <span>{(settings?.voices.length ?? 0) > 0 ? `已加载 ${settings?.voices.length} 个 Voice` : "等待 Voice 列表"}</span>
        </div>
        <div className="status-row">
          <span className="status-dot pending" />
          <span>默认快捷键 {settings?.activationShortcut ?? "Command+Shift+R"}</span>
        </div>
        <div className="status-row">
          <span className={`status-dot ${settings?.hasCompletedOnboarding ? "ready" : "pending"}`} />
          <span>{settings?.hasCompletedOnboarding ? "首次配置已完成" : "首次配置未完成"}</span>
        </div>
      </div>
      <div className="voice-panel" aria-label="Voice 选择">
        <p className="section-kicker">Voice</p>
        <div className="language-tabs" role="tablist" aria-label="语言组">
          {LANGUAGE_GROUPS.map((group) => (
            <button
              className={selectedLanguage === group.language ? "tab is-active" : "tab"}
              key={group.language}
              onClick={() => setSelectedLanguage(group.language)}
              type="button"
            >
              {group.label}
            </button>
          ))}
        </div>
        {voices.length ? (
          <select
            className="voice-select"
            onChange={(event) => void savePreferredVoice(event.target.value)}
            value={preferredVoice || voices[0]?.voice_id}
          >
            {voices.map((voice) => (
              <option key={voice.voice_id} value={voice.voice_id}>
                {voice.display_name}
              </option>
            ))}
          </select>
        ) : (
          <div className="select-placeholder">Voice 列表将在账户验证后显示</div>
        )}
      </div>
    </section>
  );
}

function History(): ReactElement {
  const [records, setRecords] = useState<ReadingHistoryRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);
  const [replaySessionId, setReplaySessionId] = useState<number | undefined>();

  useEffect(() => {
    void refreshHistory();
  }, []);

  useEffect(() => {
    const clearReplay = (payload: { sessionId: number }) => {
      setReplaySessionId((current) => (current === payload.sessionId ? undefined : current));
    };
    return [
      window.voiceReader.onPlaybackFinish(clearReplay),
      window.voiceReader.onPlaybackFail(clearReplay),
      window.voiceReader.onPlaybackStop(clearReplay)
    ].reduce(
      (unsubscribeAll, unsubscribe) => () => {
        unsubscribe();
        unsubscribeAll();
      },
      () => undefined
    );
  }, []);

  const selected = records.find((record) => record.id === selectedId);
  const groups = groupHistoryRecords(records);

  const refreshHistory = async (preferredSelectedId?: string): Promise<void> => {
    const nextRecords = await window.voiceReader.listReadingHistory();
    setRecords(nextRecords);
    setSelectedId((current) => {
      if (preferredSelectedId && nextRecords.some((record) => record.id === preferredSelectedId)) {
        return preferredSelectedId;
      }
      if (current && nextRecords.some((record) => record.id === current)) return current;
      return nextRecords[0]?.id;
    });
  };

  const copySelected = async (): Promise<void> => {
    if (!selected) return;
    await window.voiceReader.copyText(selected.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1300);
  };

  const deleteSelected = async (): Promise<void> => {
    if (!selected) return;
    if (confirmDeleteId !== selected.id) {
      setConfirmDeleteId(selected.id);
      return;
    }
    const currentIndex = records.findIndex((record) => record.id === selected.id);
    await window.voiceReader.deleteReadingHistoryRecord(selected.id);
    const nextSelection = records[currentIndex + 1]?.id ?? records[currentIndex - 1]?.id;
    setConfirmDeleteId(undefined);
    await refreshHistory(nextSelection);
  };

  const replaySelected = async (): Promise<void> => {
    if (!selected) return;
    const result = await window.voiceReader.playHistoryRecord(selected.id);
    if (result.started) setReplaySessionId(result.sessionId);
  };

  return (
    <section className="history-layout" aria-label="历史记录">
      <div className="history-list">
        {records.length ? (
          groups.map((group) => (
            <div className="history-group" key={group.label}>
              <p className="section-kicker">{group.label}</p>
              <div className="history-items">
                {group.records.map((record) => (
                  <button
                    className={`history-item${record.id === selectedId ? " is-active" : ""}`}
                    key={record.id}
                    onClick={() => {
                      setSelectedId(record.id);
                      setConfirmDeleteId(undefined);
                    }}
                    type="button"
                  >
                    <span className="history-time">{formatHistoryTime(record.createdAt)}</span>
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
          <div className="empty-list">暂无历史记录</div>
        )}
      </div>
      <div className="history-detail">
        {selected ? (
          <>
            <p className="section-kicker">详情</p>
            <h2>{selected.preview}</h2>
            <div className="detail-meta">
              <span>{formatHistoryDateTime(selected.createdAt)}</span>
              <span>{formatDuration(selected.durationEstimateSeconds)}</span>
              <span>{selected.languageSummary}</span>
            </div>
            {replaySessionId ? (
              <div className="detail-waveform" aria-label="历史重播中">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            ) : null}
            <div className="detail-actions">
              <button className="secondary-action" onClick={replaySelected} type="button">
                重新播放
              </button>
              {replaySessionId ? (
                <button className="text-action" onClick={() => void window.voiceReader.stopPlayback()} type="button">
                  停止
                </button>
              ) : null}
              <button className="text-action" onClick={copySelected} type="button">
                {copied ? "已复制" : "复制全文"}
              </button>
              <button
                className={confirmDeleteId === selected.id ? "danger-action" : "text-action"}
                onClick={deleteSelected}
                type="button"
              >
                {confirmDeleteId === selected.id ? "确认删除" : "删除"}
              </button>
            </div>
            <article className="history-full-text">{selected.text}</article>
          </>
        ) : (
          <>
            <p className="section-kicker">详情</p>
            <h2>选择一条历史记录</h2>
            <p className="muted">朗读当前剪切板后，历史记录会显示在这里。</p>
          </>
        )}
      </div>
    </section>
  );
}

function Settings(): ReactElement {
  const groups = ["账户与连接", "快捷键", "朗读", "历史记录", "通用"];
  const [settings, setSettings] = useState<AppSettings | undefined>();
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [customModelDraft, setCustomModelDraft] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [errorLogCount, setErrorLogCount] = useState(0);
  const [readingHistoryCount, setReadingHistoryCount] = useState(0);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false);
  const [shortcutMessage, setShortcutMessage] = useState("");
  const [setupMessage, setSetupMessage] = useState("");

  useEffect(() => {
    void refreshSettings();
  }, []);

  useEffect(() => {
    if (!isRecordingShortcut) return undefined;
    const recordShortcut = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setIsRecordingShortcut(false);
        setShortcutMessage("已取消录制");
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
      window.voiceReader.getSettings(),
      window.voiceReader.hasMiniMaxApiKey(),
      window.voiceReader.getErrorLogCount(),
      window.voiceReader.getReadingHistoryCount()
    ]);
    setSettings(nextSettings);
    setHasApiKey(nextHasApiKey);
    setErrorLogCount(nextErrorLogCount);
    setReadingHistoryCount(nextReadingHistoryCount);
    if (!isBuiltInModel(nextSettings.model)) setCustomModelDraft(nextSettings.model);
  };

  const saveApiKey = async (): Promise<void> => {
    await window.voiceReader.setMiniMaxApiKey(apiKeyDraft);
    setApiKeyDraft("");
    setSetupMessage("API Key 已加密保存，等待验证");
    await refreshSettings();
  };

  const clearApiKey = async (): Promise<void> => {
    await window.voiceReader.clearMiniMaxApiKey();
    setSetupMessage("API Key 已清除");
    await refreshSettings();
  };

  const verifyApiKey = async (): Promise<void> => {
    const result = await window.voiceReader.verifyMiniMaxKey();
    setSetupMessage(result.ok ? "连接验证成功" : result.error ?? "连接验证失败");
    setSettings(result.settings);
    setHasApiKey(await window.voiceReader.hasMiniMaxApiKey());
  };

  const refreshVoices = async (): Promise<void> => {
    const result = await window.voiceReader.refreshVoices();
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
    const next = await window.voiceReader.setLaunchAtLogin(!settings?.launchAtLogin);
    setSettings(next);
  };

  const saveActivationShortcut = async (shortcut: string): Promise<void> => {
    const result = await window.voiceReader.setActivationShortcut(shortcut);
    setSettings(result.settings);
    setShortcutMessage(result.ok ? "快捷键已注册" : result.error ?? "快捷键注册失败");
  };

  const updateSpeechRate = async (speechRate: number): Promise<void> => {
    const next = await window.voiceReader.updateSettings({ speechRate });
    setSettings(next);
  };

  const updateModel = async (model: string): Promise<void> => {
    if (model === "custom") {
      if (!customModelDraft && settings?.model && !isBuiltInModel(settings.model)) {
        setCustomModelDraft(settings.model);
      }
      return;
    }
    const next = await window.voiceReader.updateSettings({ model });
    setSettings(next);
  };

  const saveCustomModel = async (): Promise<void> => {
    const model = customModelDraft.trim();
    if (!model) return;
    const next = await window.voiceReader.updateSettings({ model });
    setSettings(next);
  };

  const completeOnboarding = async (): Promise<void> => {
    await window.voiceReader.setOnboardingComplete(true);
    await refreshSettings();
  };

  const clearErrorLog = async (): Promise<void> => {
    await window.voiceReader.clearErrorLog();
    setErrorLogCount(0);
  };

  const updateRetention = async (historyRetention: AppSettings["historyRetention"]): Promise<void> => {
    const next = await window.voiceReader.updateSettings({ historyRetention });
    setSettings(next);
    setReadingHistoryCount(await window.voiceReader.getReadingHistoryCount());
  };

  const clearReadingHistory = async (): Promise<void> => {
    if (!confirmClearHistory) {
      setConfirmClearHistory(true);
      return;
    }
    await window.voiceReader.clearReadingHistory();
    setReadingHistoryCount(0);
    setConfirmClearHistory(false);
  };

  const currentSpeechRate = settings?.speechRate ?? 1;
  const modelSelectValue = settings && isBuiltInModel(settings.model) ? settings.model : "custom";

  return (
    <section className="settings-layout" aria-label="设置">
      {groups.map((group) => (
        <article className="settings-section" key={group}>
          <h2>{group}</h2>
          {group === "账户与连接" && (
            <div className="settings-stack">
              <p className="muted">
                API Key 状态：{hasApiKey ? apiKeyStatusLabel(settings?.apiKeyStatus) : "未保存"}
              </p>
              {settings?.apiKeyError && <p className="inline-error">{settings.apiKeyError}</p>}
              {settings?.voiceRefreshError && <p className="inline-error">{settings.voiceRefreshError}</p>}
              {setupMessage && <p className="inline-note">{setupMessage}</p>}
              <label className="field-label">
                MiniMax API Key
                <input
                  onChange={(event) => setApiKeyDraft(event.target.value)}
                  placeholder="输入后会加密保存到本机配置"
                  type="password"
                  value={apiKeyDraft}
                />
              </label>
              <button className="secondary-action" disabled={!apiKeyDraft.trim()} onClick={saveApiKey} type="button">
                保存 API Key
              </button>
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
              <p className="muted">Voice 缓存：{settings?.voices.length ?? 0} 个</p>
            </div>
          )}
          {group === "快捷键" && (
            <div className="settings-stack">
              <p className="muted">当前快捷键：{settings?.activationShortcut ?? "Command+Shift+R"}</p>
              <button
                className={isRecordingShortcut ? "shortcut-recorder is-recording" : "shortcut-recorder"}
                onClick={() => {
                  setIsRecordingShortcut(true);
                  setShortcutMessage("正在录制新的快捷键");
                }}
                type="button"
              >
                {isRecordingShortcut ? "按下新的组合键" : settings?.activationShortcut ?? "Command+Shift+R"}
              </button>
              {settings?.shortcutRegistrationError ? (
                <p className="inline-error">{settings.shortcutRegistrationError}</p>
              ) : (
                <p className="inline-note">{shortcutMessage || "快捷键已注册"}</p>
              )}
              <button
                className="text-action"
                onClick={() => void saveActivationShortcut("Command+Shift+R")}
                type="button"
              >
                恢复默认快捷键
              </button>
            </div>
          )}
          {group === "朗读" && (
            <div className="settings-stack">
              <label className="field-label">
                语速
                <div className="range-row">
                  <input
                    className="range-control"
                    max="3"
                    min="0.5"
                    onChange={(event) => void updateSpeechRate(Number(event.target.value))}
                    step="0.1"
                    type="range"
                    value={currentSpeechRate}
                  />
                  <span>{currentSpeechRate.toFixed(1)}x</span>
                </div>
              </label>
              <label className="field-label">
                Model
                <select
                  className="voice-select"
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
                <div className="button-row model-row">
                  <label className="field-label custom-model-field">
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
              <p className="muted">保存 Model 时不做可用性验证；播放时失败会写入不含正文的 Error Log。</p>
            </div>
          )}
          {group === "历史记录" && (
            <div className="settings-stack">
              <p className="muted">当前保留期限：{historyRetentionLabel(settings?.historyRetention ?? "1m")}。</p>
              <label className="field-label">
                保留期限
                <select
                  className="voice-select"
                  onChange={(event) =>
                    void updateRetention(event.target.value as AppSettings["historyRetention"])
                  }
                  value={settings?.historyRetention ?? "1m"}
                >
                  <option value="7d">7 天</option>
                  <option value="1m">1 个月</option>
                  <option value="3m">3 个月</option>
                  <option value="forever">永久</option>
                </select>
              </label>
              <p className="muted">当前历史记录：{readingHistoryCount} 条。缩短保留期限会立即删除超期记录。</p>
              <p className="muted">历史全文只保存在本机，不保存音频；当前朗读文本会发送给 MiniMax 生成语音。</p>
              <button
                className={confirmClearHistory ? "danger-action" : "secondary-action"}
                disabled={!readingHistoryCount}
                onClick={clearReadingHistory}
                type="button"
              >
                {confirmClearHistory ? "确认清空历史记录" : "清空历史记录"}
              </button>
            </div>
          )}
          {group === "通用" && (
            <div className="settings-stack">
              <button className="secondary-action" onClick={toggleLaunchAtLogin} type="button">
                {settings?.launchAtLogin ? "关闭登录时启动" : "开启登录时启动"}
              </button>
              <button className="secondary-action" onClick={completeOnboarding} type="button">
                标记首次配置完成
              </button>
              <div className="log-count">
                <span>Error Log：{errorLogCount}</span>
                <button className="text-action" disabled={!errorLogCount} onClick={clearErrorLog} type="button">
                  清空
                </button>
              </div>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}

function apiKeyStatusLabel(status: AppSettings["apiKeyStatus"] | undefined): string {
  if (status === "verified") return "已验证";
  if (status === "failed") return "待验证";
  return "未配置";
}

function historyRetentionLabel(retention: AppSettings["historyRetention"]): string {
  if (retention === "7d") return "7 天";
  if (retention === "3m") return "3 个月";
  if (retention === "forever") return "永久";
  return "1 个月";
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

interface HistoryGroup {
  label: "今天" | "昨天" | "本周" | "更早";
  records: ReadingHistoryRecord[];
}

function groupHistoryRecords(records: ReadingHistoryRecord[], now = Date.now()): HistoryGroup[] {
  const buckets: Record<HistoryGroup["label"], ReadingHistoryRecord[]> = {
    今天: [],
    昨天: [],
    本周: [],
    更早: []
  };
  for (const record of records) {
    buckets[classifyHistoryRecord(record.createdAt, now)].push(record);
  }
  return (["今天", "昨天", "本周", "更早"] as const)
    .map((label) => ({
      label,
      records: buckets[label].sort((a, b) => b.createdAt - a.createdAt)
    }))
    .filter((group) => group.records.length);
}

function classifyHistoryRecord(createdAt: number, now: number): HistoryGroup["label"] {
  const created = new Date(createdAt);
  const today = startOfDay(new Date(now));
  const yesterday = today - 24 * 60 * 60 * 1000;
  const weekStart = today - ((new Date(now).getDay() + 6) % 7) * 24 * 60 * 60 * 1000;
  if (createdAt >= today) return "今天";
  if (createdAt >= yesterday) return "昨天";
  if (createdAt >= weekStart) return "本周";
  return "更早";
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
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
  if (seconds < 60) return "~1 min";
  return `~${Math.max(1, Math.round(seconds / 60))} min`;
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
