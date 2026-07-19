import type { RendererRoleBridgeTransport } from "../shared/role-bridge-registry.js";
import type { PreloadIpc } from "./bridge-adapters/ipc.js";

export function createElectronRendererRoleTransport(
  ipc: PreloadIpc
): RendererRoleBridgeTransport {
  return {
    invoke: (channel, args) => ipc.invoke(channel, ...args),
    subscribe: (channel, listener) => {
      const handler: Parameters<PreloadIpc["on"]>[1] = (_event, ...args) => listener(...args);
      ipc.on(channel, handler);
      return () => ipc.off(channel, handler);
    }
  };
}
