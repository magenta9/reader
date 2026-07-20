import type { AppSettings } from "./bridge.js";

export interface SettingsWorkspaceCapabilities {
  getSettings(): Promise<AppSettings>;
  hasMiniMaxApiKey(): Promise<boolean>;
  getErrorLogCount(): Promise<number>;
  getReadingHistoryCount(): Promise<number>;
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

export type SettingsFeedbackKind = "setup" | "shortcut" | "historyAction" | "historyError";

export interface SettingsVisitSnapshot {
  readonly apiKeyDraft: string;
  readonly customModelDraft: string;
  readonly isRecordingShortcut: boolean;
  readonly confirmClearHistory: boolean;
  readonly feedback: Readonly<Partial<Record<SettingsFeedbackKind, string>>>;
}

export interface SettingsWorkspaceSnapshot {
  readonly settings: WorkspaceResource<DeepReadonly<AppSettings>>;
  readonly miniMaxCredential: WorkspaceResource<boolean>;
  readonly errorLogCount: WorkspaceResource<number>;
  readonly readingHistoryCount: WorkspaceResource<number>;
  readonly canWrite: boolean;
  readonly disposed: boolean;
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

  updateApiKeyDraft(value: string): void {
    this.updateVisit({ apiKeyDraft: value });
  }

  updateCustomModelDraft(value: string): void {
    this.updateVisit({ customModelDraft: value });
  }

  beginShortcutRecording(): void {
    this.updateVisit({ isRecordingShortcut: true });
  }

  requestClearHistoryConfirmation(): void {
    this.updateVisit({ confirmClearHistory: true });
  }

  setFeedback(kind: SettingsFeedbackKind, message: string): void {
    this.updateVisit({ feedback: Object.freeze({ ...this.snapshot.visit.feedback, [kind]: message }) });
  }

  dispose(): void {
    if (this.snapshot.disposed) return;
    this.snapshot = Object.freeze({
      ...this.snapshot,
      disposed: true,
      canWrite: false,
      visit: createInitialVisitSnapshot()
    });
    this.emit();
    this.listeners.clear();
  }

  private loadSettings(): void {
    void this.loadResource(
      "settings",
      async () => freezeSettings(await this.capabilities.getSettings()),
      (settings) => this.replaceSnapshot({ settings })
    );
  }

  private loadMiniMaxCredential(): void {
    void this.loadResource("miniMaxCredential", () => this.capabilities.hasMiniMaxApiKey(), (miniMaxCredential) =>
      this.replaceSnapshot({ miniMaxCredential })
    );
  }

  private loadErrorLogCount(): void {
    void this.loadResource("errorLogCount", () => this.capabilities.getErrorLogCount(), (errorLogCount) =>
      this.replaceSnapshot({ errorLogCount })
    );
  }

  private loadReadingHistoryCount(): void {
    void this.loadResource(
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
    visit: createInitialVisitSnapshot()
  });
}

function createInitialVisitSnapshot(): SettingsVisitSnapshot {
  return Object.freeze({
    apiKeyDraft: "",
    customModelDraft: "",
    isRecordingShortcut: false,
    confirmClearHistory: false,
    feedback: Object.freeze({})
  });
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
