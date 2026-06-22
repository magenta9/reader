import { CLIPBOARD_CHANNELS } from "../../shared/bridge-contracts.js";
import type { AppBridgeHandlerDependencies } from "./dependencies.js";

type ClipboardHandlerDependencies = Pick<AppBridgeHandlerDependencies, "clipboard" | "ipcMain">;

export function registerClipboardHandlers({ clipboard, ipcMain }: ClipboardHandlerDependencies): void {
  ipcMain.handle(CLIPBOARD_CHANNELS.writeText, (_event, text: string) => {
    clipboard.writeText(text);
  });
}
