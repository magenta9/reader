import type { AppShellBridge } from "../../shared/bridge-contracts.js";
import { appShellRoleContract } from "../../shared/role-bridge-contracts.js";
import { createRoleBridge } from "../../shared/role-bridge-registry.js";
import { createElectronRendererRoleTransport } from "../electron-renderer-role-transport.js";
import type { PreloadIpc } from "./ipc.js";

export function createAppShellBridge(ipc: PreloadIpc): AppShellBridge {
  return createRoleBridge(appShellRoleContract, createElectronRendererRoleTransport(ipc));
}
