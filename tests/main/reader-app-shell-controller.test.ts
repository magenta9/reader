import { describe, expect, it, vi } from "vitest";

import {
  ReaderAppShellController,
  type ReaderAppShellLifecycle,
  type ReaderAppShellMenuActions,
  type ReaderAppShellWindow,
  type ReaderRouteSnapshot
} from "../../src/main/reader-app-shell-controller.js";

describe("ReaderAppShellController", () => {
  it("starts the Reader Window for onboarding but keeps a login launch in the menu bar", () => {
    const onboarding = createHarness({ hasCompletedOnboarding: false, wasOpenedAtLogin: true });
    onboarding.shell.start();
    expect(onboarding.windows).toHaveLength(1);

    const loginLaunch = createHarness({ hasCompletedOnboarding: true, wasOpenedAtLogin: true });
    loginLaunch.shell.start();
    expect(loginLaunch.windows).toHaveLength(0);

    loginLaunch.lifecycle.activate();
    expect(loginLaunch.windows).toHaveLength(1);
  });

  it("publishes only the latest route after the window becomes ready", () => {
    const harness = createHarness();

    expect(harness.shell.open("history")).toBe(true);
    expect(harness.shell.open("favorites")).toBe(true);

    expect(harness.persistedRoutes).toEqual(["history", "favorites"]);
    expect(harness.windows[0]?.routes).toEqual([]);

    harness.windows[0]?.ready();
    harness.windows[0]?.ready();

    expect(harness.windows[0]?.routes).toEqual([{ route: "favorites", revision: 2 }]);
    expect(harness.windows[0]?.actions).toEqual(["show", "focus"]);
  });

  it("reuses, restores, shows and focuses the single Reader Window", () => {
    const harness = createHarness();
    harness.shell.open("home");
    const window = harness.windows[0];
    window?.ready();
    window?.actions.splice(0);
    if (window) window.minimized = true;

    harness.shell.open("settings");

    expect(harness.windows).toHaveLength(1);
    expect(window?.actions).toEqual(["restore", "show", "focus"]);
    expect(window?.routes).toEqual([
      { route: "home", revision: 0 },
      { route: "settings", revision: 1 }
    ]);
  });

  it("exposes the current ordered bootstrap state and persists onboarding", () => {
    const harness = createHarness({ hasCompletedOnboarding: false, lastRoute: "history" });
    harness.shell.open("settings");
    harness.shell.setOnboardingComplete(true);

    expect(harness.shell.getBootstrapState()).toEqual({
      hasCompletedOnboarding: true,
      route: { route: "settings", revision: 1 }
    });
    expect(harness.onboardingUpdates).toEqual([true]);
  });

  it("maps the menu to shell, playback and quit commands", async () => {
    const harness = createHarness();
    harness.shell.start();

    await harness.menu?.play();
    harness.menu?.stop();
    harness.menu?.history();
    harness.menu?.favorites();
    harness.menu?.settings();
    harness.menu?.home();
    harness.menu?.quit();

    expect(harness.commandActions).toEqual(["play", "stop"]);
    expect(harness.persistedRoutes).toEqual(["history", "favorites", "settings", "home"]);
    expect(harness.lifecycle.quitCalls).toBe(1);
  });

  it("hides on close unless quit has been requested and disposes registrations once", () => {
    const harness = createHarness();
    harness.shell.start();
    const window = harness.windows[0];
    const close = window?.close();

    expect(close?.prevented).toBe(true);
    expect(window?.actions).toContain("hide");

    harness.shell.requestQuit();
    const quittingClose = window?.close();
    expect(quittingClose?.prevented).toBe(false);

    harness.shell.dispose();
    harness.shell.dispose();
    expect(harness.disposals).toEqual(["menu", "activate", "beforeQuit"]);
  });

  it("detaches window lifecycle listeners when disposed", () => {
    const harness = createHarness();
    harness.shell.open("home");
    const window = harness.windows[0];

    harness.shell.dispose();
    window?.ready();
    const close = window?.close();

    expect(window?.actions).toEqual([]);
    expect(window?.routes).toEqual([]);
    expect(close?.prevented).toBe(false);
  });

  it("owns sender focus checks and rejects invalid runtime routes", () => {
    const harness = createHarness();
    harness.shell.open("home");
    const window = harness.windows[0];
    window?.ready();
    if (window) window.focused = true;

    expect(harness.shell.isFocusedReaderSender(17)).toBe(true);
    expect(harness.shell.isFocusedReaderSender(18)).toBe(false);
    expect(harness.shell.acceptRendererRoute("unknown")).toBe(false);
    expect(harness.shell.getBootstrapState().route).toEqual({ route: "home", revision: 0 });
    expect(harness.persistedRoutes).toEqual([]);
  });
});

class FakeReaderWindow implements ReaderAppShellWindow {
  readonly senderId = 17;
  readonly actions: string[] = [];
  readonly routes: ReaderRouteSnapshot[] = [];
  destroyed = false;
  focused = false;
  minimized = false;
  private closeListener: ((event: { preventDefault(): void }) => void) | undefined;
  private readyListener: (() => void) | undefined;

  isDestroyed(): boolean {
    return this.destroyed;
  }

  isFocused(): boolean {
    return this.focused;
  }

  isMinimized(): boolean {
    return this.minimized;
  }

  restore(): void {
    this.actions.push("restore");
    this.minimized = false;
  }

  show(): void {
    this.actions.push("show");
  }

  focus(): void {
    this.actions.push("focus");
  }

  hide(): void {
    this.actions.push("hide");
  }

  sendRoute(snapshot: ReaderRouteSnapshot): void {
    this.routes.push(snapshot);
  }

  onClose(listener: (event: { preventDefault(): void }) => void): () => void {
    this.closeListener = listener;
    return () => {
      if (this.closeListener === listener) this.closeListener = undefined;
    };
  }

  onReady(listener: () => void): () => void {
    this.readyListener = listener;
    return () => {
      if (this.readyListener === listener) this.readyListener = undefined;
    };
  }

  ready(): void {
    this.readyListener?.();
  }

  close(): { prevented: boolean } {
    const result = { prevented: false };
    this.closeListener?.({ preventDefault: () => (result.prevented = true) });
    return result;
  }
}

class FakeLifecycle implements ReaderAppShellLifecycle {
  quitCalls = 0;
  private activateListener: (() => void) | undefined;
  private beforeQuitListener: (() => void) | undefined;

  constructor(private readonly openedAtLogin: boolean, private readonly disposals: string[]) {}

  wasOpenedAtLogin(): boolean {
    return this.openedAtLogin;
  }

  onActivate(listener: () => void): () => void {
    this.activateListener = listener;
    return () => this.disposals.push("activate");
  }

  onBeforeQuit(listener: () => void): () => void {
    this.beforeQuitListener = listener;
    return () => this.disposals.push("beforeQuit");
  }

  quit(): void {
    this.quitCalls += 1;
  }

  activate(): void {
    this.activateListener?.();
  }
}

function createHarness(options: {
  hasCompletedOnboarding?: boolean;
  lastRoute?: "home" | "history" | "favorites" | "settings";
  wasOpenedAtLogin?: boolean;
} = {}) {
  const windows: FakeReaderWindow[] = [];
  const persistedRoutes: string[] = [];
  const onboardingUpdates: boolean[] = [];
  const commandActions: string[] = [];
  const disposals: string[] = [];
  const lifecycle = new FakeLifecycle(options.wasOpenedAtLogin ?? false, disposals);
  let hasCompletedOnboarding = options.hasCompletedOnboarding ?? true;
  let lastRoute = options.lastRoute ?? "home";
  let menu: ReaderAppShellMenuActions | undefined;

  const shell = new ReaderAppShellController({
    state: {
      read: () => ({ hasCompletedOnboarding, lastRoute }),
      setLastRoute: (route) => {
        lastRoute = route;
        persistedRoutes.push(route);
      },
      setOnboardingComplete: (complete) => {
        hasCompletedOnboarding = complete;
        onboardingUpdates.push(complete);
      }
    },
    windows: {
      create: () => {
        const window = new FakeReaderWindow();
        windows.push(window);
        return window;
      }
    },
    menu: {
      install: (actions) => {
        menu = actions;
        return () => disposals.push("menu");
      }
    },
    lifecycle,
    presence: {
      ensureVisible: vi.fn(),
      hideForSelectionCapture: vi.fn()
    },
    playback: {
      play: async () => {
        commandActions.push("play");
      },
      stop: () => commandActions.push("stop")
    }
  });

  return {
    shell,
    windows,
    persistedRoutes,
    onboardingUpdates,
    commandActions,
    disposals,
    lifecycle,
    get menu() {
      return menu;
    }
  };
}
