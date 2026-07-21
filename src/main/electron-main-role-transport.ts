import type { IpcMain, WebContents } from "electron";

import type {
  MainRoleEventTransport,
  MainRoleHandlerTransport
} from "../shared/role-bridge-registry.js";

export function createElectronMainRoleHandlerTransport(ipcMain: IpcMain): MainRoleHandlerTransport {
  return {
    handle: (channel, handler) => {
      ipcMain.handle(channel, (_event, ...args) => handler(args));
    }
  };
}

export function createElectronMainRoleEventTransport(
  webContents: Pick<WebContents, "send">
): MainRoleEventTransport {
  return {
    emit: (channel, args) => webContents.send(channel, ...args)
  };
}
