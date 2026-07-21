import type { IpcRendererEvent } from "electron";

import type { RendererRoleBridgeTransport } from "../shared/role-bridge-registry.js";

export interface ElectronRendererIpc {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, listener: ElectronRendererIpcListener) => void;
  off: (channel: string, listener: ElectronRendererIpcListener) => void;
}

type ElectronRendererIpcListener = (event: IpcRendererEvent, ...args: unknown[]) => void;

export function createElectronRendererRoleTransport(
  ipc: ElectronRendererIpc
): RendererRoleBridgeTransport {
  return {
    invoke: (channel, args) => ipc.invoke(channel, ...args),
    subscribe: (channel, listener) => {
      const handler: ElectronRendererIpcListener = (_event, ...args) => listener(...args);
      ipc.on(channel, handler);
      return () => ipc.off(channel, handler);
    }
  };
}
