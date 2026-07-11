import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, it } from "vitest";

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
