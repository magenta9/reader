import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { verifyMacDiskImage } from "../../scripts/package-mac.mjs";

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("declares artifact-only ARM64 app and DMG packaging at the public command seam", () => {
  const output = execFileSync(process.execPath, [resolve("scripts/package-mac.mjs"), "plan"], {
    cwd: resolve("."),
    encoding: "utf8"
  });
  const plan = JSON.parse(output.trim().split("\n").at(-1));

  expect(plan).toEqual({
    platform: "darwin",
    arch: "arm64",
    app: "release/mac/VoiceReader.app",
    dmg: "release/mac/VoiceReader-0.1.0-arm64.dmg",
    dmgTool: "/usr/bin/hdiutil",
    customPackager: true,
    installsApplication: false
  });
});

it("mounts the final DMG and verifies its only VoiceReader application", async () => {
  const root = mkdtempSync(join(tmpdir(), "voicereader-dmg-verifier-"));
  temporaryRoots.push(root);
  const diskImage = join(root, "VoiceReader.dmg");
  writeFileSync(diskImage, "disk image");
  const commands = [];
  const verifyApplication = vi.fn(async () => undefined);

  await verifyMacDiskImage(diskImage, {
    runCommand: async (command, args) => {
      commands.push([command, args]);
      if (args[0] === "attach") {
        const mountPoint = args[args.indexOf("-mountpoint") + 1];
        mkdirSync(join(mountPoint, "VoiceReader.app"));
      }
    },
    verifyApplication
  });

  expect(commands.map(([, args]) => args[0])).toEqual(["verify", "attach", "detach"]);
  expect(verifyApplication).toHaveBeenCalledOnce();
  expect(verifyApplication.mock.calls[0][0]).toMatch(/VoiceReader\.app$/);
});

it("preserves the artifact failure when DMG detach also fails", async () => {
  const root = mkdtempSync(join(tmpdir(), "voicereader-dmg-verifier-"));
  temporaryRoots.push(root);
  const diskImage = join(root, "VoiceReader.dmg");
  writeFileSync(diskImage, "disk image");

  await expect(
    verifyMacDiskImage(diskImage, {
      runCommand: async (_command, args) => {
        if (args[0] === "attach") {
          const mountPoint = args[args.indexOf("-mountpoint") + 1];
          mkdirSync(join(mountPoint, "VoiceReader.app"));
        }
        if (args[0] === "detach") throw new Error("detach failed");
      },
      verifyApplication: async () => {
        throw new Error("artifact invalid");
      }
    })
  ).rejects.toThrow("DMG verification failed: artifact invalid; cleanup failed: detach failed");
});
