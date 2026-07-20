import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createMacReleaseIdentity,
  loadMacReleaseIdentity
} from "../../scripts/release-identity.mjs";

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("macOS Release Identity", () => {
  it("derives the complete current release contract from package metadata", () => {
    const root = createRoot();
    const identity = createMacReleaseIdentity(validMetadata(), { root });

    expect(identity).toMatchObject({
      package: validMetadata(),
      productName: "VoiceReader",
      bundleIdentifier: "com.local.voicereader",
      appFileName: "VoiceReader.app",
      dmgFileName: "VoiceReader-0.1.0-arm64.dmg",
      installedAppPath: "/Applications/VoiceReader.app",
      packagedDescriptor: {
        name: "voicereader",
        productName: "VoiceReader",
        version: "0.1.0",
        type: "module",
        main: "dist/main/main.js"
      },
      infoPlist: {
        CFBundleDisplayName: "VoiceReader",
        CFBundleExecutable: "VoiceReader",
        CFBundleIconFile: "VoiceReader.icns",
        CFBundleIdentifier: "com.local.voicereader",
        CFBundleName: "VoiceReader",
        CFBundleShortVersionString: "0.1.0",
        CFBundleVersion: "0.1.0"
      },
      helperBundleIdentifiers: {
        "Electron Helper.app": "com.local.voicereader.helper",
        "Electron Helper (GPU).app": "com.local.voicereader.helper.gpu",
        "Electron Helper (Plugin).app": "com.local.voicereader.helper.plugin",
        "Electron Helper (Renderer).app": "com.local.voicereader.helper.renderer"
      },
      signing: {
        designatedRequirement: '=designated => identifier "com.local.voicereader"',
        verificationRequirement: 'identifier "com.local.voicereader"'
      },
      packagingPlan: {
        platform: "darwin",
        arch: "arm64",
        app: "release/mac/VoiceReader.app",
        dmg: "release/mac/VoiceReader-0.1.0-arm64.dmg",
        customPackager: true,
        installsApplication: false
      }
    });
    expect(identity.paths).toEqual({
      releaseDirectory: join(root, "release/mac"),
      application: join(root, "release/mac/VoiceReader.app"),
      diskImage: join(root, "release/mac/VoiceReader-0.1.0-arm64.dmg"),
      electronApplication: join(root, "node_modules/electron/dist/Electron.app"),
      iconset: join(root, "release/mac/VoiceReader.iconset"),
      icon: join(root, "release/mac/VoiceReader.icns"),
      iconSource: join(root, "assets/voicereader-icon.svg")
    });
    expect(identity.applicationPaths).toEqual({
      executable: "Contents/MacOS/VoiceReader",
      icon: "Contents/Resources/VoiceReader.icns",
      packagedDescriptor: "Contents/Resources/app/package.json",
      infoPlist: "Contents/Info.plist",
      buildProduct: "Contents/Resources/app/dist",
      nativeAddon: "Contents/Resources/app/dist/native/selection-copy-macos.node",
      frameworks: "Contents/Frameworks",
      defaultApplication: "Contents/Resources/default_app.asar"
    });
  });

  it("moves every version-bearing output when the root version changes", () => {
    const root = createRoot();
    const identity = createMacReleaseIdentity(validMetadata({ version: "2.4.0" }), {
      root
    });

    expect(identity.package.version).toBe("2.4.0");
    expect(identity.dmgFileName).toBe("VoiceReader-2.4.0-arm64.dmg");
    expect(identity.paths.diskImage).toBe(
      join(root, "release/mac/VoiceReader-2.4.0-arm64.dmg")
    );
    expect(identity.packagedDescriptor.version).toBe("2.4.0");
    expect(identity.infoPlist.CFBundleShortVersionString).toBe("2.4.0");
    expect(identity.infoPlist.CFBundleVersion).toBe("2.4.0");
    expect(identity.packagingPlan.dmg).toBe("release/mac/VoiceReader-2.4.0-arm64.dmg");
  });

  it.each([
    [null, "package metadata"],
    [[], "package metadata"],
    [validMetadata({ name: "sensitive-wrong-name" }), "package name"],
    [validMetadata({ private: "sensitive-private-flag" }), "package private flag"],
    [validMetadata({ version: "sensitive-version" }), "package version"],
    [validMetadata({ type: "sensitive-type" }), "package type"],
    [validMetadata({ main: "sensitive-entry.js" }), "package main"]
  ])("fails closed for invalid metadata without echoing its value", (metadata, field) => {
    const root = createRoot();
    let thrown;

    try {
      createMacReleaseIdentity(metadata, { root });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown.message).toContain(field);
    expect(thrown.message).not.toContain("sensitive");
  });

  it("does not retain or freeze the caller's metadata object", () => {
    const root = createRoot();
    const metadata = validMetadata();
    const identity = createMacReleaseIdentity(metadata, { root });

    metadata.version = "9.9.9";

    expect(Object.isFrozen(metadata)).toBe(false);
    expect(identity.package.version).toBe("0.1.0");
    expect(identity.packagedDescriptor.version).toBe("0.1.0");
  });

  it("loads a deeply immutable snapshot from a substitutable package metadata file", async () => {
    const root = createRoot();
    const metadata = validMetadata();
    writeFileSync(join(root, "package.json"), JSON.stringify(metadata));

    const identity = await loadMacReleaseIdentity({ root });

    expect(identity.package.version).toBe("0.1.0");
    expect(Object.isFrozen(identity)).toBe(true);
    expect(Object.isFrozen(identity.package)).toBe(true);
    expect(Object.isFrozen(identity.packagedDescriptor)).toBe(true);
    expect(Object.isFrozen(identity.infoPlist)).toBe(true);
    expect(Object.isFrozen(identity.helperBundleIdentifiers)).toBe(true);
    expect(Object.isFrozen(identity.paths)).toBe(true);
    expect(Object.isFrozen(identity.applicationPaths)).toBe(true);
    expect(Object.isFrozen(identity.signing)).toBe(true);
    expect(Object.isFrozen(identity.packagingPlan)).toBe(true);
    expect(() => {
      identity.package.version = "3.0.0";
    }).toThrow(TypeError);
  });
});

function createRoot() {
  const root = mkdtempSync(join(tmpdir(), "voicereader-release-identity-"));
  temporaryRoots.push(root);
  return root;
}

function validMetadata(patch = {}) {
  return {
    name: "voicereader",
    version: "0.1.0",
    private: true,
    type: "module",
    main: "dist/main/main.js",
    ...patch
  };
}
