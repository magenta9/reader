import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { assertCommand, spawnCommand } from "./spawn-command.mjs";

export async function verifyMacApplicationStructure(application) {
  const executable = resolve(application, "Contents/MacOS/VoiceReader");
  const addon = resolve(application, "Contents/Resources/app/dist/native/selection-copy-macos.node");
  const mainBundle = resolve(application, "Contents/Resources/app/dist/main/main.js");
  for (const path of [executable, addon, mainBundle]) {
    if (!existsSync(path)) throw new Error(`Application resource is missing: ${path}`);
  }
  assertCommand(
    await spawnCommand("/usr/bin/lipo", [executable, "-verify_arch", "arm64"]),
    `ARM64 executable verification for ${application}`
  );
  assertCommand(
    await spawnCommand("/usr/bin/lipo", [addon, "-verify_arch", "arm64"]),
    `ARM64 addon verification for ${application}`
  );
  assertCommand(
    await spawnCommand("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", application]),
    `Code-signing verification for ${application}`
  );
  return { executable, addon, mainBundle };
}
