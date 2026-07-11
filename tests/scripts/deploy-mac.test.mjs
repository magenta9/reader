import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findApplicationProcesses } from "../../scripts/install-mac-app.mjs";
import { safelyReplaceApplication } from "../../scripts/safe-app-replace.mjs";
import { deployMac } from "../../scripts/deploy-mac.mjs";

const deployScript = resolve("scripts/deploy-mac.mjs");
const temporaryRoots = [];

function createReplacementFixture() {
  const root = mkdtempSync(join(tmpdir(), "voicereader-safe-replace-"));
  temporaryRoots.push(root);
  const source = join(root, "candidate.app");
  const destination = join(root, "VoiceReader.app");
  mkdirSync(source);
  mkdirSync(destination);
  writeFileSync(join(source, "version"), "new");
  writeFileSync(join(destination, "version"), "old");
  return {
    source,
    destination,
    copyApplication: async (copySource, copyDestination) =>
      cpSync(copySource, copyDestination, { recursive: true }),
    verifyStaged: async () => {},
    verifyInstalled: async () => {}
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("local VoiceReader deployment", () => {
  it("publishes the complete verified local deployment plan", () => {
    const result = spawnSync(process.execPath, [deployScript, "plan"], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      platform: "darwin",
      arch: "arm64",
      destination: "/Applications/VoiceReader.app",
      steps: ["verify", "package-mac", "smoke-candidate", "safe-replace", "verify-installed"],
      refusesRunningApplication: true,
      preservesUserData: true,
      remoteCi: false
    });
  });

  it("refuses a running application before invoking any deployment gate", async () => {
    const commands = [];
    await expect(
      deployMac({
        assertNotRunning: () => {
          throw new Error("VoiceReader is running");
        },
        runCommand: async (...command) => {
          commands.push(command);
          return { code: 0, signal: null };
        }
      })
    ).rejects.toThrow("VoiceReader is running");
    expect(commands).toEqual([]);
  });

  it("stops before replacement when candidate smoke fails", async () => {
    const commands = [];
    await expect(
      deployMac({
        assertNotRunning: () => {},
        runCommand: async (command, args) => {
          commands.push([command, args]);
          return { code: args.includes("smoke-packaged") ? 1 : 0, signal: null };
        }
      })
    ).rejects.toThrow("Candidate smoke failed with exit code 1");
    expect(commands.map(([, args]) => args)).toEqual([["verify"], ["package-mac"], ["smoke-packaged"]]);
  });

  it("atomically replaces a verified application and removes the previous copy", async () => {
    const fixture = createReplacementFixture();
    const staleStaging = join(fixture.source, "..", ".VoiceReader.app.staging-old");
    const staleBackup = join(fixture.source, "..", ".VoiceReader.app.backup-old");
    mkdirSync(staleStaging);
    mkdirSync(staleBackup);
    await safelyReplaceApplication({
      ...fixture,
      verifyStaged: async (application) => expect(readFileSync(join(application, "version"), "utf8")).toBe("new"),
      verifyInstalled: async (application) => expect(readFileSync(join(application, "version"), "utf8")).toBe("new")
    });
    expect(readFileSync(join(fixture.destination, "version"), "utf8")).toBe("new");
    expect(existsSync(staleStaging)).toBe(false);
    expect(existsSync(staleBackup)).toBe(false);
  });

  it("leaves the installed application untouched when staged verification fails", async () => {
    const fixture = createReplacementFixture();
    await expect(
      safelyReplaceApplication({
        ...fixture,
        verifyStaged: async () => {
          throw new Error("staged signature failed");
        }
      })
    ).rejects.toThrow("staged signature failed");
    expect(readFileSync(join(fixture.destination, "version"), "utf8")).toBe("old");
  });

  it("restores the previous application when installed verification fails", async () => {
    const fixture = createReplacementFixture();
    await expect(
      safelyReplaceApplication({
        ...fixture,
        verifyInstalled: async () => {
          throw new Error("installed smoke failed");
        }
      })
    ).rejects.toThrow("installed smoke failed");
    expect(readFileSync(join(fixture.destination, "version"), "utf8")).toBe("old");
  });

  it("leaves the installed application untouched when the pre-swap guard fails", async () => {
    const fixture = createReplacementFixture();
    await expect(
      safelyReplaceApplication({
        ...fixture,
        beforeSwap: async () => {
          throw new Error("VoiceReader started during staging");
        }
      })
    ).rejects.toThrow("VoiceReader started during staging");
    expect(readFileSync(join(fixture.destination, "version"), "utf8")).toBe("old");
  });

  it("reports the preserved backup when rollback cannot move the failed replacement", async () => {
    const fixture = createReplacementFixture();
    let failedRename = false;
    let message = "";
    try {
      await safelyReplaceApplication({
        ...fixture,
        verifyInstalled: async () => {
          throw new Error("installed smoke failed");
        },
        renameApplication: (source, destination) => {
          if (source === fixture.destination && destination.includes(".failed-") && !failedRename) {
            failedRename = true;
            throw new Error("simulated rename failure");
          }
          renameSync(source, destination);
        }
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("installed smoke failed");
    expect(message).toContain("Previous application remains preserved at");
    const backup = message.match(/preserved at (.+)\./)?.[1];
    expect(backup && existsSync(backup)).toBe(true);
    expect(backup && readFileSync(join(backup, "version"), "utf8")).toBe("old");
  });

  it("keeps the verified replacement when committed backup cleanup fails", async () => {
    const fixture = createReplacementFixture();
    let message = "";
    try {
      await safelyReplaceApplication({
        ...fixture,
        removeApplication: (path) => {
          if (path.includes(".backup-")) throw new Error("simulated cleanup failure");
          rmSync(path, { recursive: true, force: true });
        }
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("new application is installed and verified");
    expect(message).toContain("residual backup at");
    expect(readFileSync(join(fixture.destination, "version"), "utf8")).toBe("new");
  });

  it("detects main and helper processes running from the installed bundle", () => {
    expect(
      findApplicationProcesses(
        "/Applications/VoiceReader.app",
        "  10 /Applications/VoiceReader.app/Contents/MacOS/VoiceReader\n" +
          "  11 /Applications/VoiceReader.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper --type=gpu\n" +
          "  12 /bin/zsh\n"
      )
    ).toEqual([
      { pid: 10, command: "/Applications/VoiceReader.app/Contents/MacOS/VoiceReader" },
      {
        pid: 11,
        command:
          "/Applications/VoiceReader.app/Contents/Frameworks/Electron Helper.app/Contents/MacOS/Electron Helper --type=gpu"
      }
    ]);
  });
});
