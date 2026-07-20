import type { AppSettings, MiniMaxSetupResult, ShortcutUpdateResult } from "./bridge.js";
import type {
  HistoryRetention,
  HistoryRetentionChangeResult,
  HistoryRetentionImpact
} from "../shared/app-contracts.js";
import { historyRetentionLabel } from "./history-retention.js";

export interface SettingsWorkspaceCapabilities {
  getSettings(): Promise<AppSettings>;
  hasMiniMaxApiKey(): Promise<boolean>;
  getErrorLogCount(): Promise<number>;
  getReadingHistoryCount(): Promise<number>;
  setSpeechRate(speechRate: number): Promise<AppSettings>;
  setModel(model: string): Promise<AppSettings>;
  setLaunchAtLogin(launchAtLogin: boolean): Promise<AppSettings>;
  setMiniMaxApiKey(apiKey: string): Promise<void>;
  clearMiniMaxApiKey(): Promise<void>;
  verifyMiniMaxKey(): Promise<MiniMaxSetupResult>;
  refreshVoices(): Promise<MiniMaxSetupResult>;
  setActivationShortcut(shortcut: string): Promise<ShortcutUpdateResult>;
  clearErrorLog(): Promise<void>;
  previewReadingHistoryRetention(historyRetention: HistoryRetention): Promise<HistoryRetentionImpact>;
  applyReadingHistoryRetention(
    historyRetention: HistoryRetention,
    expectedDeleteCount: number
  ): Promise<HistoryRetentionChangeResult>;
  clearReadingHistory(): Promise<number>;
}

export type WorkspaceResource<T> =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; value: T }>
  | Readonly<{ status: "error"; message: string }>;

export type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T;

export type SettingsFeedbackKind =
  | "setup"
  | "shortcut"
  | "speechRate"
  | "model"
  | "launchAtLogin"
  | "errorLog"
  | "historyAction"
  | "historyError";

export type SettingsPendingCommand =
  | "speechRate"
  | "model"
  | "launchAtLogin"
  | "account"
  | "shortcut"
  | "errorLog"
  | "retention"
  | "clearHistory";

export interface SettingsVisitSnapshot {
  readonly apiKeyDraft: string;
  readonly customModelDraft: string;
  readonly isRecordingShortcut: boolean;
  readonly confirmClearHistory: boolean;
  readonly retentionDraft: HistoryRetention;
  readonly retentionImpact?: DeepReadonly<HistoryRetentionImpact>;
  readonly retentionPhase: "idle" | "checking" | "awaiting-confirmation" | "applying";
  readonly feedback: Readonly<Partial<Record<SettingsFeedbackKind, string>>>;
}

export interface SettingsWorkspaceSnapshot {
  readonly settings: WorkspaceResource<DeepReadonly<AppSettings>>;
  readonly miniMaxCredential: WorkspaceResource<boolean>;
  readonly errorLogCount: WorkspaceResource<number>;
  readonly readingHistoryCount: WorkspaceResource<number>;
  readonly canWrite: boolean;
  readonly disposed: boolean;
  readonly presentation: Readonly<{ speechRate: number }>;
  readonly pending: Readonly<Record<SettingsPendingCommand, boolean>>;
  readonly visit: SettingsVisitSnapshot;
}

type ResourceKey = "settings" | "miniMaxCredential" | "errorLogCount" | "readingHistoryCount";
type Listener = () => void;

const LOADING = Object.freeze({ status: "loading" } as const);

export class SettingsWorkspace {
  private snapshot: SettingsWorkspaceSnapshot = createInitialSnapshot();
  private readonly listeners = new Set<Listener>();
  private readonly generations: Record<ResourceKey, number> = {
    settings: 0,
    miniMaxCredential: 0,
    errorLogCount: 0,
    readingHistoryCount: 0
  };
  private started = false;
  private speechRateInFlight = false;
  private queuedSpeechRate: number | undefined;
  private readonly inFlightCommands = new Set<SettingsPendingCommand>();
  private retentionPreviewGeneration = 0;

  constructor(private readonly capabilities: SettingsWorkspaceCapabilities) {}

  getSnapshot = (): SettingsWorkspaceSnapshot => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(): void {
    if (this.started || this.snapshot.disposed) return;
    this.started = true;
    this.loadSettings();
    this.loadMiniMaxCredential();
    this.loadErrorLogCount();
    this.loadReadingHistoryCount();
  }

  retrySettings(): void {
    if (!this.snapshot.disposed) this.loadSettings();
  }

  retryMiniMaxCredential(): void {
    if (!this.snapshot.disposed) this.loadMiniMaxCredential();
  }

  retryErrorLogCount(): void {
    if (!this.snapshot.disposed) this.loadErrorLogCount();
  }

  retryReadingHistoryCount(): void {
    if (!this.snapshot.disposed) this.loadReadingHistoryCount();
  }

  updateSpeechRate(speechRate: number): void {
    if (!this.snapshot.canWrite || this.snapshot.disposed) return;
    this.queuedSpeechRate = speechRate;
    this.replaceSnapshot({
      presentation: Object.freeze({ speechRate }),
      pending: Object.freeze({ ...this.snapshot.pending, speechRate: true })
    });
    if (!this.speechRateInFlight) void this.flushSpeechRate();
  }

  async setModel(model: string): Promise<void> {
    await this.runCommand(
      "model",
      "model",
      "模型更新失败，请稍后重试。",
      () => this.capabilities.setModel(model),
      (settings) => this.acceptModel(settings.model)
    );
  }

  async setLaunchAtLogin(launchAtLogin: boolean): Promise<void> {
    await this.runCommand(
      "launchAtLogin",
      "launchAtLogin",
      "开机启动更新失败，请稍后重试。",
      () => this.capabilities.setLaunchAtLogin(launchAtLogin),
      (settings) => this.acceptLaunchAtLogin(settings.launchAtLogin)
    );
  }

  async saveApiKey(): Promise<void> {
    const apiKey = this.snapshot.visit.apiKeyDraft;
    if (!apiKey.trim()) return;
    await this.runCommand(
      "account",
      "setup",
      "API Key 保存失败，请稍后重试。",
      () => this.capabilities.setMiniMaxApiKey(apiKey),
      async () => {
        this.updateVisit({ apiKeyDraft: "" });
        this.setFeedback("setup", "API Key 已保存到本机 SQLite，等待验证");
        await this.refreshAccountSettings();
      }
    );
  }

  async clearApiKey(): Promise<void> {
    await this.runCommand(
      "account",
      "setup",
      "API Key 清除失败，请稍后重试。",
      () => this.capabilities.clearMiniMaxApiKey(),
      async () => {
        this.setFeedback("setup", "API Key 已清除");
        await this.refreshAccountSettings();
      }
    );
  }

  async verifyApiKey(): Promise<void> {
    await this.runCommand(
      "account",
      "setup",
      "连接验证失败，请稍后重试。",
      () => this.capabilities.verifyMiniMaxKey(),
      async (result) => {
        this.acceptAccountSettings(result.settings);
        this.setFeedback("setup", result.ok ? "连接验证成功" : result.error ?? "连接验证失败");
        await this.loadMiniMaxCredential();
      }
    );
  }

  async refreshVoices(): Promise<void> {
    await this.runCommand(
      "account",
      "setup",
      "Voice 列表刷新失败，请稍后重试。",
      () => this.capabilities.refreshVoices(),
      (result) => {
        this.acceptAccountSettings(result.settings);
        this.setFeedback(
          "setup",
          result.usedCachedVoices
            ? `刷新失败，继续使用本地 Voice 缓存：${result.error}`
            : result.ok
              ? "Voice 列表已刷新"
              : result.error ?? "Voice 列表刷新失败"
        );
      }
    );
  }

  async saveCustomModel(): Promise<void> {
    const model = this.snapshot.visit.customModelDraft.trim();
    if (model) await this.setModel(model);
  }

  async setActivationShortcut(shortcut: string): Promise<void> {
    await this.runCommand(
      "shortcut",
      "shortcut",
      "快捷键更新失败，请稍后重试。",
      () => this.capabilities.setActivationShortcut(shortcut),
      (result) => {
        this.acceptShortcutSettings(result.settings);
        this.setFeedback("shortcut", result.ok ? "开始朗读快捷键已更新" : result.error ?? "无法使用这个快捷键");
      }
    );
  }

  async requestRetentionChange(historyRetention: HistoryRetention): Promise<void> {
    if (
      !this.snapshot.canWrite ||
      this.snapshot.disposed ||
      this.snapshot.pending.clearHistory ||
      this.snapshot.visit.retentionPhase === "applying" ||
      this.inFlightCommands.has("retention")
    ) {
      return;
    }
    const generation = ++this.retentionPreviewGeneration;
    this.updateVisit({
      retentionDraft: historyRetention,
      retentionImpact: undefined,
      confirmClearHistory: false,
      retentionPhase: "checking",
      feedback: clearFeedback(this.snapshot.visit.feedback, "historyAction", "historyError")
    });
    if (
      this.snapshot.settings.status === "ready" &&
      historyRetention === this.snapshot.settings.value.historyRetention
    ) {
      this.updateVisit({ retentionPhase: "idle" });
      this.setPending("retention", false);
      return;
    }

    this.setPending("retention", true);
    try {
      const impact = await this.capabilities.previewReadingHistoryRetention(historyRetention);
      if (!this.acceptsRetention(generation)) return;
      if (impact.deleteCount > 0) {
        this.updateVisit({
          retentionImpact: freezeImpact(impact),
          retentionPhase: "awaiting-confirmation"
        });
        return;
      }
      this.updateVisit({ retentionPhase: "idle" });
      await this.applyRetentionChange(historyRetention, 0, generation);
    } catch {
      if (!this.acceptsRetention(generation)) return;
      this.restoreRetentionDraft();
      this.setFeedback("historyError", "无法检查保留期限的影响，请稍后重试。");
    } finally {
      if (this.acceptsRetention(generation)) {
        if (this.snapshot.visit.retentionPhase === "checking") {
          this.updateVisit({ retentionPhase: "idle" });
        }
        this.setPending("retention", false);
      }
    }
  }

  async confirmRetentionChange(): Promise<void> {
    const impact = this.snapshot.visit.retentionImpact;
    if (!impact) return;
    await this.applyRetentionChange(
      impact.historyRetention,
      impact.deleteCount,
      this.retentionPreviewGeneration
    );
  }

  cancelRetentionChange(): void {
    if (this.snapshot.visit.retentionPhase === "applying") return;
    this.retentionPreviewGeneration += 1;
    this.restoreRetentionDraft();
    this.updateVisit({
      retentionImpact: undefined,
      retentionPhase: "idle",
      feedback: Object.freeze({
        ...clearFeedback(this.snapshot.visit.feedback, "historyError"),
        historyAction: "已取消保留期限变更。"
      })
    });
    this.setPending("retention", false);
  }

  cancelClearHistory(): void {
    this.updateVisit({
      confirmClearHistory: false,
      feedback: Object.freeze({
        ...clearFeedback(this.snapshot.visit.feedback, "historyError"),
        historyAction: "已取消清空历史记录。"
      })
    });
  }

  async clearReadingHistory(): Promise<void> {
    if (
      !this.snapshot.visit.confirmClearHistory ||
      this.snapshot.pending.retention
    ) {
      return;
    }
    await this.runCommand(
      "clearHistory",
      "historyError",
      "清空失败，现有历史记录仍然保留。",
      () => this.capabilities.clearReadingHistory(),
      (clearedCount) => {
        this.acceptReadingHistoryCount(0);
        this.updateVisit({
          confirmClearHistory: false,
          retentionImpact: undefined,
          feedback: Object.freeze({
            ...clearFeedback(this.snapshot.visit.feedback, "historyError"),
            historyAction: `已清空 ${clearedCount} 条历史记录，收藏仍然保留。`
          })
        });
      }
    );
  }

  async clearErrorLog(): Promise<void> {
    await this.runCommand(
      "errorLog",
      "errorLog",
      "错误日志清除失败，请稍后重试。",
      () => this.capabilities.clearErrorLog(),
      () => {
        this.acceptErrorLogCount(0);
      }
    );
  }

  updateApiKeyDraft(value: string): void {
    this.updateVisit({ apiKeyDraft: value });
  }

  updateCustomModelDraft(value: string): void {
    this.updateVisit({ customModelDraft: value });
  }

  beginShortcutRecording(): void {
    this.updateVisit({
      isRecordingShortcut: true,
      feedback: Object.freeze({
        ...this.snapshot.visit.feedback,
        shortcut: "请按新的开始朗读快捷键"
      })
    });
  }

  cancelShortcutRecording(): void {
    this.updateVisit({ isRecordingShortcut: false });
    this.setFeedback("shortcut", "未更改开始朗读快捷键");
  }

  rejectShortcutCandidate(): void {
    if (this.snapshot.visit.isRecordingShortcut) {
      this.setFeedback("shortcut", "请按下包含修饰键的组合键");
    }
  }

  async recordActivationShortcut(shortcut: string): Promise<void> {
    this.updateVisit({ isRecordingShortcut: false });
    await this.setActivationShortcut(shortcut);
  }

  requestClearHistoryConfirmation(): void {
    if (this.snapshot.disposed || this.snapshot.visit.retentionPhase === "applying") return;
    this.retentionPreviewGeneration += 1;
    this.restoreRetentionDraft();
    this.setPending("retention", false);
    this.updateVisit({
      confirmClearHistory: true,
      retentionImpact: undefined,
      retentionPhase: "idle",
      feedback: clearFeedback(this.snapshot.visit.feedback, "historyAction", "historyError")
    });
  }

  dispose(): void {
    if (this.snapshot.disposed) return;
    this.queuedSpeechRate = undefined;
    this.inFlightCommands.clear();
    this.snapshot = Object.freeze({
      ...this.snapshot,
      disposed: true,
      canWrite: false,
      pending: createInitialPendingSnapshot(),
      visit: createInitialVisitSnapshot()
    });
    this.emit();
    this.listeners.clear();
  }

  private loadSettings(): Promise<void> {
    return this.loadResource(
      "settings",
      async () => freezeSettings(await this.capabilities.getSettings()),
      (settings) => {
        const shouldInitializeRetention = this.snapshot.settings.status !== "ready";
        const preserveSpeechRatePresentation =
          this.speechRateInFlight || this.queuedSpeechRate !== undefined;
        this.replaceSnapshot(
          settings.status === "ready"
            ? {
                settings,
                presentation: preserveSpeechRatePresentation
                  ? this.snapshot.presentation
                  : Object.freeze({ speechRate: settings.value.speechRate })
              }
            : { settings }
        );
        if (settings.status === "ready" && shouldInitializeRetention) {
          this.updateVisit({ retentionDraft: settings.value.historyRetention });
        }
      }
    );
  }

  private loadMiniMaxCredential(): Promise<void> {
    return this.loadResource("miniMaxCredential", () => this.capabilities.hasMiniMaxApiKey(), (miniMaxCredential) =>
      this.replaceSnapshot({ miniMaxCredential })
    );
  }

  private loadErrorLogCount(): Promise<void> {
    return this.loadResource("errorLogCount", () => this.capabilities.getErrorLogCount(), (errorLogCount) =>
      this.replaceSnapshot({ errorLogCount })
    );
  }

  private loadReadingHistoryCount(): Promise<void> {
    return this.loadResource(
      "readingHistoryCount",
      () => this.capabilities.getReadingHistoryCount(),
      (readingHistoryCount) => this.replaceSnapshot({ readingHistoryCount })
    );
  }

  private async loadResource<T>(
    key: ResourceKey,
    read: () => Promise<T>,
    replace: (resource: WorkspaceResource<T>) => void
  ): Promise<void> {
    const generation = ++this.generations[key];
    replace(LOADING);
    try {
      const value = await read();
      if (!this.accepts(key, generation)) return;
      replace(Object.freeze({ status: "ready", value }));
    } catch (error) {
      if (!this.accepts(key, generation)) return;
      replace(
        Object.freeze({
          status: "error",
          message: error instanceof Error && error.message ? error.message : "读取失败"
        })
      );
    }
  }

  private accepts(key: ResourceKey, generation: number): boolean {
    return !this.snapshot.disposed && this.generations[key] === generation;
  }

  private async flushSpeechRate(): Promise<void> {
    const speechRate = this.queuedSpeechRate;
    if (speechRate === undefined || this.snapshot.disposed) return;
    this.queuedSpeechRate = undefined;
    this.speechRateInFlight = true;
    try {
      const settings = await this.capabilities.setSpeechRate(speechRate);
      if (this.snapshot.disposed) return;
      this.acceptSpeechRate(settings.speechRate);
      this.clearFeedback("speechRate");
      if (this.queuedSpeechRate === undefined) {
        this.replaceSnapshot({ presentation: Object.freeze({ speechRate: settings.speechRate }) });
      }
    } catch {
      if (this.snapshot.disposed) return;
      this.setFeedback("speechRate", "语速更新失败，请稍后重试。");
      if (this.queuedSpeechRate === undefined && this.snapshot.settings.status === "ready") {
        this.replaceSnapshot({
          presentation: Object.freeze({ speechRate: this.snapshot.settings.value.speechRate })
        });
      }
    } finally {
      this.speechRateInFlight = false;
      if (this.snapshot.disposed) return;
      if (this.queuedSpeechRate !== undefined) {
        void this.flushSpeechRate();
      } else {
        this.setPending("speechRate", false);
      }
    }
  }

  private updateAuthoritativeSettings(update: (settings: AppSettings) => AppSettings): void {
    if (this.snapshot.settings.status !== "ready") return;
    const current = structuredClone(this.snapshot.settings.value) as AppSettings;
    const settings = deepFreeze(update(current));
    this.replaceSnapshot({ settings: Object.freeze({ status: "ready", value: settings }) });
  }

  private acceptSpeechRate(speechRate: number): void {
    this.updateAuthoritativeSettings((settings) => ({ ...settings, speechRate }));
  }

  private acceptModel(model: string): void {
    this.updateAuthoritativeSettings((settings) => ({ ...settings, model }));
  }

  private acceptLaunchAtLogin(launchAtLogin: boolean): void {
    this.updateAuthoritativeSettings((settings) => ({ ...settings, launchAtLogin }));
  }

  private acceptShortcutSettings(settings: AppSettings): void {
    this.updateAuthoritativeSettings((current) => ({
      ...current,
      activationShortcut: settings.activationShortcut,
      shortcutRegistrationError: settings.shortcutRegistrationError
    }));
  }

  private acceptAccountSettings(settings: AppSettings): void {
    this.updateAuthoritativeSettings((current) => ({
      ...current,
      apiKeyStatus: settings.apiKeyStatus,
      apiKeyVerifiedAt: settings.apiKeyVerifiedAt,
      apiKeyError: settings.apiKeyError,
      voiceRefreshError: settings.voiceRefreshError,
      voices: settings.voices,
      preferredVoicesByLanguage: settings.preferredVoicesByLanguage
    }));
  }

  private acceptHistoryRetention(historyRetention: HistoryRetention): void {
    this.updateAuthoritativeSettings((settings) => ({ ...settings, historyRetention }));
  }

  private acceptErrorLogCount(errorLogCount: number): void {
    this.generations.errorLogCount += 1;
    this.replaceSnapshot({ errorLogCount: Object.freeze({ status: "ready", value: errorLogCount }) });
  }

  private acceptReadingHistoryCount(readingHistoryCount: number): void {
    this.generations.readingHistoryCount += 1;
    this.replaceSnapshot({
      readingHistoryCount: Object.freeze({ status: "ready", value: readingHistoryCount })
    });
  }

  private async refreshAccountSettings(): Promise<void> {
    const accountSettings = this.capabilities
      .getSettings()
      .then((settings) => {
        if (!this.snapshot.disposed) this.acceptAccountSettings(settings);
      })
      .catch(() => {
        if (!this.snapshot.disposed) this.setFeedback("setup", "账户状态刷新失败，请稍后重试。");
      });
    await Promise.all([accountSettings, this.loadMiniMaxCredential()]);
  }

  private async applyRetentionChange(
    historyRetention: HistoryRetention,
    expectedDeleteCount: number,
    generation: number
  ): Promise<void> {
    if (
      !this.snapshot.canWrite ||
      !this.acceptsRetention(generation) ||
      this.snapshot.pending.clearHistory ||
      this.inFlightCommands.has("retention")
    ) {
      return;
    }
    this.inFlightCommands.add("retention");
    this.setPending("retention", true);
    this.updateVisit({ retentionPhase: "applying" });
    try {
      const result = await this.capabilities.applyReadingHistoryRetention(historyRetention, expectedDeleteCount);
      if (!this.acceptsRetention(generation)) return;
      if (!result.applied) {
        this.updateVisit({
          retentionImpact: freezeImpact(result.impact),
          retentionPhase: "awaiting-confirmation",
          feedback: Object.freeze({
            ...clearFeedback(this.snapshot.visit.feedback, "historyError"),
            historyAction: "历史记录数量已变化，请按最新数量再次确认。"
          })
        });
        this.acceptReadingHistoryCount(result.impact.deleteCount + result.impact.remainingCount);
        return;
      }

      this.acceptHistoryRetention(result.settings.historyRetention);
      this.acceptReadingHistoryCount(result.impact.remainingCount);
      this.updateVisit({
        retentionDraft: result.settings.historyRetention,
        retentionImpact: undefined,
        confirmClearHistory: false,
        feedback: Object.freeze({
          ...clearFeedback(this.snapshot.visit.feedback, "historyError"),
          historyAction: result.impact.deleteCount
            ? `保留期限已改为${historyRetentionLabel(result.settings.historyRetention)}，已删除 ${result.impact.deleteCount} 条超期历史记录。收藏未受影响。`
            : `保留期限已改为${historyRetentionLabel(result.settings.historyRetention)}。已删除的历史记录不会恢复。`
        })
      });
    } catch {
      if (this.acceptsRetention(generation)) {
        if (this.snapshot.visit.retentionImpact) {
          this.updateVisit({ retentionPhase: "awaiting-confirmation" });
        } else {
          this.restoreRetentionDraft();
        }
        this.setFeedback("historyError", "保留期限更新失败，现有历史记录未变更。");
      }
    } finally {
      this.inFlightCommands.delete("retention");
      if (this.acceptsRetention(generation)) {
        if (this.snapshot.visit.retentionPhase === "applying") {
          this.updateVisit({ retentionPhase: "idle" });
        }
        this.setPending("retention", false);
      }
    }
  }

  private acceptsRetention(generation: number): boolean {
    return !this.snapshot.disposed && this.retentionPreviewGeneration === generation;
  }

  private restoreRetentionDraft(): void {
    if (this.snapshot.settings.status === "ready") {
      this.updateVisit({ retentionDraft: this.snapshot.settings.value.historyRetention });
    }
  }

  private setPending(command: SettingsPendingCommand, pending: boolean): void {
    this.replaceSnapshot({ pending: Object.freeze({ ...this.snapshot.pending, [command]: pending }) });
  }

  private setFeedback(kind: SettingsFeedbackKind, message: string): void {
    this.updateVisit({ feedback: Object.freeze({ ...this.snapshot.visit.feedback, [kind]: message }) });
  }

  private clearFeedback(kind: SettingsFeedbackKind): void {
    this.updateVisit({ feedback: clearFeedback(this.snapshot.visit.feedback, kind) });
  }

  private async runCommand<T>(
    command: SettingsPendingCommand,
    feedback: SettingsFeedbackKind,
    failureMessage: string,
    execute: () => Promise<T>,
    accept: (result: T) => Promise<void> | void
  ): Promise<void> {
    if (!this.snapshot.canWrite || this.snapshot.disposed || this.inFlightCommands.has(command)) return;
    this.inFlightCommands.add(command);
    this.setPending(command, true);
    try {
      const result = await execute();
      if (this.snapshot.disposed) return;
      this.clearFeedback(feedback);
      await accept(result);
    } catch {
      if (!this.snapshot.disposed) this.setFeedback(feedback, failureMessage);
    } finally {
      this.inFlightCommands.delete(command);
      if (!this.snapshot.disposed) {
        this.setPending(command, false);
      }
    }
  }

  private replaceSnapshot(patch: Partial<SettingsWorkspaceSnapshot>): void {
    if (this.snapshot.disposed) return;
    const next = { ...this.snapshot, ...patch };
    this.snapshot = Object.freeze({ ...next, canWrite: next.settings.status === "ready" });
    this.emit();
  }

  private updateVisit(patch: Partial<SettingsVisitSnapshot>): void {
    if (this.snapshot.disposed) return;
    this.snapshot = Object.freeze({
      ...this.snapshot,
      visit: Object.freeze({ ...this.snapshot.visit, ...patch })
    });
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

function createInitialSnapshot(): SettingsWorkspaceSnapshot {
  return Object.freeze({
    settings: LOADING,
    miniMaxCredential: LOADING,
    errorLogCount: LOADING,
    readingHistoryCount: LOADING,
    canWrite: false,
    disposed: false,
    presentation: Object.freeze({ speechRate: 1 }),
    pending: createInitialPendingSnapshot(),
    visit: createInitialVisitSnapshot()
  });
}

function createInitialPendingSnapshot(): SettingsWorkspaceSnapshot["pending"] {
  return Object.freeze({
    speechRate: false,
    model: false,
    launchAtLogin: false,
    account: false,
    shortcut: false,
    errorLog: false,
    retention: false,
    clearHistory: false
  });
}

function createInitialVisitSnapshot(): SettingsVisitSnapshot {
  return Object.freeze({
    apiKeyDraft: "",
    customModelDraft: "",
    isRecordingShortcut: false,
    confirmClearHistory: false,
    retentionDraft: "1m",
    retentionImpact: undefined,
    retentionPhase: "idle",
    feedback: Object.freeze({})
  });
}

function freezeImpact(impact: HistoryRetentionImpact): DeepReadonly<HistoryRetentionImpact> {
  return deepFreeze(structuredClone(impact));
}

function clearFeedback(
  feedback: SettingsVisitSnapshot["feedback"],
  ...kinds: SettingsFeedbackKind[]
): SettingsVisitSnapshot["feedback"] {
  const next = { ...feedback };
  for (const kind of kinds) delete next[kind];
  return Object.freeze(next);
}

function freezeSettings(settings: AppSettings): DeepReadonly<AppSettings> {
  return deepFreeze(structuredClone(settings));
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}
