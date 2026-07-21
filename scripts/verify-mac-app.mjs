import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { verifyBuiltVoiceReader } from "./build-verifier.mjs";
import { loadMacReleaseIdentity } from "./release-identity.mjs";
import { assertCommand, spawnCommand } from "./spawn-command.mjs";

export async function verifyMacApplicationStructure(
  application,
  {
    identity,
    runCommand = spawnCommand,
    verifyBuildProduct = verifyBuiltVoiceReader
  } = {}
) {
  const releaseIdentity = identity ?? (await loadMacReleaseIdentity());
  const executable = resolve(application, releaseIdentity.applicationPaths.executable);
  const buildProduct = resolve(application, releaseIdentity.applicationPaths.buildProduct);
  const addon = resolve(application, releaseIdentity.applicationPaths.nativeAddon);
  const icon = resolve(application, releaseIdentity.applicationPaths.icon);
  const packageDescriptor = resolve(
    application,
    releaseIdentity.applicationPaths.packagedDescriptor
  );
  const infoPlist = resolve(application, releaseIdentity.applicationPaths.infoPlist);
  for (const path of [executable, icon, packageDescriptor, infoPlist]) {
    if (!existsSync(path)) throw new Error(`Application resource is missing: ${path}`);
  }

  const info = await readFile(infoPlist, "utf8");
  for (const [key, value] of Object.entries(releaseIdentity.infoPlist)) {
    assertPlistString(info, key, value, infoPlist);
  }
  assertPlistKeyAbsent(info, "LSUIElement", infoPlist);
  assertPlistKeyAbsent(info, "NSAppleEventsUsageDescription", infoPlist);
  const defaultApplication = resolve(
    application,
    releaseIdentity.applicationPaths.defaultApplication
  );
  if (existsSync(defaultApplication)) {
    throw new Error(`Electron default application must be absent: ${defaultApplication}`);
  }

  const descriptor = JSON.parse(await readFile(packageDescriptor, "utf8"));
  const descriptorKeys = Object.keys(descriptor).sort();
  const expectedKeys = Object.keys(releaseIdentity.packagedDescriptor).sort();
  if (
    JSON.stringify(descriptorKeys) !== JSON.stringify(expectedKeys) ||
    expectedKeys.some((key) => descriptor[key] !== releaseIdentity.packagedDescriptor[key])
  ) {
    throw new Error(`Packaged application descriptor is invalid: ${packageDescriptor}`);
  }

  const frameworks = resolve(application, releaseIdentity.applicationPaths.frameworks);
  const helperApplications = (await readdir(frameworks)).filter((name) => name.startsWith("Electron Helper"));
  if (
    JSON.stringify(helperApplications.sort()) !==
    JSON.stringify(Object.keys(releaseIdentity.helperBundleIdentifiers).sort())
  ) {
    throw new Error(`Packaged Electron helpers are invalid: ${helperApplications.join(", ") || "none"}`);
  }
  for (const [helper, identifier] of Object.entries(releaseIdentity.helperBundleIdentifiers)) {
    const helperPlist = join(frameworks, helper, "Contents/Info.plist");
    if (!existsSync(helperPlist)) throw new Error(`Application resource is missing: ${helperPlist}`);
    assertPlistString(await readFile(helperPlist, "utf8"), "CFBundleIdentifier", identifier, helperPlist);
  }

  const buildReport = await verifyBuildProduct(buildProduct, { platform: releaseIdentity.platform });
  if (!buildReport.ok) {
    const diagnostics = buildReport.findings
      .map(({ category, artifact, reason }) => `[${category}] ${artifact}: ${reason}`)
      .join("\n");
    throw new Error(`Packaged Build Product verification failed:\n${diagnostics}`);
  }
  assertCommand(
    await runCommand("/usr/bin/lipo", [executable, "-verify_arch", releaseIdentity.architecture]),
    `${releaseIdentity.architecture} executable verification for ${application}`
  );
  assertCommand(
    await runCommand("/usr/bin/lipo", [addon, "-verify_arch", releaseIdentity.architecture]),
    `${releaseIdentity.architecture} addon verification for ${application}`
  );
  assertCommand(
    await runCommand(
      "/usr/bin/codesign",
      [
        "--verify",
        "--deep",
        "--strict",
        "--verbose=2",
        `-R=${releaseIdentity.signing.verificationRequirement}`,
        application
      ]
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
