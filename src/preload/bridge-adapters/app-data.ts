import type { AppDataBridge } from "../../shared/bridge-contracts.js";
import { appDataRoleContract } from "../../shared/role-bridge-contracts.js";
import { createRoleBridge } from "../../shared/role-bridge-registry.js";
import { createElectronRendererRoleTransport } from "../electron-renderer-role-transport.js";
import type { PreloadIpc } from "./ipc.js";

export function createAppDataBridge(ipc: PreloadIpc): AppDataBridge {
  return createRoleBridge(appDataRoleContract, createElectronRendererRoleTransport(ipc));
}
