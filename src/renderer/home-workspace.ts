import type { AppSettings } from "./bridge.js";
import type { DetectedLanguage, MiniMaxVoice } from "../shared/types.js";
import { voicesForLanguage } from "../shared/voices.js";

export interface HomeWorkspaceCapabilities {
  getSettings(): Promise<AppSettings>;
  hasMiniMaxApiKey(): Promise<boolean>;
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
  readonly statusLabel: string;
}

type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T;

type Listener = () => void;

const LANGUAGE_GROUPS = Object.freeze([
  Object.freeze({ language: "zh" as const, label: "中文" }),
  Object.freeze({ language: "en" as const, label: "英文" }),
  Object.freeze({ language: "ja" as const, label: "日文" }),
  Object.freeze({ language: "ko" as const, label: "韩文" })
]);

const LOADING_SETUP = Object.freeze({ status: "loading" } as const);
const SETUP_ERROR_MESSAGE = "无法读取朗读配置";

export class HomeWorkspace {
  private snapshot = createInitialSnapshot(false);
  private readonly listeners = new Set<Listener>();
  private started = false;
  private setupGeneration = 0;

  constructor(private readonly capabilities: HomeWorkspaceCapabilities) {}

  getSnapshot = (): HomeWorkspaceSnapshot => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(): void {
    if (this.started) return;
    if (this.snapshot.disposed) this.snapshot = createInitialSnapshot(false);
    this.started = true;
    void this.loadSetup();
  }

  retrySetup(): void {
    if (this.snapshot.disposed) return;
    void this.loadSetup();
  }

  selectLanguage(language: DetectedLanguage): void {
    if (this.snapshot.disposed || this.snapshot.selectedLanguage === language) return;
    this.replaceSnapshot(projectSnapshot(this.snapshot.setup, language, false));
  }

  dispose(): void {
    if (this.snapshot.disposed) return;
    this.started = false;
    this.setupGeneration += 1;
    this.snapshot = createInitialSnapshot(true);
    this.emit();
    this.listeners.clear();
  }

  private async loadSetup(): Promise<void> {
    const setupGeneration = ++this.setupGeneration;
    this.replaceSnapshot(projectSnapshot(LOADING_SETUP, this.snapshot.selectedLanguage, false));
    try {
      const [settings, hasMiniMaxApiKey] = await Promise.all([
        this.capabilities.getSettings(),
        this.capabilities.hasMiniMaxApiKey()
      ]);
      if (!this.acceptsSetup(setupGeneration)) return;
      const setup = Object.freeze({
        status: "ready" as const,
        value: Object.freeze({
          settings: deepFreeze(structuredClone(settings)),
          hasMiniMaxApiKey
        })
      });
      this.replaceSnapshot(projectSnapshot(setup, this.snapshot.selectedLanguage, false));
    } catch {
      if (!this.acceptsSetup(setupGeneration)) return;
      const setup = Object.freeze({ status: "error" as const, message: SETUP_ERROR_MESSAGE });
      this.replaceSnapshot(projectSnapshot(setup, this.snapshot.selectedLanguage, false));
    }
  }

  private acceptsSetup(setupGeneration: number): boolean {
    return (
      !this.snapshot.disposed &&
      this.started &&
      this.setupGeneration === setupGeneration
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
  return projectSnapshot(LOADING_SETUP, "zh", disposed);
}

function projectSnapshot(
  setup: HomeSetupResource,
  selectedLanguage: DetectedLanguage,
  disposed: boolean
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
      statusLabel: error ? setup.message : "正在检查朗读配置"
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
  const preferredVoice = settings.preferredVoicesByLanguage[activeLanguage] ?? "";
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
    statusLabel: readiness.statusLabel
  });
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
