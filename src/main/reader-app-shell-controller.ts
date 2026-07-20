import {
  isAppRoute,
  type AppRoute,
  type BootstrapState,
  type RouteSnapshot
} from "../shared/app-contracts.js";
import type { ReadingTargetAcquisitionTrigger } from "./reading-target/reading-target-acquirer.js";

export interface ReaderAppShellWindowCloseEvent {
  preventDefault(): void;
}

export interface ReaderAppShellWindow {
  isDestroyed(): boolean;
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
  hide(): void;
  sendRoute(snapshot: RouteSnapshot): void;
  sendPlaybackFinish(sessionId: number): void;
  sendPlaybackFail(sessionId: number): void;
  sendPlaybackStop(sessionId: number): void;
  onClose(listener: (event: ReaderAppShellWindowCloseEvent) => void): () => void;
  onReady(listener: () => void): () => void;
  onLoaded(listener: () => void): () => void;
}

export interface ReaderAppShellWindowFactory {
  create(): ReaderAppShellWindow;
}

export interface ReaderAppShellState {
  read(): ReaderAppShellStoredState;
  setLastRoute(route: AppRoute): void;
  setOnboardingComplete(complete: boolean): void;
}

export interface ReaderAppShellStoredState {
  hasCompletedOnboarding: boolean;
  lastRoute: AppRoute;
}

export interface ReaderAppShellLifecycle {
  wasOpenedAtLogin(): boolean;
  onActivate(listener: () => void): () => void;
  onBeforeQuit(listener: () => void): () => void;
  keepAliveAfterAllWindowsClosed(): () => void;
  quit(): void;
}

export interface ReaderAppShellMenuActions {
  play(): Promise<void> | void;
  stop(): void;
  home(): void;
  history(): void;
  favorites(): void;
  settings(): void;
  quit(): void;
}

export interface ReaderAppShellMenu {
  install(actions: ReaderAppShellMenuActions): () => void;
}

export interface ReaderAppShellPresence {
  ensureVisible(): void;
  hideForSelectionCapture(): void;
}

export interface ReaderAppShellPlaybackCommands {
  play(trigger: ReadingTargetAcquisitionTrigger): Promise<void> | void;
  stop(): void;
}

export interface ReaderAppShellOptions {
  state: ReaderAppShellState;
  windows: ReaderAppShellWindowFactory;
  menu: ReaderAppShellMenu;
  lifecycle: ReaderAppShellLifecycle;
  presence: ReaderAppShellPresence;
  playback: ReaderAppShellPlaybackCommands;
  shutdown(): void;
}

export class ReaderRouteState {
  private route: AppRoute;
  private revision = 0;

  constructor(
    initialRoute: AppRoute,
    private readonly state: Pick<ReaderAppShellState, "setLastRoute">
  ) {
    this.route = initialRoute;
  }

  accept(route: unknown): RouteSnapshot | undefined {
    if (!isAppRoute(route)) return undefined;
    if (route === this.route) return this.snapshot();
    this.state.setLastRoute(route);
    this.route = route;
    this.revision += 1;
    return this.snapshot();
  }

  snapshot(): RouteSnapshot {
    return { route: this.route, revision: this.revision };
  }
}

export class ReaderAppShellController {
  private readonly disposers: Array<() => void> = [];
  private readonly windowDisposers: Array<() => void> = [];
  private readonly routeState: ReaderRouteState;
  private currentWindow: ReaderAppShellWindow | undefined;
  private deliveredRevision = -1;
  private hasCompletedOnboarding: boolean;
  private isQuitting = false;
  private isStarted = false;
  private isDisposed = false;
  private hasShutdown = false;
  private isWindowLoaded = false;
  private isWindowReady = false;
  private readonly initialized: Promise<void>;
  private resolveInitialized!: () => void;

  constructor(private readonly options: ReaderAppShellOptions) {
    this.initialized = new Promise((resolve) => {
      this.resolveInitialized = resolve;
    });
    const initialState = options.state.read();
    this.routeState = new ReaderRouteState(initialState.lastRoute, options.state);
    this.hasCompletedOnboarding = initialState.hasCompletedOnboarding;
  }

  start(): Promise<void> {
    if (this.isStarted || this.isDisposed) return this.initialized;
    this.isStarted = true;
    this.disposers.push(this.options.menu.install(this.createMenuActions()));
    this.disposers.push(
      this.options.lifecycle.onActivate(() => {
        this.open(this.currentRouteSnapshot().route);
      })
    );
    this.disposers.push(
      this.options.lifecycle.onBeforeQuit(() => {
        this.prepareToQuit();
      })
    );
    this.disposers.push(this.options.lifecycle.keepAliveAfterAllWindowsClosed());

    if (!this.hasCompletedOnboarding || !this.options.lifecycle.wasOpenedAtLogin()) {
      this.open(this.currentRouteSnapshot().route);
    } else {
      this.resolveInitialized();
    }
    return this.initialized;
  }

  open(route: unknown): boolean {
    if (this.isDisposed || !this.routeState.accept(route)) return false;
    this.options.presence.ensureVisible();

    const window = this.getLiveWindow();
    if (!window) {
      this.attachWindow(this.options.windows.create());
      return true;
    }

    if (this.isWindowReady) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      this.publishRoute();
    }
    return true;
  }

  acceptRendererRoute(route: unknown): RouteSnapshot | undefined {
    if (this.isDisposed) return undefined;
    const snapshot = this.routeState.accept(route);
    if (!snapshot) return undefined;
    this.publishRoute();
    return snapshot;
  }

  getBootstrapState(): BootstrapState {
    return {
      hasCompletedOnboarding: this.hasCompletedOnboarding,
      route: this.currentRouteSnapshot()
    };
  }

  setOnboardingComplete(complete: boolean): void {
    this.options.state.setOnboardingComplete(complete);
    this.hasCompletedOnboarding = complete;
  }

  hideForSelectionCapture(): void {
    this.options.presence.hideForSelectionCapture();
  }

  finishPlayback(sessionId: number): void {
    if (this.isDisposed) return;
    this.getLiveWindow()?.sendPlaybackFinish(sessionId);
  }

  failPlayback(sessionId: number): void {
    if (this.isDisposed) return;
    this.getLiveWindow()?.sendPlaybackFail(sessionId);
  }

  stopPlayback(sessionId: number): void {
    if (this.isDisposed) return;
    this.getLiveWindow()?.sendPlaybackStop(sessionId);
  }

  requestQuit(): void {
    this.isQuitting = true;
    this.options.lifecycle.quit();
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.disposeWindowListeners();
    for (const dispose of this.disposers) dispose();
    this.disposers.splice(0);
  }

  private createMenuActions(): ReaderAppShellMenuActions {
    return {
      play: () => this.options.playback.play("menu_bar"),
      stop: () => this.options.playback.stop(),
      home: () => {
        this.open("home");
      },
      history: () => {
        this.open("history");
      },
      favorites: () => {
        this.open("favorites");
      },
      settings: () => {
        this.open("settings");
      },
      quit: () => this.requestQuit()
    };
  }

  private attachWindow(window: ReaderAppShellWindow): void {
    this.disposeWindowListeners();
    this.currentWindow = window;
    this.isWindowReady = false;
    this.isWindowLoaded = false;
    this.deliveredRevision = -1;
    this.windowDisposers.push(
      window.onClose((event) => {
        if (this.isDisposed || this.isQuitting) return;
        event.preventDefault();
        window.hide();
      }),
      window.onReady(() => {
        if (
          this.isDisposed ||
          this.currentWindow !== window ||
          this.isWindowReady ||
          window.isDestroyed()
        ) {
          return;
        }
        this.isWindowReady = true;
        window.show();
        window.focus();
      }),
      window.onLoaded(() => {
        if (
          this.isDisposed ||
          this.currentWindow !== window ||
          this.isWindowLoaded ||
          window.isDestroyed()
        ) {
          return;
        }
        this.isWindowLoaded = true;
        this.publishRoute();
        this.resolveInitialized();
      })
    );
  }

  private publishRoute(): void {
    const window = this.getLiveWindow();
    const snapshot = this.currentRouteSnapshot();
    if (!window || !this.isWindowLoaded || this.deliveredRevision === snapshot.revision) return;
    window.sendRoute(snapshot);
    this.deliveredRevision = snapshot.revision;
  }

  private currentRouteSnapshot(): RouteSnapshot {
    return this.routeState.snapshot();
  }

  private getLiveWindow(): ReaderAppShellWindow | undefined {
    if (!this.currentWindow || this.currentWindow.isDestroyed()) {
      this.disposeWindowListeners();
      this.currentWindow = undefined;
      this.isWindowReady = false;
      this.isWindowLoaded = false;
      this.deliveredRevision = -1;
    }
    return this.currentWindow;
  }

  private disposeWindowListeners(): void {
    for (const dispose of this.windowDisposers) dispose();
    this.windowDisposers.splice(0);
  }

  private prepareToQuit(): void {
    if (this.hasShutdown) return;
    this.hasShutdown = true;
    this.isQuitting = true;
    this.options.shutdown();
    this.dispose();
  }
}
