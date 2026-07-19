import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { verifyBuiltVoiceReader } from "./build-verifier.mjs";
import { assertCommand, spawnCommand } from "./spawn-command.mjs";

const appBundleIdentifier = "com.local.voicereader";
const appVerificationRequirement = `identifier "${appBundleIdentifier}"`;
const expectedInfo = {
  CFBundleDisplayName: "VoiceReader",
  CFBundleExecutable: "VoiceReader",
  CFBundleIconFile: "VoiceReader.icns",
  CFBundleIdentifier: appBundleIdentifier,
  CFBundleName: "VoiceReader",
  CFBundleShortVersionString: "0.1.0",
  CFBundleVersion: "0.1.0"
};
const expectedHelperIdentifiers = {
  "Electron Helper.app": "com.local.voicereader.helper",
  "Electron Helper (GPU).app": "com.local.voicereader.helper.gpu",
  "Electron Helper (Plugin).app": "com.local.voicereader.helper.plugin",
  "Electron Helper (Renderer).app": "com.local.voicereader.helper.renderer"
};

export async function verifyMacApplicationStructure(
  application,
  { runCommand = spawnCommand, verifyBuildProduct = verifyBuiltVoiceReader } = {}
) {
  const executable = resolve(application, "Contents/MacOS/VoiceReader");
  const resources = resolve(application, "Contents/Resources");
  const buildProduct = resolve(resources, "app/dist");
  const addon = resolve(buildProduct, "native/selection-copy-macos.node");
  const icon = resolve(resources, "VoiceReader.icns");
  const packageDescriptor = resolve(resources, "app/package.json");
  const infoPlist = resolve(application, "Contents/Info.plist");
  for (const path of [executable, icon, packageDescriptor, infoPlist]) {
    if (!existsSync(path)) throw new Error(`Application resource is missing: ${path}`);
  }

  const info = await readFile(infoPlist, "utf8");
  for (const [key, value] of Object.entries(expectedInfo)) assertPlistString(info, key, value, infoPlist);
  assertPlistKeyAbsent(info, "LSUIElement", infoPlist);
  assertPlistKeyAbsent(info, "NSAppleEventsUsageDescription", infoPlist);
  const defaultApplication = resolve(resources, "default_app.asar");
  if (existsSync(defaultApplication)) {
    throw new Error(`Electron default application must be absent: ${defaultApplication}`);
  }

  const descriptor = JSON.parse(await readFile(packageDescriptor, "utf8"));
  const expectedDescriptor = {
    name: "voicereader",
    productName: "VoiceReader",
    version: "0.1.0",
    type: "module",
    main: "dist/main/main.js"
  };
  const descriptorKeys = Object.keys(descriptor).sort();
  const expectedKeys = Object.keys(expectedDescriptor).sort();
  if (
    JSON.stringify(descriptorKeys) !== JSON.stringify(expectedKeys) ||
    expectedKeys.some((key) => descriptor[key] !== expectedDescriptor[key])
  ) {
    throw new Error(`Packaged application descriptor is invalid: ${packageDescriptor}`);
  }

  const frameworks = resolve(application, "Contents/Frameworks");
  const helperApplications = (await readdir(frameworks)).filter((name) => name.startsWith("Electron Helper"));
  if (JSON.stringify(helperApplications.sort()) !== JSON.stringify(Object.keys(expectedHelperIdentifiers).sort())) {
    throw new Error(`Packaged Electron helpers are invalid: ${helperApplications.join(", ") || "none"}`);
  }
  for (const [helper, identifier] of Object.entries(expectedHelperIdentifiers)) {
    const helperPlist = join(frameworks, helper, "Contents/Info.plist");
    if (!existsSync(helperPlist)) throw new Error(`Application resource is missing: ${helperPlist}`);
    assertPlistString(await readFile(helperPlist, "utf8"), "CFBundleIdentifier", identifier, helperPlist);
  }

  const buildReport = await verifyBuildProduct(buildProduct, { platform: "darwin" });
  if (!buildReport.ok) {
    const diagnostics = buildReport.findings
      .map(({ category, artifact, reason }) => `[${category}] ${artifact}: ${reason}`)
      .join("\n");
    throw new Error(`Packaged Build Product verification failed:\n${diagnostics}`);
  }
  assertCommand(
    await runCommand("/usr/bin/lipo", [executable, "-verify_arch", "arm64"]),
    `ARM64 executable verification for ${application}`
  );
  assertCommand(
    await runCommand("/usr/bin/lipo", [addon, "-verify_arch", "arm64"]),
    `ARM64 addon verification for ${application}`
  );
  assertCommand(
    await runCommand(
      "/usr/bin/codesign",
      ["--verify", "--deep", "--strict", "--verbose=2", `-R=${appVerificationRequirement}`, application]
    ),
    `Code-signing verification for ${application}`
  );
  return { executable, addon };
}

function assertPlistString(plist, key, expected, path) {
  const actual = plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`))?.[1];
  if (actual !== expected) throw new Error(`${path} has invalid ${key}: ${actual ?? "missing"}`);
}

function assertPlistKeyAbsent(plist, key, path) {
  if (plist.includes(`<key>${key}</key>`)) throw new Error(`${path} must not contain ${key}`);
}
