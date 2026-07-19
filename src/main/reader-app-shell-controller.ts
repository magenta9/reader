import type { AppRoute, BootstrapState } from "../shared/app-contracts.js";

const APP_ROUTES: readonly AppRoute[] = ["home", "history", "favorites", "settings"];

export interface ReaderRouteSnapshot {
  route: AppRoute;
  revision: number;
}

export interface ReaderAppShellBootstrapState {
  hasCompletedOnboarding: boolean;
  route: ReaderRouteSnapshot;
}

export interface ReaderAppShellWindowCloseEvent {
  preventDefault(): void;
}

export interface ReaderAppShellWindow {
  readonly senderId: number;
  isDestroyed(): boolean;
  isFocused(): boolean;
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
  hide(): void;
  sendRoute(snapshot: ReaderRouteSnapshot): void;
  onClose(listener: (event: ReaderAppShellWindowCloseEvent) => void): () => void;
  onReady(listener: () => void): () => void;
}

export interface ReaderAppShellWindowFactory {
  create(): ReaderAppShellWindow;
}

export interface ReaderAppShellState {
  read(): BootstrapState;
  setLastRoute(route: AppRoute): void;
  setOnboardingComplete(complete: boolean): void;
}

export interface ReaderAppShellLifecycle {
  wasOpenedAtLogin(): boolean;
  onActivate(listener: () => void): () => void;
  onBeforeQuit(listener: () => void): () => void;
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
  play(): Promise<void> | void;
  stop(): void;
}

export interface ReaderAppShellOptions {
  state: ReaderAppShellState;
  windows: ReaderAppShellWindowFactory;
  menu: ReaderAppShellMenu;
  lifecycle: ReaderAppShellLifecycle;
  presence: ReaderAppShellPresence;
  playback: ReaderAppShellPlaybackCommands;
}

export class ReaderAppShellController {
  private readonly disposers: Array<() => void> = [];
  private readonly windowDisposers: Array<() => void> = [];
  private currentWindow: ReaderAppShellWindow | undefined;
  private desiredRoute: AppRoute;
  private routeRevision = 0;
  private deliveredRevision = -1;
  private hasCompletedOnboarding: boolean;
  private isQuitting = false;
  private isStarted = false;
  private isDisposed = false;
  private isWindowReady = false;

  constructor(private readonly options: ReaderAppShellOptions) {
    const initialState = options.state.read();
    this.desiredRoute = initialState.lastRoute;
    this.hasCompletedOnboarding = initialState.hasCompletedOnboarding;
  }

  start(): void {
    if (this.isStarted || this.isDisposed) return;
    this.isStarted = true;
    this.disposers.push(this.options.menu.install(this.createMenuActions()));
    this.disposers.push(
      this.options.lifecycle.onActivate(() => {
        this.open(this.desiredRoute);
      })
    );
    this.disposers.push(
      this.options.lifecycle.onBeforeQuit(() => {
        this.isQuitting = true;
      })
    );

    if (!this.hasCompletedOnboarding || !this.options.lifecycle.wasOpenedAtLogin()) {
      this.open(this.desiredRoute);
    }
  }

  open(route: unknown): boolean {
    if (!isAppRoute(route) || this.isDisposed) return false;
    this.acceptRoute(route);
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

  acceptRendererRoute(route: unknown): boolean {
    if (!isAppRoute(route) || this.isDisposed) return false;
    this.acceptRoute(route);
    this.publishRoute();
    return true;
  }

  getBootstrapState(): ReaderAppShellBootstrapState {
    return {
      hasCompletedOnboarding: this.hasCompletedOnboarding,
      route: this.currentRouteSnapshot()
    };
  }

  setOnboardingComplete(complete: boolean): void {
    this.hasCompletedOnboarding = complete;
    this.options.state.setOnboardingComplete(complete);
  }

  isFocusedReaderSender(senderId: number): boolean {
    const window = this.getLiveWindow();
    return Boolean(window && window.senderId === senderId && window.isFocused());
  }

  hideForSelectionCapture(): void {
    this.options.presence.hideForSelectionCapture();
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
      play: () => this.options.playback.play(),
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

  private acceptRoute(route: AppRoute): void {
    if (route === this.desiredRoute) return;
    this.desiredRoute = route;
    this.routeRevision += 1;
    this.options.state.setLastRoute(route);
  }

  private attachWindow(window: ReaderAppShellWindow): void {
    this.disposeWindowListeners();
    this.currentWindow = window;
    this.isWindowReady = false;
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
        this.publishRoute();
      })
    );
  }

  private publishRoute(): void {
    const window = this.getLiveWindow();
    if (!window || !this.isWindowReady || this.deliveredRevision === this.routeRevision) return;
    window.sendRoute(this.currentRouteSnapshot());
    this.deliveredRevision = this.routeRevision;
  }

  private currentRouteSnapshot(): ReaderRouteSnapshot {
    return { route: this.desiredRoute, revision: this.routeRevision };
  }

  private getLiveWindow(): ReaderAppShellWindow | undefined {
    if (!this.currentWindow || this.currentWindow.isDestroyed()) {
      this.disposeWindowListeners();
      this.currentWindow = undefined;
      this.isWindowReady = false;
      this.deliveredRevision = -1;
    }
    return this.currentWindow;
  }

  private disposeWindowListeners(): void {
    for (const dispose of this.windowDisposers) dispose();
    this.windowDisposers.splice(0);
  }
}

function isAppRoute(value: unknown): value is AppRoute {
  return APP_ROUTES.includes(value as AppRoute);
}
