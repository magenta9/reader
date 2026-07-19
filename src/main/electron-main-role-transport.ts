import type { IpcMain, WebContents } from "electron";

import type {
  MainRoleEventTransport,
  MainRoleHandlerTransport
} from "../shared/role-bridge-registry.js";

export function createElectronMainRoleHandlerTransport(ipcMain: IpcMain): MainRoleHandlerTransport {
  return {
    handle: (channel, handler) => {
      ipcMain.handle(channel, (event, ...args) => handler({ senderId: event.sender.id }, args));
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
