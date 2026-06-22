import type { NativeImage } from "electron";
import { describe, expect, it } from "vitest";

import { AppPresenceController } from "../../src/main/app-presence-controller.js";

describe("AppPresenceController", () => {
  it("hides the app and restores Dock visibility for macOS selection capture", () => {
    const actions: string[] = [];
    const presence = createPresence({ actions, platform: "darwin" });

    presence.hideForSelectionCapture();

    expect(actions).toEqual(["app.hide", "dock.show"]);
  });

  it("hides the Reader Window outside macOS selection capture", () => {
    const actions: string[] = [];
    const presence = createPresence({ actions, platform: "linux" });

    presence.hideForSelectionCapture();

    expect(actions).toEqual(["readerWindow.hide"]);
  });

  it("does nothing when Dock APIs are unavailable", () => {
    const actions: string[] = [];
    const presence = createPresence({ actions, hasDock: false, platform: "darwin" });

    presence.ensureDockVisible();
    presence.setDockIconFromSvg("/missing.svg");

    expect(actions).toEqual([]);
  });

  it("sets a non-empty Dock icon from SVG text", () => {
    const actions: string[] = [];
    const presence = createPresence({
      actions,
      platform: "darwin",
      readTextFile: () => "<svg></svg>"
    });

    presence.setDockIconFromSvg("/icon.svg");

    expect(actions[0]?.startsWith("nativeImage.createFromDataURL:data:image/svg+xml")).toBe(true);
    expect(actions.at(-1)).toBe("dock.setIcon");
  });
});

function createPresence(options: {
  actions: string[];
  emptyImage?: boolean;
  hasDock?: boolean;
  platform: NodeJS.Platform;
  readTextFile?: (path: string) => string;
}): AppPresenceController {
  const app = {
    hide: () => {
      options.actions.push("app.hide");
    },
    dock:
      options.hasDock === false
        ? undefined
        : {
            show: () => {
              options.actions.push("dock.show");
            },
            setIcon: () => {
              options.actions.push("dock.setIcon");
            }
          }
  };

  return new AppPresenceController({
    app,
    nativeImage: {
      createFromDataURL: (dataUrl) => {
        options.actions.push(`nativeImage.createFromDataURL:${dataUrl}`);
        return { isEmpty: () => options.emptyImage === true } as NativeImage;
      }
    },
    getReaderWindow: () => ({
      hide: () => {
        options.actions.push("readerWindow.hide");
      }
    }),
    platform: options.platform,
    readTextFile: options.readTextFile ?? (() => "")
  });
}
