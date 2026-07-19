import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyBuiltVoiceReader } from "../../scripts/build-verifier.mjs";

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("VoiceReader Build Verifier", () => {
  it("accepts a complete built product through one structured interface", async () => {
    const root = createBuildProductFixture();

    await expect(verifyBuiltVoiceReader(root, { platform: "darwin" })).resolves.toEqual({
      ok: true,
      findings: []
    });
  });

  it("aggregates missing artifacts and unexpected legacy artifacts", async () => {
    const root = createBuildProductFixture();
    rmSync(join(root, "main/main.js"));
    writeFixture(root, "preload/preload.js", "legacy");

    const report = await verifyBuiltVoiceReader(root, { platform: "darwin" });

    expect(report.ok).toBe(false);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        {
          category: "artifact",
          artifact: "main/main.js",
          reason: "required build artifact is missing"
        },
        {
          category: "artifact",
          artifact: "preload/preload.js",
          reason: "legacy build artifact must be absent"
        }
      ])
    );
  });

  it("returns a structured finding when an artifact path is not a readable file", async () => {
    const root = createBuildProductFixture();
    rmSync(join(root, "main/main.js"));
    mkdirSync(join(root, "main/main.js"));

    const report = await verifyBuiltVoiceReader(root, { platform: "darwin" });

    expect(report.findings).toContainEqual({
      category: "artifact",
      artifact: "main/main.js",
      reason: "build artifact must be a readable file"
    });

    rmSync(join(root, "main/main.js"), { recursive: true });
    writeFixture(root, "main/main.js", "main");
    chmodSync(join(root, "main/main.js"), 0o000);
    const unreadableReport = await verifyBuiltVoiceReader(root, { platform: "darwin" });
    expect(unreadableReport.findings).toContainEqual({
      category: "artifact",
      artifact: "main/main.js",
      reason: "build artifact must be a readable file"
    });
  });

  it("reports every broken HTML and resource relationship", async () => {
    const root = createBuildProductFixture();
    writeFixture(root, "renderer/index.html", html("Wrong title", "missing.js"));
    writeFixture(root, "playback-renderer/index.html", "<html><body></body></html>");
    writeFixture(root, "renderer/assets/voicereader-icon.svg", "different icon");

    const report = await verifyBuiltVoiceReader(root, { platform: "linux" });

    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "html", artifact: "renderer/index.html" }),
        {
          category: "html",
          artifact: "renderer/index.html",
          reason: "missing stylesheet ./renderer.css"
        },
        {
          category: "html",
          artifact: "renderer/index.html",
          reason: "missing script entrypoint ./renderer.js"
        },
        {
          category: "html",
          artifact: "playback-renderer/index.html",
          reason: "missing Content Security Policy"
        },
        {
          category: "html",
          artifact: "playback-renderer/index.html",
          reason: "media Content Security Policy must allow local blob audio"
        },
        expect.objectContaining({ category: "html", artifact: "playback-renderer/index.html" }),
        {
          category: "resource",
          artifact: "renderer/assets/voicereader-icon.svg",
          reason: "renderer icon must match the packaged application icon"
        }
      ])
    );
  });

});

function createBuildProductFixture() {
  const root = mkdtempSync(join(tmpdir(), "voicereader-build-product-"));
  temporaryRoots.push(root);
  const files = {
    "main/main.js": "main",
    "preload/reader-window.cjs": "reader preload",
    "preload/playback-renderer.cjs": "playback preload",
    "preload/playback-overlay.cjs": "overlay preload",
    "renderer/index.html": html("VoiceReader", "renderer.js", "renderer.css"),
    "renderer/renderer.js": "renderer",
    "renderer/renderer.css": "renderer css",
    "renderer/assets/voicereader-icon.svg": "app icon",
    "playback-renderer/index.html": html("VoiceReader Playback Renderer", "playback-renderer.js"),
    "playback-renderer/playback-renderer.js": "playback renderer",
    "overlay/index.html": html("VoiceReader Overlay", "overlay.js", "overlay.css"),
    "overlay/overlay.js": "overlay",
    "overlay/overlay.css": "overlay css",
    "assets/voicereader-icon.svg": "app icon",
    "assets/voicereader-template-icon.svg": "tray icon",
    "native/selection-copy-macos.node": "native"
  };
  for (const [path, content] of Object.entries(files)) writeFixture(root, path, content);
  return root;
}

function html(title, script, stylesheet) {
  return `<!doctype html><html><head><title>${title}</title><meta http-equiv="Content-Security-Policy" content="default-src 'self'; media-src 'self' blob:">${stylesheet ? `<link rel="stylesheet" href="./${stylesheet}">` : ""}</head><body><script type="module" src="./${script}"></script></body></html>`;
}

function writeFixture(root, path, content) {
  const absolutePath = join(root, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}
