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
  hidePreviousAppForSelectionCapture: () => void;
  loadSelectionCopyAddon?: () => SelectionCopyAddon;
  createMarker?: () => string;
  delay?: (milliseconds: number) => Promise<void>;
}

const REVEAL_PREVIOUS_APP_DELAY_MS = 300;
const SELECTION_COPY_DELAY_MS = 120;
const SELECTION_COPY_POLL_TIMEOUT_MS = 1000;
const SELECTION_COPY_POLL_INTERVAL_MS = 25;

const requireNative = createRequire(import.meta.url);
const mainBundleDir = dirname(fileURLToPath(import.meta.url));

export class ReadingTargetAcquirer {
  private readonly clipboard: ReadingTargetClipboard;
  private readonly errorLog: ReadingTargetErrorLog;
  private readonly hidePreviousAppForSelectionCapture: () => void;
  private readonly loadSelectionCopyAddon: () => SelectionCopyAddon;
  private readonly createMarker: () => string;
  private readonly delay: (milliseconds: number) => Promise<void>;

  constructor(options: ReadingTargetAcquirerOptions) {
    this.clipboard = options.clipboard;
    this.errorLog = options.errorLog;
    this.hidePreviousAppForSelectionCapture = options.hidePreviousAppForSelectionCapture;
    this.loadSelectionCopyAddon = options.loadSelectionCopyAddon ?? loadDarwinSelectionCopyAddon;
    this.createMarker = options.createMarker ?? createSelectionClipboardMarker;
    this.delay = options.delay ?? delay;
  }

  async revealPreviousAppBeforeCapture(): Promise<void> {
    this.hidePreviousAppForSelectionCapture();
    await this.delay(REVEAL_PREVIOUS_APP_DELAY_MS);
  }

  async acquire(): Promise<ReadingTargetInput> {
    const snapshot = this.snapshotClipboard();
    const marker = this.createMarker();
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
      this.errorLog.addErrorLog({
        category: "playback_runtime",
        message: `Selected Text capture failed: ${safeSelectionCaptureErrorMessage(error)}`
      });
    }

    this.restoreClipboard(snapshot);
    return target;
  }

  private async readClipboardTextAfterSelectionCopy(marker: string): Promise<string> {
    const startedAt = Date.now();
    let current = this.clipboard.readText();
    while (current === marker && Date.now() - startedAt < SELECTION_COPY_POLL_TIMEOUT_MS) {
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

function loadDarwinSelectionCopyAddon(): SelectionCopyAddon {
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
