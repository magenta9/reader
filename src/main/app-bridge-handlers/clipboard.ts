import { clipboardRoleContract } from "../../shared/role-bridge-contracts.js";
import {
  registerRoleHandlers,
  type ImplementationFromContract
} from "../../shared/role-bridge-registry.js";
import { createElectronMainRoleHandlerTransport } from "../electron-main-role-transport.js";
import type { AppBridgeHandlerDependencies } from "./dependencies.js";

export interface ClipboardImplementationDependencies {
  clipboard: Pick<AppBridgeHandlerDependencies["clipboard"], "writeText">;
}

type ClipboardHandlerDependencies = ClipboardImplementationDependencies &
  Pick<AppBridgeHandlerDependencies, "ipcMain">;

export function registerClipboardHandlers({ clipboard, ipcMain }: ClipboardHandlerDependencies): void {
  registerRoleHandlers(
    clipboardRoleContract,
    createClipboardImplementation({ clipboard }),
    createElectronMainRoleHandlerTransport(ipcMain)
  );
}

export function createClipboardImplementation({
  clipboard
}: ClipboardImplementationDependencies): ImplementationFromContract<
  typeof clipboardRoleContract
> {
  return { copyText: (text) => clipboard.writeText(text) };
}
