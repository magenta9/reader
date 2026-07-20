import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMacReleaseIdentity,
  loadMacReleaseIdentity
} from "../../scripts/release-identity.mjs";
import { verifyMacApplicationStructure } from "../../scripts/verify-mac-app.mjs";

const temporaryRoots = [];
const repositoryIdentity = await loadMacReleaseIdentity();

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("macOS application artifact verifier", () => {
  it("verifies an artifact that matches the explicit Release Identity", async () => {
    const identity = createTestIdentity();
    const application = createApplicationFixture(identity);
    const commands = [];
    const verifyBuildProduct = vi.fn(async () => ({ ok: true, findings: [] }));

    const result = await verifyMacApplicationStructure(application, {
      identity,
      runCommand: async (command, args) => {
        commands.push([command, args]);
        return { code: 0, signal: null };
      },
      verifyBuildProduct
    });

    const executable = join(application, identity.applicationPaths.executable);
    const addon = join(application, identity.applicationPaths.nativeAddon);
    expect(result).toEqual({ executable, addon });
    expect(verifyBuildProduct).toHaveBeenCalledWith(
      join(application, identity.applicationPaths.buildProduct),
      { platform: identity.platform }
    );
    expect(commands).toEqual(
      expect.arrayContaining([
        ["/usr/bin/lipo", [executable, "-verify_arch", identity.architecture]],
        [
          "/usr/bin/codesign",
          [
            "--verify",
            "--deep",
            "--strict",
            "--verbose=2",
            `-R=${identity.signing.verificationRequirement}`,
            application
          ]
        ]
      ])
    );
  });

  it("rejects a stale version at the final artifact seam", async () => {
    const identity = createTestIdentity();
    const application = createApplicationFixture(identity);
    writeFixture(
      application,
      identity.applicationPaths.infoPlist,
      infoPlist(identity, { CFBundleVersion: repositoryIdentity.package.version })
    );

    await expectVerificationFailure(application, identity, "invalid CFBundleVersion");
  });

  it("rejects a stale packaged descriptor at the final artifact seam", async () => {
    const identity = createTestIdentity();
    const application = createApplicationFixture(identity);
    writeFixture(
      application,
      identity.applicationPaths.packagedDescriptor,
      JSON.stringify({ ...identity.packagedDescriptor, unexpected: true })
    );

    await expectVerificationFailure(application, identity, "descriptor is invalid");
  });

  it("rejects a stale main bundle identifier at the final artifact seam", async () => {
    const identity = createTestIdentity();
    const application = createApplicationFixture(identity);
    writeFixture(
      application,
      identity.applicationPaths.infoPlist,
      infoPlist(identity, { CFBundleIdentifier: `${identity.bundleIdentifier}.stale` })
    );

    await expectVerificationFailure(application, identity, "invalid CFBundleIdentifier");
  });

  it("rejects a stale helper bundle identifier at the final artifact seam", async () => {
    const identity = createTestIdentity();
    const application = createApplicationFixture(identity);
    const [helper] = Object.keys(identity.helperBundleIdentifiers);
    writeFixture(
      application,
      join(identity.applicationPaths.frameworks, helper, "Contents/Info.plist"),
      infoPlist(identity, { CFBundleIdentifier: `${identity.bundleIdentifier}.stale-helper` }, [
        "CFBundleIdentifier"
      ])
    );

    await expectVerificationFailure(application, identity, "invalid CFBundleIdentifier");
  });

  it("rejects missing executable and resource identity at the final artifact seam", async () => {
    const identity = createTestIdentity();
    const application = createApplicationFixture(identity);
    rmSync(join(application, identity.applicationPaths.executable));

    await expectVerificationFailure(application, identity, "Application resource is missing");

    writeFixture(application, identity.applicationPaths.executable, "executable");
    rmSync(join(application, identity.applicationPaths.icon));
    await expectVerificationFailure(application, identity, "Application resource is missing");
  });

  it("rejects stale Electron default application resources", async () => {
    const identity = createTestIdentity();
    const application = createApplicationFixture(identity);
    writeFixture(application, identity.applicationPaths.defaultApplication, "stale");

    await expectVerificationFailure(application, identity, "default application must be absent");
  });
});

function createTestIdentity() {
  const [major, minor, patch] = repositoryIdentity.package.version.split(".").map(Number);
  return createMacReleaseIdentity(
    { ...repositoryIdentity.package, version: `${major}.${minor}.${patch + 1}` },
    { root: join(repositoryIdentity.paths.releaseDirectory, "../..") }
  );
}

function createApplicationFixture(identity) {
  const root = mkdtempSync(join(tmpdir(), "voicereader-app-verifier-"));
  temporaryRoots.push(root);
  const application = join(root, identity.appFileName);
  writeFixture(application, identity.applicationPaths.executable, "executable");
  writeFixture(application, identity.applicationPaths.icon, "icon");
  writeFixture(
    application,
    identity.applicationPaths.packagedDescriptor,
    JSON.stringify(identity.packagedDescriptor)
  );
  writeFixture(application, identity.applicationPaths.infoPlist, infoPlist(identity));
  for (const [helper, identifier] of Object.entries(identity.helperBundleIdentifiers)) {
    writeFixture(
      application,
      join(identity.applicationPaths.frameworks, helper, "Contents/Info.plist"),
      infoPlist(identity, { CFBundleIdentifier: identifier }, ["CFBundleIdentifier"])
    );
  }
  return application;
}

function infoPlist(identity, overrides = {}, keys = Object.keys(identity.infoPlist)) {
  const values = { ...identity.infoPlist, ...overrides };
  return `<?xml version="1.0"?><plist><dict>${keys
    .map((key) => `<key>${key}</key><string>${values[key]}</string>`)
    .join("")}</dict></plist>`;
}

async function expectVerificationFailure(application, identity, message) {
  await expect(
    verifyMacApplicationStructure(application, {
      identity,
      runCommand: vi.fn(),
      verifyBuildProduct: vi.fn()
    })
  ).rejects.toThrow(message);
}

function writeFixture(root, relativePath, contents) {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}
