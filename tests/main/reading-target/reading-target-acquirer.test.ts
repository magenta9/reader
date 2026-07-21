import type { NativeImage } from "electron";
import { describe, expect, it, vi } from "vitest";

import { ReadingTargetAcquirer } from "../../../src/main/reading-target/reading-target-acquirer.js";
import type {
  ReadingTargetClipboard,
  ReadingTargetErrorLog,
  SelectionCopyAddon
} from "../../../src/main/reading-target/reading-target-acquirer.js";

describe("ReadingTargetAcquirer", () => {
  it("owns Reader Window preparation and leaves the previous app active after capture", async () => {
    const events: string[] = [];
    const acquirer = createAcquirer({
      hideReaderWindowForSelectionCapture: () => events.push("hide-reader"),
      delay: async (milliseconds) => {
        events.push(`delay:${milliseconds}`);
      },
      loadSelectionCopyAddon: () => ({
        readSelectedText: () => {
          events.push("capture-selection");
          return "Reader Window 触发的选中文本";
        },
        copySelection: () => undefined
      })
    });

    await expect(acquirer.acquire("reader_window")).resolves.toEqual({
      text: "Reader Window 触发的选中文本",
      source: "selected_text"
    });
    expect(events).toEqual(["hide-reader", "delay:300", "capture-selection"]);
  });

  it("captures the Menu Bar frontmost app before the first asynchronous yield", async () => {
    const readSelectedText = vi.fn(() => "Menu Bar 触发的选中文本");
    const acquirer = createAcquirer({
      delay: async () => {
        throw new Error("Menu Bar acquisition must not wait before capture");
      },
      loadSelectionCopyAddon: () => ({
        readSelectedText,
        copySelection: () => undefined
      })
    });

    const acquisition = acquirer.acquire("menu_bar");
    expect(readSelectedText).toHaveBeenCalledOnce();
    await expect(acquisition).resolves.toEqual({
      text: "Menu Bar 触发的选中文本",
      source: "selected_text"
    });
  });

  it("waits 350ms before capturing for the Activation Shortcut", async () => {
    let releaseDelay: (() => void) | undefined;
    const readSelectedText = vi.fn(() => "快捷键触发的选中文本");
    const acquirer = createAcquirer({
      delay: (milliseconds) => {
        expect(milliseconds).toBe(350);
        return new Promise<void>((resolve) => {
          releaseDelay = resolve;
        });
      },
      loadSelectionCopyAddon: () => ({
        readSelectedText,
        copySelection: () => undefined
      })
    });

    const acquisition = acquirer.acquire("activation_shortcut");
    expect(readSelectedText).not.toHaveBeenCalled();
    releaseDelay?.();

    await expect(acquisition).resolves.toEqual({
      text: "快捷键触发的选中文本",
      source: "selected_text"
    });
    expect(readSelectedText).toHaveBeenCalledOnce();
  });

  it("falls back to Clipboard Text and logs safe Selected Text capture failures", async () => {
    const log: Array<{ message: string; hidden?: boolean }> = [];
    const clipboard = createClipboard({ text: "剪切板后备文本", html: "<p>html</p>" });
    const acquirer = createAcquirer({
      clipboard,
      errorLog: createErrorLog(log),
      loadSelectionCopyAddon: () => {
        throw new Error("accessibility unavailable");
      }
    });

    const target = await acquirer.acquire("menu_bar");

    expect(target).toEqual({ text: "剪切板后备文本", source: "clipboard" });
    expect(clipboard.snapshot()).toEqual({
      text: "剪切板后备文本",
      html: "<p>html</p>",
      rtf: "",
      hasImage: false
    });
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

    await expect(acquirer.acquire("menu_bar")).resolves.toEqual({
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

    await expect(acquirer.acquire("menu_bar")).resolves.toEqual({
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

    await expect(acquirer.acquire("menu_bar")).resolves.toEqual({
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

    await expect(acquirer.acquire("menu_bar")).resolves.toEqual({ text: "", source: "clipboard" });
    expect(clipboard.snapshot()).toEqual({ text: "", html: "<p>Only HTML</p>", rtf: "", hasImage: true });
    expect(log.some((entry) => entry.message.startsWith("Selected Text capture failed:"))).toBe(true);
  });

  it("restores the clipboard even when selection capture and safe Error Log both fail", async () => {
    const clipboard = createClipboard({
      text: "原剪切板",
      html: "<p>原 HTML</p>",
      rtf: "{\\rtf1 原 RTF}",
      image: fakeImage(false)
    });
    const acquirer = createAcquirer({
      clipboard,
      createMarker: () => "__TEST_SELECTION_MARKER__",
      errorLog: {
        addErrorLog: () => {
          throw new Error("error log unavailable");
        }
      },
      loadSelectionCopyAddon: () => ({
        readSelectedText: () => "",
        copySelection: () => {
          throw new Error("copy selection unavailable");
        }
      })
    });

    await expect(acquirer.acquire("menu_bar")).resolves.toEqual({
      text: "原剪切板",
      source: "clipboard"
    });
    expect(clipboard.snapshot()).toEqual({
      text: "原剪切板",
      html: "<p>原 HTML</p>",
      rtf: "{\\rtf1 原 RTF}",
      hasImage: true
    });
  });
});

function createAcquirer(options: {
  clipboard?: ReadingTargetClipboard;
  createMarker?: () => string;
  delay?: (milliseconds: number) => Promise<void>;
  errorLog?: ReadingTargetErrorLog;
  hideReaderWindowForSelectionCapture?: () => void;
  loadSelectionCopyAddon?: () => SelectionCopyAddon;
}): ReadingTargetAcquirer {
  let now = 0;
  return new ReadingTargetAcquirer({
    clipboard: options.clipboard ?? createClipboard(),
    errorLog:
      options.errorLog ??
      ({
        addErrorLog: () => {
          throw new Error("Reading Target acquisition should not log an error");
        }
      } satisfies ReadingTargetErrorLog),
    hideReaderWindowForSelectionCapture: options.hideReaderWindowForSelectionCapture ?? (() => undefined),
    loadSelectionCopyAddon: options.loadSelectionCopyAddon,
    createMarker: options.createMarker,
    delay:
      options.delay ??
      (async (milliseconds) => {
        now += milliseconds;
      }),
    now: () => now
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
