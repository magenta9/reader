import { CLIPBOARD_CHANNELS, type ClipboardBridge } from "../../shared/bridge-contracts.js";
import { invoke, type PreloadIpc } from "./ipc.js";

export function createClipboardBridge(ipc: PreloadIpc): ClipboardBridge {
  return {
    copyText: (text: string) => invoke<void>(ipc, CLIPBOARD_CHANNELS.writeText, text)
  };
}
