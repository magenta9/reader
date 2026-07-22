import { contextBridge, ipcRenderer } from "electron";

import { playbackOverlayRoleContract } from "../shared/role-bridge-contracts.js";
import { createRoleBridge } from "../shared/role-bridge-registry.js";
import { getProductionRuntimeRoleBinding } from "../shared/production-runtime-role-bindings.js";
import { createElectronRendererRoleTransport } from "./electron-renderer-role-transport.js";

const runtimeRoleBinding = getProductionRuntimeRoleBinding("playback-overlay");
contextBridge.exposeInMainWorld(
  runtimeRoleBinding.globalName,
  createRoleBridge(playbackOverlayRoleContract, createElectronRendererRoleTransport(ipcRenderer))
);
