import { describe, expect, it, vi } from "vitest";

import { createAppShellBridge } from "../../src/preload/bridge-adapters/app-shell.js";
import type { PreloadIpc } from "../../src/preload/bridge-adapters/ipc.js";
import { APP_SHELL_CHANNELS } from "../../src/shared/bridge-contracts.js";

describe("Electron renderer role transport", () => {
  it("preserves invoke arguments and removes the exact navigate listener", async () => {
    const listeners = new Map<string, Parameters<PreloadIpc["on"]>[1]>();
    const invoke = vi.fn(async () => undefined);
    const on = vi.fn((channel: string, listener: Parameters<PreloadIpc["on"]>[1]) => {
      listeners.set(channel, listener);
    });
    const off = vi.fn();
    const bridge = createAppShellBridge({ invoke, on, off });
    const navigate = vi.fn();

    await bridge.setRoute("favorites");
    const unsubscribe = bridge.onNavigate(navigate);
    listeners.get(APP_SHELL_CHANNELS.navigate)?.({} as never, "settings");
    unsubscribe();

    expect(invoke).toHaveBeenCalledWith(APP_SHELL_CHANNELS.setRoute, "favorites");
    expect(navigate).toHaveBeenCalledWith("settings");
    expect(off).toHaveBeenCalledWith(
      APP_SHELL_CHANNELS.navigate,
      listeners.get(APP_SHELL_CHANNELS.navigate)
    );
  });
});
