import { describe, expect, it } from "vitest";

import { startReaderSurfaces } from "../../src/main/reader-startup.js";

describe("Reader startup composition", () => {
  it("synchronizes Launch at Login before registering shortcuts and starting the Reader App Shell", async () => {
    const calls: string[] = [];

    await startReaderSurfaces({
      launchAtLoginCommands: { initialize: () => calls.push("launch-at-login") },
      playbackCommands: { registerActivationShortcut: () => calls.push("shortcut") },
      readerAppShell: {
        start: async () => {
          calls.push("reader-app-shell");
        }
      }
    });

    expect(calls).toEqual(["launch-at-login", "shortcut", "reader-app-shell"]);
  });
});
