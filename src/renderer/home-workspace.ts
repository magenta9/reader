import type {
  AppSettings,
  MiniMaxSetupResult,
  PlaybackStartResult
} from "./bridge.js";
import type { DetectedLanguage, MiniMaxVoice } from "../shared/types.js";
import { voicesForLanguage } from "../shared/voices.js";

export interface HomeWorkspaceCapabilities {
  getSettings(): Promise<AppSettings>;
  hasMiniMaxApiKey(): Promise<boolean>;
  setPreferredVoice(language: DetectedLanguage, voiceId: string): Promise<AppSettings>;
  verifyMiniMaxKey(): Promise<MiniMaxSetupResult>;
  refreshVoices(): Promise<MiniMaxSetupResult>;
  playReadingTarget(): Promise<PlaybackStartResult>;
}

export type HomeSetupResource =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "error"; message: string }>
  | Readonly<{
      status: "ready";
      value: Readonly<{
        settings: DeepReadonly<AppSettings>;
        hasMiniMaxApiKey: boolean;
      }>;
    }>;

export type HomeRecoveryAction = Readonly<{
  kind: "open-settings" | "retry-setup" | "verify-key" | "refresh-voices";
  label: string;
}>;

export interface HomeWorkspaceSnapshot {
  readonly setup: HomeSetupResource;
  readonly disposed: boolean;
  readonly selectedLanguage: DetectedLanguage;
  readonly availableLanguageGroups: readonly Readonly<{
    language: DetectedLanguage;
    label: string;
  }>[];
  readonly activeLanguage: DetectedLanguage;
  readonly activeLanguageLabel: string;
  readonly voices: readonly DeepReadonly<MiniMaxVoice>[];
  readonly selectedVoice?: DeepReadonly<MiniMaxVoice>;
  readonly canPlay: boolean;
  readonly recoveryAction?: HomeRecoveryAction;
  readonly feedback: string;
  readonly hasPlaybackFeedback: boolean;
  readonly showShortcutStatus: boolean;
  readonly pending: Readonly<{
    preferredVoice: boolean;
    setup: boolean;
    playback: boolean;
  }>;
  readonly statusLabel: string;
}

type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T;

type Listener = () => void;
type VoiceIntent = Readonly<{ language: DetectedLanguage; voiceId: string }>;
type PendingSnapshot = HomeWorkspaceSnapshot["pending"];
type FeedbackOwner = Readonly<{
  lane: "preferred-voice" | "setup" | "playback";
  intentGeneration: number;
}>;

const LANGUAGE_GROUPS = Object.freeze([
  Object.freeze({ language: "zh" as const, label: "中文" }),
  Object.freeze({ language: "en" as const, label: "英文" }),
  Object.freeze({ language: "ja" as const, label: "日文" }),
  Object.freeze({ language: "ko" as const, label: "韩文" })
]);

const LOADING_SETUP = Object.freeze({ status: "loading" } as const);
const SETUP_ERROR_MESSAGE = "无法读取朗读配置";
const EMPTY_PENDING = Object.freeze({ preferredVoice: false, setup: false, playback: false });

export class HomeWorkspace {
  private snapshot = createInitialSnapshot(false);
  private readonly listeners = new Set<Listener>();
  private started = false;
  private setupGeneration = 0;
  private visitGeneration = 0;
  private intentGeneration = 0;
  private feedbackOwner: FeedbackOwner | undefined;
  private latestPreferredVoiceIntentGeneration = 0;
  private preferredVoiceInFlight = false;
  private queuedPreferredVoice: VoiceIntent | undefined;
  private preferredVoicePresentation: VoiceIntent | undefined;
  private readonly inFlightCommands = new Set<"setup" | "playback">();

  constructor(private readonly capabilities: HomeWorkspaceCapabilities) {}

  getSnapshot = (): HomeWorkspaceSnapshot => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(): void {
    if (this.started) return;
    if (this.snapshot.disposed) {
      this.snapshot = createInitialSnapshot(false);
    }
    this.started = true;
    this.visitGeneration += 1;
    void this.loadSetup();
  }

  retrySetup(): void {
    if (this.snapshot.disposed) return;
    void this.loadSetup();
  }

  selectLanguage(language: DetectedLanguage): void {
    if (this.snapshot.disposed || this.snapshot.selectedLanguage === language) return;
    this.replaceProjection({ selectedLanguage: language });
  }

  selectPreferredVoice(voiceId: string): void {
    if (
      this.snapshot.disposed ||
      this.snapshot.setup.status !== "ready" ||
      !this.snapshot.voices.some((voice) => voice.voice_id === voiceId)
    ) {
      return;
    }
    const intent = Object.freeze({ language: this.snapshot.activeLanguage, voiceId });
    this.latestPreferredVoiceIntentGeneration = ++this.intentGeneration;
    this.preferredVoicePresentation = intent;
    this.queuedPreferredVoice = intent;
    const feedback = this.feedbackOwner?.lane === "preferred-voice" ? "" : this.snapshot.feedback;
    if (this.feedbackOwner?.lane === "preferred-voice") this.feedbackOwner = undefined;
    this.replaceProjection({
      feedback,
      pending: Object.freeze({ ...this.snapshot.pending, preferredVoice: true })
    });
    if (!this.preferredVoiceInFlight) void this.flushPreferredVoice();
  }

  async runRecovery(): Promise<"settings" | undefined> {
    const action = this.snapshot.recoveryAction;
    if (!action) return undefined;
    if (action.kind === "open-settings") return "settings";
    if (action.kind === "retry-setup") {
      this.retrySetup();
      return undefined;
    }
    await this.runSetupCommand(action.kind);
    return undefined;
  }

  async playReadingTarget(): Promise<void> {
    if (
      this.snapshot.disposed ||
      !this.snapshot.canPlay ||
      this.inFlightCommands.has("playback")
    ) {
      return;
    }
    const generation = this.visitGeneration;
    const intentGeneration = ++this.intentGeneration;
    this.inFlightCommands.add("playback");
    this.feedbackOwner = Object.freeze({ lane: "playback", intentGeneration });
    this.replaceProjection({
      feedback: "正在读取选区",
      pending: Object.freeze({ ...this.snapshot.pending, playback: true })
    });
    try {
      const result = await this.capabilities.playReadingTarget();
      if (!this.acceptsVisit(generation)) return;
      this.replaceIntentFeedback(intentGeneration, "playback", playbackResultLabel(result));
    } catch {
      if (this.acceptsVisit(generation)) {
        this.replaceIntentFeedback(
          intentGeneration,
          "playback",
          "朗读未开始，请检查连接和朗读设置后重试"
        );
      }
    } finally {
      if (!this.acceptsVisit(generation)) return;
      this.inFlightCommands.delete("playback");
      this.replaceProjection({
        pending: Object.freeze({ ...this.snapshot.pending, playback: false })
      });
    }
  }

  dispose(): void {
    if (this.snapshot.disposed) return;
    this.started = false;
    this.setupGeneration += 1;
    this.visitGeneration += 1;
    this.preferredVoiceInFlight = false;
    this.queuedPreferredVoice = undefined;
    this.preferredVoicePresentation = undefined;
    this.inFlightCommands.clear();
    this.feedbackOwner = undefined;
    this.latestPreferredVoiceIntentGeneration = 0;
    this.snapshot = createInitialSnapshot(true);
    this.emit();
    this.listeners.clear();
  }

  private async loadSetup(): Promise<void> {
    const setupGeneration = ++this.setupGeneration;
    this.replaceProjection({ setup: LOADING_SETUP });
    try {
      const [settings, hasMiniMaxApiKey] = await Promise.all([
        this.capabilities.getSettings(),
        this.capabilities.hasMiniMaxApiKey()
      ]);
      if (!this.acceptsSetup(setupGeneration)) return;
      this.preferredVoicePresentation = undefined;
      this.feedbackOwner = undefined;
      this.replaceProjection({ setup: createReadySetup(settings, hasMiniMaxApiKey), feedback: "" });
    } catch {
      if (!this.acceptsSetup(setupGeneration)) return;
      const setup = Object.freeze({ status: "error" as const, message: SETUP_ERROR_MESSAGE });
      this.replaceProjection({ setup, feedback: SETUP_ERROR_MESSAGE });
    }
  }

  private acceptsSetup(setupGeneration: number): boolean {
    return (
      !this.snapshot.disposed &&
      this.started &&
      this.setupGeneration === setupGeneration
    );
  }

  private acceptsVisit(generation: number): boolean {
    return !this.snapshot.disposed && this.started && this.visitGeneration === generation;
  }

  private async flushPreferredVoice(): Promise<void> {
    if (this.preferredVoiceInFlight) return;
    const generation = this.visitGeneration;
    this.preferredVoiceInFlight = true;
    try {
      while (this.acceptsVisit(generation) && this.queuedPreferredVoice) {
        const intent = this.queuedPreferredVoice;
        this.queuedPreferredVoice = undefined;
        try {
          const settings = await this.capabilities.setPreferredVoice(intent.language, intent.voiceId);
          if (!this.acceptsVisit(generation)) return;
          this.acceptSettings(settings);
        } catch {
          if (!this.acceptsVisit(generation)) return;
          this.queuedPreferredVoice = undefined;
          this.preferredVoicePresentation = undefined;
          this.replaceLatestFeedback(
            this.latestPreferredVoiceIntentGeneration,
            "preferred-voice",
            "Voice 更新失败，请稍后重试。"
          );
          this.replaceProjection({
            pending: Object.freeze({ ...this.snapshot.pending, preferredVoice: false })
          });
          return;
        }
      }
      if (!this.acceptsVisit(generation)) return;
      this.preferredVoicePresentation = undefined;
      this.replaceProjection({
        pending: Object.freeze({ ...this.snapshot.pending, preferredVoice: false })
      });
    } finally {
      if (this.acceptsVisit(generation)) this.preferredVoiceInFlight = false;
    }
  }

  private async runSetupCommand(kind: "verify-key" | "refresh-voices"): Promise<void> {
    if (this.snapshot.disposed || this.inFlightCommands.has("setup")) return;
    const generation = this.visitGeneration;
    const intentGeneration = ++this.intentGeneration;
    this.inFlightCommands.add("setup");
    this.feedbackOwner = Object.freeze({ lane: "setup", intentGeneration });
    this.replaceProjection({
      feedback: kind === "verify-key" ? "正在验证连接" : "正在刷新 Voice",
      pending: Object.freeze({ ...this.snapshot.pending, setup: true })
    });
    try {
      const result =
        kind === "verify-key"
          ? await this.capabilities.verifyMiniMaxKey()
          : await this.capabilities.refreshVoices();
      if (!this.acceptsVisit(generation)) return;
      this.acceptSettings(result.settings);
      if (kind === "verify-key") {
        const hasMiniMaxApiKey = await this.capabilities.hasMiniMaxApiKey();
        if (!this.acceptsVisit(generation)) return;
        this.acceptCredentialPresence(hasMiniMaxApiKey);
      }
      this.replaceIntentFeedback(intentGeneration, "setup", setupResultLabel(kind, result));
    } catch {
      if (this.acceptsVisit(generation)) {
        this.replaceIntentFeedback(intentGeneration, "setup", "处理失败，请前往设置重试");
      }
    } finally {
      if (!this.acceptsVisit(generation)) return;
      this.inFlightCommands.delete("setup");
      this.replaceProjection({
        pending: Object.freeze({ ...this.snapshot.pending, setup: false })
      });
    }
  }

  private acceptSettings(settings: AppSettings, hasMiniMaxApiKey = this.currentHasMiniMaxApiKey()): void {
    this.replaceProjection({ setup: createReadySetup(settings, hasMiniMaxApiKey) });
  }

  private acceptCredentialPresence(hasMiniMaxApiKey: boolean): void {
    if (this.snapshot.setup.status !== "ready") return;
    this.replaceProjection({
      setup: Object.freeze({
        status: "ready" as const,
        value: Object.freeze({
          settings: this.snapshot.setup.value.settings,
          hasMiniMaxApiKey
        })
      })
    });
  }

  private replaceIntentFeedback(
    intentGeneration: number,
    owner: "preferred-voice" | "setup" | "playback",
    feedback: string
  ): void {
    if (
      this.feedbackOwner?.lane !== owner ||
      this.feedbackOwner.intentGeneration !== intentGeneration
    ) {
      return;
    }
    this.replaceProjection({ feedback });
  }

  private replaceLatestFeedback(
    intentGeneration: number,
    owner: FeedbackOwner["lane"],
    feedback: string
  ): void {
    if (this.feedbackOwner && this.feedbackOwner.intentGeneration > intentGeneration) return;
    this.feedbackOwner = Object.freeze({ lane: owner, intentGeneration });
    this.replaceProjection({ feedback });
  }

  private currentHasMiniMaxApiKey(): boolean {
    return this.snapshot.setup.status === "ready"
      ? this.snapshot.setup.value.hasMiniMaxApiKey
      : false;
  }

  private replaceProjection(patch: {
    setup?: HomeSetupResource;
    selectedLanguage?: DetectedLanguage;
    feedback?: string;
    pending?: PendingSnapshot;
  }): void {
    this.replaceSnapshot(
      projectSnapshot(
        patch.setup ?? this.snapshot.setup,
        patch.selectedLanguage ?? this.snapshot.selectedLanguage,
        this.snapshot.disposed,
        patch.pending ?? this.snapshot.pending,
        patch.feedback ?? this.snapshot.feedback,
        this.preferredVoicePresentation
      )
    );
  }

  private replaceSnapshot(snapshot: HomeWorkspaceSnapshot): void {
    if (this.snapshot.disposed) return;
    this.snapshot = snapshot;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

function createInitialSnapshot(disposed: boolean): HomeWorkspaceSnapshot {
  return projectSnapshot(LOADING_SETUP, "zh", disposed, EMPTY_PENDING, "", undefined);
}

function createReadySetup(
  settings: AppSettings,
  hasMiniMaxApiKey: boolean
): Extract<HomeSetupResource, { status: "ready" }> {
  return Object.freeze({
    status: "ready" as const,
    value: Object.freeze({
      settings: deepFreeze(structuredClone(settings)),
      hasMiniMaxApiKey
    })
  });
}

function projectSnapshot(
  setup: HomeSetupResource,
  selectedLanguage: DetectedLanguage,
  disposed: boolean,
  pending: PendingSnapshot,
  feedback: string,
  preferredVoicePresentation: VoiceIntent | undefined
): HomeWorkspaceSnapshot {
  if (setup.status !== "ready") {
    const error = setup.status === "error";
    return Object.freeze({
      setup,
      disposed,
      selectedLanguage,
      availableLanguageGroups: Object.freeze([]),
      activeLanguage: selectedLanguage,
      activeLanguageLabel: languageLabel(selectedLanguage),
      voices: Object.freeze([]),
      selectedVoice: undefined,
      canPlay: false,
      recoveryAction: error
        ? Object.freeze({ kind: "retry-setup" as const, label: "重试" })
        : undefined,
      feedback,
      hasPlaybackFeedback: Boolean(feedback),
      showShortcutStatus: false,
      pending,
      statusLabel: error ? feedback || setup.message : "正在检查朗读配置"
    });
  }

  const settings = setup.value.settings;
  const voiceCatalog: MiniMaxVoice[] = settings.voices.map((voice) => ({ ...voice }));
  const availableLanguageGroups = Object.freeze(
    LANGUAGE_GROUPS.filter((group) => voicesForLanguage(voiceCatalog, group.language).length > 0)
  );
  const activeLanguage = availableLanguageGroups.some(
    (group) => group.language === selectedLanguage
  )
    ? selectedLanguage
    : availableLanguageGroups[0]?.language ?? selectedLanguage;
  const voices = deepFreeze(voicesForLanguage(voiceCatalog, activeLanguage));
  const preferredVoice =
    preferredVoicePresentation?.language === activeLanguage
      ? preferredVoicePresentation.voiceId
      : settings.preferredVoicesByLanguage[activeLanguage] ?? "";
  const selectedVoice = voices.find((voice) => voice.voice_id === preferredVoice) ?? voices[0];
  const readiness = resolveReadiness(setup.value.hasMiniMaxApiKey, settings);

  return Object.freeze({
    setup,
    disposed,
    selectedLanguage,
    availableLanguageGroups,
    activeLanguage,
    activeLanguageLabel: languageLabel(activeLanguage),
    voices,
    selectedVoice,
    canPlay: readiness.canPlay,
    recoveryAction: readiness.recoveryAction,
    feedback,
    hasPlaybackFeedback: Boolean(feedback),
    showShortcutStatus: readiness.canPlay && !feedback,
    pending,
    statusLabel: feedback || readiness.statusLabel
  });
}

function setupResultLabel(
  kind: "verify-key" | "refresh-voices",
  result: MiniMaxSetupResult
): string {
  if (kind === "verify-key") return result.ok ? "连接验证成功" : result.error ?? "连接验证失败";
  return result.usedCachedVoices
    ? `刷新失败，继续使用本地 Voice 缓存：${result.error}`
    : result.ok
      ? "Voice 列表已刷新"
      : result.error ?? "Voice 列表刷新失败";
}

function playbackResultLabel(result: PlaybackStartResult): string {
  if (result.started) {
    return result.stopShortcutAvailable === false
      ? "已开始朗读；Esc 不可用，请从菜单栏停止"
      : "已开始朗读";
  }
  return playbackSkippedLabel(result.skipped);
}

function playbackSkippedLabel(skipped: PlaybackStartResult["skipped"]): string {
  if (skipped === "empty_clipboard") return "没有检测到选区或剪切板文本";
  if (skipped === "missing_api_key") return "需要 API Key";
  if (skipped === "unverified_api_key") return "需要验证连接";
  if (skipped === "missing_voice") return "需要选择 Voice";
  return "未开始播放";
}

function resolveReadiness(
  hasMiniMaxApiKey: boolean,
  settings: DeepReadonly<AppSettings>
): Readonly<{
  canPlay: boolean;
  recoveryAction?: HomeRecoveryAction;
  statusLabel: string;
}> {
  if (!hasMiniMaxApiKey) {
    return Object.freeze({
      canPlay: false,
      recoveryAction: Object.freeze({ kind: "open-settings" as const, label: "去设置 API Key" }),
      statusLabel: "需要 API Key"
    });
  }
  if (settings.apiKeyStatus !== "verified") {
    return Object.freeze({
      canPlay: false,
      recoveryAction: Object.freeze({ kind: "verify-key" as const, label: "验证连接" }),
      statusLabel: "需要验证连接"
    });
  }
  if (!settings.voices.length) {
    return Object.freeze({
      canPlay: false,
      recoveryAction: Object.freeze({ kind: "refresh-voices" as const, label: "刷新 Voice" }),
      statusLabel: "需要 Voice 列表"
    });
  }
  return Object.freeze({ canPlay: true, recoveryAction: undefined, statusLabel: "" });
}

function languageLabel(language: DetectedLanguage): string {
  return LANGUAGE_GROUPS.find((group) => group.language === language)?.label ?? "未知";
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}
