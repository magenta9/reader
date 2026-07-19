import { describe, expect, it, vi } from "vitest";

import {
  createElectronRendererRoleTransport,
  type ElectronRendererIpc
} from "../../src/preload/electron-renderer-role-transport.js";
import { APP_SHELL_CHANNELS } from "../../src/shared/bridge-contracts.js";
import { appShellRoleContract } from "../../src/shared/role-bridge-contracts.js";
import { createRoleBridge } from "../../src/shared/role-bridge-registry.js";

describe("Electron renderer role transport", () => {
  it("preserves invoke arguments and removes the exact navigate listener", async () => {
    const listeners = new Map<string, Parameters<ElectronRendererIpc["on"]>[1]>();
    const invoke = vi.fn(async () => undefined);
    const on = vi.fn((channel: string, listener: Parameters<ElectronRendererIpc["on"]>[1]) => {
      listeners.set(channel, listener);
    });
    const off = vi.fn();
    const bridge = createRoleBridge(
      appShellRoleContract,
      createElectronRendererRoleTransport({ invoke, on, off })
    );
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
