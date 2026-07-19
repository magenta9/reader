import type { IpcMain } from "electron";

import type { MainRoleHandlerTransport } from "../shared/role-bridge-registry.js";

export function createElectronMainRoleHandlerTransport(ipcMain: IpcMain): MainRoleHandlerTransport {
  return {
    handle: (channel, handler) => {
      ipcMain.handle(channel, (_event, ...args) => handler(...args));
    }
  };
}
