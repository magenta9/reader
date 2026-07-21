import { describe, expect, it, vi } from "vitest";

import {
  createReaderMenuTemplate,
  createReaderWindowOptions,
  createTrayIconPngBuffer
} from "../../src/main/electron-reader-app-shell.js";
import type { ReaderAppShellMenuActions } from "../../src/main/reader-app-shell-controller.js";

describe("Electron Reader App Shell adapter", () => {
  it("preserves the Reader Window configuration and security boundary", () => {
    expect(createReaderWindowOptions("/app/preload/reader-window.cjs")).toEqual({
      title: "VoiceReader",
      width: 1100,
      height: 760,
      minWidth: 900,
      minHeight: 620,
      show: false,
      backgroundColor: "#f5f5f3",
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 18, y: 18 },
      webPreferences: {
        preload: "/app/preload/reader-window.cjs",
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });
  });

  it("preserves Menu Bar labels, order and semantic command mapping", async () => {
    const actions: string[] = [];
    const menuActions = {
      play: async () => {
        actions.push("play");
      },
      stop: () => actions.push("stop"),
      home: () => actions.push("home"),
      history: () => actions.push("history"),
      favorites: () => actions.push("favorites"),
      settings: () => actions.push("settings"),
      quit: () => actions.push("quit")
    } satisfies ReaderAppShellMenuActions;
    const template = createReaderMenuTemplate(menuActions);

    expect(template.map((item) => item.label ?? item.type)).toEqual([
      "播放",
      "停止朗读",
      "打开 VoiceReader",
      "历史记录",
      "收藏",
      "设置",
      "separator",
      "退出"
    ]);

    for (const item of template) {
      if (item.click) Reflect.apply(item.click, undefined, []);
    }
    await vi.waitFor(() => expect(actions).toEqual([
      "play",
      "stop",
      "home",
      "history",
      "favorites",
      "settings",
      "quit"
    ]));
  });

  it("builds the 36px PNG used for the 18pt Retina Tray icon", () => {
    const png = createTrayIconPngBuffer();

    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.readUInt32BE(16)).toBe(36);
    expect(png.readUInt32BE(20)).toBe(36);
  });
});
