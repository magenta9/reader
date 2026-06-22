export const CLIPBOARD_CHANNELS = {
  writeText: "clipboard:write-text"
} as const;

export interface ClipboardBridge {
  copyText: (text: string) => Promise<void>;
}
