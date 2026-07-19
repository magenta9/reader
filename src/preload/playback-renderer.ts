import { contextBridge, ipcRenderer } from "electron";

import { playbackRendererRoleContract } from "../shared/role-bridge-contracts.js";
import { createRoleBridge } from "../shared/role-bridge-registry.js";
import { createElectronRendererRoleTransport } from "./electron-renderer-role-transport.js";

contextBridge.exposeInMainWorld(
  "voiceReader",
  createRoleBridge(playbackRendererRoleContract, createElectronRendererRoleTransport(ipcRenderer))
);
