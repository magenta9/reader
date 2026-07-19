import { contextBridge, ipcRenderer } from "electron";

import { readerWindowRoleContract } from "../shared/role-bridge-contracts.js";
import { createRoleBridge } from "../shared/role-bridge-registry.js";
import { createElectronRendererRoleTransport } from "./electron-renderer-role-transport.js";

contextBridge.exposeInMainWorld(
  "voiceReader",
  createRoleBridge(readerWindowRoleContract, createElectronRendererRoleTransport(ipcRenderer))
);
