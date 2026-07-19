import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyMacApplicationStructure } from "../../scripts/verify-mac-app.mjs";

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("macOS application artifact verifier", () => {
  it("verifies final metadata, resources, Build Product, architecture, and designated requirement", async () => {
    const application = createApplicationFixture();
    writeFixture(
      application,
      "Contents/Resources/app/package.json",
      JSON.stringify({
        main: "dist/main/main.js",
        type: "module",
        version: "0.1.0",
        productName: "VoiceReader",
        name: "voicereader"
      })
    );
    const commands = [];
    const verifyBuildProduct = vi.fn(async () => ({ ok: true, findings: [] }));

    const result = await verifyMacApplicationStructure(application, {
      runCommand: async (command, args) => {
        commands.push([command, args]);
        return { code: 0, signal: null };
      },
      verifyBuildProduct
    });

    expect(result).toEqual({
      executable: join(application, "Contents/MacOS/VoiceReader"),
      addon: join(application, "Contents/Resources/app/dist/native/selection-copy-macos.node")
    });
    expect(verifyBuildProduct).toHaveBeenCalledWith(
      join(application, "Contents/Resources/app/dist"),
      { platform: "darwin" }
    );
    expect(commands).toEqual(
      expect.arrayContaining([
        ["/usr/bin/lipo", [join(application, "Contents/MacOS/VoiceReader"), "-verify_arch", "arm64"]],
        [
          "/usr/bin/codesign",
          [
            "--verify",
            "--deep",
            "--strict",
            "--verbose=2",
            '-R=identifier "com.local.voicereader"',
            application
          ]
        ]
      ])
    );
  });

  it("rejects stale Electron metadata and resources at the final application seam", async () => {
    const application = createApplicationFixture();
    writeFixture(application, "Contents/Resources/default_app.asar", "stale");

    await expect(
      verifyMacApplicationStructure(application, {
        runCommand: vi.fn(),
        verifyBuildProduct: vi.fn()
      })
    ).rejects.toThrow("default application must be absent");

    rmSync(join(application, "Contents/Resources/default_app.asar"));
    writeFixture(application, "Contents/Info.plist", infoPlist({ CFBundleIdentifier: "wrong.bundle" }));
    await expect(
      verifyMacApplicationStructure(application, {
        runCommand: vi.fn(),
        verifyBuildProduct: vi.fn()
      })
    ).rejects.toThrow("invalid CFBundleIdentifier");
  });

  it("rejects extra application descriptor fields", async () => {
    const application = createApplicationFixture();
    writeFixture(
      application,
      "Contents/Resources/app/package.json",
      JSON.stringify({
        name: "voicereader",
        productName: "VoiceReader",
        version: "0.1.0",
        type: "module",
        main: "dist/main/main.js",
        unexpected: true
      })
    );

    await expect(
      verifyMacApplicationStructure(application, {
        runCommand: vi.fn(),
        verifyBuildProduct: vi.fn()
      })
    ).rejects.toThrow("descriptor is invalid");
  });
});

function createApplicationFixture() {
  const root = mkdtempSync(join(tmpdir(), "voicereader-app-verifier-"));
  temporaryRoots.push(root);
  const application = join(root, "VoiceReader.app");
  writeFixture(application, "Contents/MacOS/VoiceReader", "executable");
  writeFixture(application, "Contents/Resources/app/dist/native/selection-copy-macos.node", "addon");
  writeFixture(application, "Contents/Resources/app/dist/main/main.js", "main");
  writeFixture(application, "Contents/Resources/VoiceReader.icns", "icon");
  writeFixture(
    application,
    "Contents/Resources/app/package.json",
    JSON.stringify({
      name: "voicereader",
      productName: "VoiceReader",
      version: "0.1.0",
      type: "module",
      main: "dist/main/main.js"
    })
  );
  writeFixture(application, "Contents/Info.plist", infoPlist());
  for (const [helper, identifier] of Object.entries({
    "Electron Helper.app": "com.local.voicereader.helper",
    "Electron Helper (GPU).app": "com.local.voicereader.helper.gpu",
    "Electron Helper (Plugin).app": "com.local.voicereader.helper.plugin",
    "Electron Helper (Renderer).app": "com.local.voicereader.helper.renderer"
  })) {
    writeFixture(
      application,
      `Contents/Frameworks/${helper}/Contents/Info.plist`,
      infoPlist({ CFBundleIdentifier: identifier }, ["CFBundleIdentifier"])
    );
  }
  return application;
}

function infoPlist(overrides = {}, keys = Object.keys(defaultInfo())) {
  const values = { ...defaultInfo(), ...overrides };
  return `<?xml version="1.0"?><plist><dict>${keys
    .map((key) => `<key>${key}</key><string>${values[key]}</string>`)
    .join("")}</dict></plist>`;
}

function defaultInfo() {
  return {
    CFBundleDisplayName: "VoiceReader",
    CFBundleExecutable: "VoiceReader",
    CFBundleIconFile: "VoiceReader.icns",
    CFBundleIdentifier: "com.local.voicereader",
    CFBundleName: "VoiceReader",
    CFBundleShortVersionString: "0.1.0",
    CFBundleVersion: "0.1.0"
  };
}

function writeFixture(root, relativePath, contents) {
  const path = join(root, relativePath);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, contents);
}
