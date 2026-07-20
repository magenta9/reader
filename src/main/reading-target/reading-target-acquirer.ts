import type { NativeImage } from "electron";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReadingTargetInput } from "../../shared/types.js";

export interface ReadingTargetClipboard {
  readText(): string;
  readHTML(): string;
  readRTF(): string;
  readImage(): NativeImage;
  writeText(text: string): void;
  clear(): void;
  write(data: {
    text?: string;
    html?: string;
    rtf?: string;
    image?: NativeImage;
  }): void;
}

export interface SelectionCopyAddon {
  readSelectedText: () => string;
  copySelection: () => void;
}

export interface ReadingTargetErrorLog {
  addErrorLog(input: {
    category: "playback_runtime";
    message: string;
  }): unknown;
}

export interface ReadingTargetAcquirerOptions {
  clipboard: ReadingTargetClipboard;
  errorLog: ReadingTargetErrorLog;
  hideReaderWindowForSelectionCapture: () => void;
  loadSelectionCopyAddon?: () => SelectionCopyAddon;
  createMarker?: () => string;
  delay?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

const READER_WINDOW_SELECTION_CAPTURE_DELAY_MS = 300;
const ACTIVATION_SHORTCUT_SELECTION_CAPTURE_DELAY_MS = 350;
const SELECTION_COPY_DELAY_MS = 120;
const SELECTION_COPY_POLL_TIMEOUT_MS = 1000;
const SELECTION_COPY_POLL_INTERVAL_MS = 25;

const requireNative = createRequire(import.meta.url);
const mainBundleDir = dirname(fileURLToPath(import.meta.url));

export type ReadingTargetAcquisitionTrigger =
  | "reader_window"
  | "menu_bar"
  | "activation_shortcut";

export class ReadingTargetAcquirer {
  private readonly clipboard: ReadingTargetClipboard;
  private readonly errorLog: ReadingTargetErrorLog;
  private readonly hideReaderWindowForSelectionCapture: () => void;
  private readonly loadSelectionCopyAddon: () => SelectionCopyAddon;
  private readonly createMarker: () => string;
  private readonly delay: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;

  constructor(options: ReadingTargetAcquirerOptions) {
    this.clipboard = options.clipboard;
    this.errorLog = options.errorLog;
    this.hideReaderWindowForSelectionCapture = options.hideReaderWindowForSelectionCapture;
    this.loadSelectionCopyAddon = options.loadSelectionCopyAddon ?? loadDarwinSelectionCopyAddon;
    this.createMarker = options.createMarker ?? createSelectionClipboardMarker;
    this.delay = options.delay ?? delay;
    this.now = options.now ?? Date.now;
  }

  async acquire(trigger: ReadingTargetAcquisitionTrigger): Promise<ReadingTargetInput> {
    if (trigger === "reader_window") {
      this.hideReaderWindowForSelectionCapture();
      await this.delay(READER_WINDOW_SELECTION_CAPTURE_DELAY_MS);
    } else if (trigger === "activation_shortcut") {
      await this.delay(ACTIVATION_SHORTCUT_SELECTION_CAPTURE_DELAY_MS);
    }

    const snapshot = this.snapshotClipboard();
    const marker = this.createMarker();
    let clipboardWasReplaced = false;
    let target: ReadingTargetInput = {
      text: snapshot.text,
      source: "clipboard"
    };

    try {
      const selectionCopyAddon = this.loadSelectionCopyAddon();
      const accessibilitySelectedText = selectionCopyAddon.readSelectedText();
      if (accessibilitySelectedText.trim()) {
        return {
          text: accessibilitySelectedText,
          source: "selected_text"
        };
      }

      clipboardWasReplaced = true;
      this.clipboard.writeText(marker);
      selectionCopyAddon.copySelection();
      await this.delay(SELECTION_COPY_DELAY_MS);
      const selectedText = await this.readClipboardTextAfterSelectionCopy(marker);
      if (selectedText.trim() && selectedText !== marker) {
        target = {
          text: selectedText,
          source: "selected_text"
        };
      }
    } catch (error) {
      try {
        this.errorLog.addErrorLog({
          category: "playback_runtime",
          message: `Selected Text capture failed: ${safeSelectionCaptureErrorMessage(error)}`
        });
      } catch {
        // Error Log availability must not replace the Clipboard Text fallback.
      }
    } finally {
      if (clipboardWasReplaced) this.restoreClipboard(snapshot);
    }

    return target;
  }

  private async readClipboardTextAfterSelectionCopy(marker: string): Promise<string> {
    const startedAt = this.now();
    let current = this.clipboard.readText();
    while (current === marker && this.now() - startedAt < SELECTION_COPY_POLL_TIMEOUT_MS) {
      await this.delay(SELECTION_COPY_POLL_INTERVAL_MS);
      current = this.clipboard.readText();
    }
    return current;
  }

  private snapshotClipboard(): ClipboardSnapshot {
    return {
      text: this.clipboard.readText(),
      html: this.clipboard.readHTML(),
      rtf: this.clipboard.readRTF(),
      image: this.clipboard.readImage()
    };
  }

  private restoreClipboard(snapshot: ClipboardSnapshot): void {
    this.clipboard.clear();
    this.clipboard.write({
      text: snapshot.text || undefined,
      html: snapshot.html || undefined,
      rtf: snapshot.rtf || undefined,
      image: snapshot.image.isEmpty() ? undefined : snapshot.image
    });
  }
}

interface ClipboardSnapshot {
  text: string;
  html: string;
  rtf: string;
  image: NativeImage;
}

export function loadDarwinSelectionCopyAddon(): SelectionCopyAddon {
  if (process.platform !== "darwin") {
    throw new Error("Selected Text capture is only supported on macOS.");
  }
  return requireNative(resolveNativeSelectionCopyAddonPath()) as SelectionCopyAddon;
}

function resolveNativeSelectionCopyAddonPath(): string {
  const candidates = [
    join(mainBundleDir, "../native/selection-copy-macos.node"),
    join(mainBundleDir, "../../native/selection-copy-macos.node")
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function createSelectionClipboardMarker(): string {
  return `__VOICEREADER_SELECTION_${randomUUID()}__`;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function safeSelectionCaptureErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 160) : "Unknown selection capture failure";
}
