import { describe, expect, it, vi } from "vitest";

import {
  ReaderAppShellController,
  ReaderRouteState,
  type ReaderAppShellLifecycle,
  type ReaderAppShellMenuActions,
  type ReaderAppShellWindow
} from "../../src/main/reader-app-shell-controller.js";
import type { RouteSnapshot } from "../../src/shared/app-contracts.js";

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

  it("reports initialization only after a required Reader Window has loaded", async () => {
    const harness = createHarness({ hasCompletedOnboarding: false });
    let initialized = false;
    const initialization = harness.shell.start().then(() => {
      initialized = true;
    });

    harness.windows[0]?.readyToShow();
    await Promise.resolve();
    expect(initialized).toBe(false);

    harness.windows[0]?.loaded();
    await initialization;
    expect(initialized).toBe(true);
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

    expect(harness.commandActions).toEqual(["play:menu_bar", "stop"]);
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
    expect(harness.disposals).toEqual(["menu", "activate", "beforeQuit", "windowAllClosed"]);
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

  it("rejects invalid runtime routes without changing the route snapshot", () => {
    const harness = createHarness();
    harness.shell.open("home");

    expect(harness.shell.acceptRendererRoute("unknown")).toBeUndefined();
    expect(harness.shell.getBootstrapState().route).toEqual({ route: "home", revision: 0 });
    expect(harness.persistedRoutes).toEqual([]);
  });

  it("does not advance the route snapshot when persistence fails and can retry", () => {
    const setLastRoute = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("database busy");
      })
      .mockImplementation(() => undefined);
    const routeState = new ReaderRouteState("home", { setLastRoute });

    expect(() => routeState.accept("history")).toThrow("database busy");
    expect(routeState.snapshot()).toEqual({ route: "home", revision: 0 });

    expect(routeState.accept("history")).toEqual({ route: "history", revision: 1 });
    expect(setLastRoute).toHaveBeenCalledTimes(2);
  });

  it("does not advance onboarding state when persistence fails", () => {
    const harness = createHarness({ hasCompletedOnboarding: false });
    harness.failOnboardingPersistence = true;

    expect(() => harness.shell.setOnboardingComplete(true)).toThrow("database busy");
    expect(harness.shell.getBootstrapState().hasCompletedOnboarding).toBe(false);
  });

  it("publishes Reader feedback only to the live Reader Window", () => {
    const harness = createHarness();

    harness.shell.finishPlayback(1);
    harness.shell.open("home");
    const window = harness.windows[0];
    harness.shell.finishPlayback(2);
    harness.shell.failPlayback(3);
    harness.shell.stopPlayback(4);
    if (window) window.destroyed = true;
    harness.shell.finishPlayback(5);

    expect(window?.feedback).toEqual(["finish:2", "fail:3", "stop:4"]);
  });

  it("runs shutdown and detaches lifecycle listeners exactly once before quit", () => {
    const harness = createHarness();
    harness.shell.start();

    harness.lifecycle.beforeQuit();
    harness.lifecycle.beforeQuit();

    expect(harness.shutdown).toHaveBeenCalledOnce();
    expect(harness.disposals).toEqual(["menu", "activate", "beforeQuit", "windowAllClosed"]);
  });
});

class FakeReaderWindow implements ReaderAppShellWindow {
  readonly actions: string[] = [];
  readonly routes: RouteSnapshot[] = [];
  readonly feedback: string[] = [];
  destroyed = false;
  minimized = false;
  private closeListener: ((event: { preventDefault(): void }) => void) | undefined;
  private readyListener: (() => void) | undefined;
  private loadedListener: (() => void) | undefined;

  isDestroyed(): boolean {
    return this.destroyed;
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

  sendRoute(snapshot: RouteSnapshot): void {
    this.routes.push(snapshot);
  }

  sendPlaybackFinish(sessionId: number): void {
    this.feedback.push(`finish:${sessionId}`);
  }

  sendPlaybackFail(sessionId: number): void {
    this.feedback.push(`fail:${sessionId}`);
  }

  sendPlaybackStop(sessionId: number): void {
    this.feedback.push(`stop:${sessionId}`);
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

  onLoaded(listener: () => void): () => void {
    this.loadedListener = listener;
    return () => {
      if (this.loadedListener === listener) this.loadedListener = undefined;
    };
  }

  ready(): void {
    this.readyToShow();
    this.loaded();
  }

  readyToShow(): void {
    this.readyListener?.();
  }

  loaded(): void {
    this.loadedListener?.();
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

  keepAliveAfterAllWindowsClosed(): () => void {
    return () => this.disposals.push("windowAllClosed");
  }

  quit(): void {
    this.quitCalls += 1;
  }

  activate(): void {
    this.activateListener?.();
  }

  beforeQuit(): void {
    this.beforeQuitListener?.();
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
  let failOnboardingPersistence = false;
  let lastRoute = options.lastRoute ?? "home";
  let menu: ReaderAppShellMenuActions | undefined;
  const shutdown = vi.fn();

  const shell = new ReaderAppShellController({
    state: {
      read: () => ({ hasCompletedOnboarding, lastRoute }),
      setLastRoute: (route) => {
        lastRoute = route;
        persistedRoutes.push(route);
      },
      setOnboardingComplete: (complete) => {
        if (failOnboardingPersistence) throw new Error("database busy");
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
      play: async (trigger) => {
        commandActions.push(`play:${trigger}`);
      },
      stop: () => commandActions.push("stop")
    },
    shutdown
  });

  return {
    shell,
    windows,
    persistedRoutes,
    onboardingUpdates,
    commandActions,
    disposals,
    lifecycle,
    shutdown,
    get failOnboardingPersistence() {
      return failOnboardingPersistence;
    },
    set failOnboardingPersistence(value: boolean) {
      failOnboardingPersistence = value;
    },
    get menu() {
      return menu;
    }
  };
}
