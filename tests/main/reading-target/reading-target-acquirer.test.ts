import type { NativeImage } from "electron";
import { describe, expect, it, vi } from "vitest";

import { ReadingTargetAcquirer } from "../../../src/main/reading-target/reading-target-acquirer.js";
import type {
  ReadingTargetClipboard,
  ReadingTargetErrorLog,
  SelectionCopyAddon
} from "../../../src/main/reading-target/reading-target-acquirer.js";

describe("ReadingTargetAcquirer", () => {
  it("falls back to Clipboard Text and logs safe Selected Text capture failures", async () => {
    const log: Array<{ message: string; hidden?: boolean }> = [];
    const clipboard = createClipboard({ text: "剪切板后备文本", html: "<p>html</p>" });
    const acquirer = createAcquirer({
      clipboard,
      errorLog: createErrorLog(log),
      hidePreviousAppForSelectionCapture: () => log.push({ message: "hidden", hidden: true }),
      loadSelectionCopyAddon: () => {
        throw new Error("accessibility unavailable");
      }
    });

    await acquirer.revealPreviousAppBeforeCapture();
    const target = await acquirer.acquire();

    expect(target).toEqual({ text: "剪切板后备文本", source: "clipboard" });
    expect(clipboard.snapshot()).toEqual({
      text: "剪切板后备文本",
      html: "<p>html</p>",
      rtf: "",
      hasImage: false
    });
    expect(log.some((entry) => entry.hidden === true)).toBe(true);
    expect(log.some((entry) => entry.message.startsWith("Selected Text capture failed:"))).toBe(true);
  });

  it("prefers directly readable Selected Text", async () => {
    const clipboard = createClipboard({ text: "原剪切板" });
    const copySelection = vi.fn();
    const acquirer = createAcquirer({
      clipboard,
      loadSelectionCopyAddon: () => ({
        readSelectedText: () => "通过辅助功能读取的选中文本",
        copySelection
      })
    });

    await expect(acquirer.acquire()).resolves.toEqual({
      text: "通过辅助功能读取的选中文本",
      source: "selected_text"
    });
    expect(copySelection).not.toHaveBeenCalled();
  });

  it("copies Selected Text through the clipboard and restores the previous clipboard", async () => {
    const clipboard = createClipboard({ text: "原剪切板" });
    const acquirer = createAcquirer({
      clipboard,
      createMarker: () => "__TEST_SELECTION_MARKER__",
      loadSelectionCopyAddon: () => ({
        readSelectedText: () => "",
        copySelection: () => clipboard.writeText("通过复制读取的选中文本")
      })
    });

    await expect(acquirer.acquire()).resolves.toEqual({
      text: "通过复制读取的选中文本",
      source: "selected_text"
    });
    expect(clipboard.snapshot()).toEqual({ text: "原剪切板", html: "", rtf: "", hasImage: false });
  });

  it("falls back to Clipboard Text when selection copy leaves the marker unchanged", async () => {
    const clipboard = createClipboard({ text: "复制前剪切板" });
    const acquirer = createAcquirer({
      clipboard,
      createMarker: () => "__TEST_SELECTION_MARKER__",
      loadSelectionCopyAddon: () => ({
        readSelectedText: () => "",
        copySelection: () => undefined
      })
    });

    await expect(acquirer.acquire()).resolves.toEqual({
      text: "复制前剪切板",
      source: "clipboard"
    });
    expect(clipboard.snapshot()).toEqual({ text: "复制前剪切板", html: "", rtf: "", hasImage: false });
  });

  it("returns an empty Clipboard Text target when only non-text clipboard data is available", async () => {
    const log: Array<{ message: string }> = [];
    const clipboard = createClipboard({ html: "<p>Only HTML</p>", image: fakeImage(false) });
    const acquirer = createAcquirer({
      clipboard,
      errorLog: createErrorLog(log),
      loadSelectionCopyAddon: () => {
        throw new Error("accessibility unavailable");
      }
    });

    await expect(acquirer.acquire()).resolves.toEqual({ text: "", source: "clipboard" });
    expect(clipboard.snapshot()).toEqual({ text: "", html: "<p>Only HTML</p>", rtf: "", hasImage: true });
    expect(log.some((entry) => entry.message.startsWith("Selected Text capture failed:"))).toBe(true);
  });
});

function createAcquirer(options: {
  clipboard?: ReadingTargetClipboard;
  createMarker?: () => string;
  errorLog?: ReadingTargetErrorLog;
  hidePreviousAppForSelectionCapture?: () => void;
  loadSelectionCopyAddon?: () => SelectionCopyAddon;
}): ReadingTargetAcquirer {
  return new ReadingTargetAcquirer({
    clipboard: options.clipboard ?? createClipboard(),
    errorLog:
      options.errorLog ??
      ({
        addErrorLog: () => {
          throw new Error("Reading Target acquisition should not log an error");
        }
      } satisfies ReadingTargetErrorLog),
    hidePreviousAppForSelectionCapture: options.hidePreviousAppForSelectionCapture ?? (() => undefined),
    loadSelectionCopyAddon: options.loadSelectionCopyAddon,
    createMarker: options.createMarker,
    delay: async () => undefined
  });
}

function createErrorLog(log: Array<{ message: string }>): ReadingTargetErrorLog {
  return {
    addErrorLog(input) {
      log.push({ message: input.message });
    }
  };
}

function createClipboard(initial: { html?: string; image?: NativeImage; rtf?: string; text?: string } = {}): ReadingTargetClipboard & {
  snapshot(): { hasImage: boolean; html: string; rtf: string; text: string };
} {
  let state = {
    text: initial.text ?? "",
    html: initial.html ?? "",
    rtf: initial.rtf ?? "",
    image: initial.image ?? fakeImage(true)
  };

  return {
    readText: () => state.text,
    readHTML: () => state.html,
    readRTF: () => state.rtf,
    readImage: () => state.image,
    writeText(text) {
      state = { text, html: "", rtf: "", image: fakeImage(true) };
    },
    clear() {
      state = { text: "", html: "", rtf: "", image: fakeImage(true) };
    },
    write(next) {
      state = {
        text: next.text ?? "",
        html: next.html ?? "",
        rtf: next.rtf ?? "",
        image: next.image ?? fakeImage(true)
      };
    },
    snapshot() {
      return {
        text: state.text,
        html: state.html,
        rtf: state.rtf,
        hasImage: !state.image.isEmpty()
      };
    }
  };
}

function fakeImage(empty: boolean): NativeImage {
  return { isEmpty: () => empty } as NativeImage;
}
