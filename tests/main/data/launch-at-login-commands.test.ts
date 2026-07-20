import { describe, expect, it, vi } from "vitest";

import { LaunchAtLoginCommands } from "../../../src/main/data/launch-at-login-commands.js";
import { DEFAULT_APP_SETTINGS } from "../../../src/main/data/app-data-store.js";

describe("LaunchAtLoginCommands", () => {
  it("synchronizes the saved preference to the macOS Login Item during startup", () => {
    const settings = { ...DEFAULT_APP_SETTINGS, launchAtLogin: true };
    const loginItems = { setLoginItemSettings: vi.fn() };
    const store = {
      getSettings: vi.fn(() => settings),
      updateSettings: vi.fn(() => settings)
    };

    new LaunchAtLoginCommands(loginItems, store).initialize();

    expect(store.getSettings).toHaveBeenCalledTimes(1);
    expect(loginItems.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true });
    expect(store.updateSettings).not.toHaveBeenCalled();
  });

  it("updates the Login Item before persisting and returns authoritative Settings", () => {
    const calls: string[] = [];
    const updated = { ...DEFAULT_APP_SETTINGS, launchAtLogin: true };
    const commands = new LaunchAtLoginCommands(
      {
        setLoginItemSettings: ({ openAtLogin }) => {
          calls.push(`login:${openAtLogin}`);
        }
      },
      {
        getSettings: () => DEFAULT_APP_SETTINGS,
        updateSettings: ({ launchAtLogin }) => {
          calls.push(`store:${launchAtLogin}`);
          return updated;
        }
      }
    );

    expect(commands.setLaunchAtLogin(true)).toBe(updated);
    expect(calls).toEqual(["login:true", "store:true"]);
  });

  it("does not persist when the Login Item update fails", () => {
    const updateSettings = vi.fn(() => DEFAULT_APP_SETTINGS);
    const commands = new LaunchAtLoginCommands(
      {
        setLoginItemSettings: () => {
          throw new Error("login item unavailable");
        }
      },
      { getSettings: () => DEFAULT_APP_SETTINGS, updateSettings }
    );

    expect(() => commands.setLaunchAtLogin(true)).toThrow("login item unavailable");
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("preserves the existing partial-success failure semantics when persistence fails", () => {
    const setLoginItemSettings = vi.fn();
    const commands = new LaunchAtLoginCommands(
      { setLoginItemSettings },
      {
        getSettings: () => DEFAULT_APP_SETTINGS,
        updateSettings: () => {
          throw new Error("settings unavailable");
        }
      }
    );

    expect(() => commands.setLaunchAtLogin(false)).toThrow("settings unavailable");
    expect(setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: false });
  });
});
