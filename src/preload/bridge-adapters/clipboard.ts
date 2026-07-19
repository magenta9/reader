import type { ClipboardBridge } from "../../shared/bridge-contracts.js";
import { clipboardRoleContract } from "../../shared/role-bridge-contracts.js";
import { createRoleBridge } from "../../shared/role-bridge-registry.js";
import { createElectronRendererRoleTransport } from "../electron-renderer-role-transport.js";
import type { PreloadIpc } from "./ipc.js";

export function createClipboardBridge(ipc: PreloadIpc): ClipboardBridge {
  return createRoleBridge(clipboardRoleContract, createElectronRendererRoleTransport(ipc));
}
