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

  it("reports missing and over-privileged production role bridges", async () => {
    const root = createBuildProductFixture();
    writeFixture(root, "preload/reader-window.cjs", preloadBundle("reader-window", { extra: ["onAudioChunk"] }));
    writeFixture(
      root,
      "preload/playback-renderer.cjs",
      preloadBundle("playback-renderer", { extra: ["setMiniMaxApiKey"] })
    );
    writeFixture(root, "preload/playback-overlay.cjs", preloadBundle("playback-overlay", { expose: false }));

    const report = await verifyBuiltVoiceReader(root, { platform: "darwin" });

    expect(report.findings).toEqual(
      expect.arrayContaining([
        {
          category: "role",
          artifact: "preload/reader-window.cjs",
          reason: "unexpected capability onAudioChunk"
        },
        {
          category: "role",
          artifact: "preload/playback-overlay.cjs",
          reason: "preload did not expose a bridge"
        },
        {
          category: "role",
          artifact: "preload/playback-renderer.cjs",
          reason: "unexpected capability setMiniMaxApiKey"
        }
      ])
    );
  });

  it("rejects the wrong global name and any additional preload exposure", async () => {
    const wrongNameRoot = createBuildProductFixture();
    writeFixture(
      wrongNameRoot,
      "preload/playback-renderer.cjs",
      preloadBundle("playback-renderer", { globalName: "notVoiceReader" })
    );
    const wrongNameReport = await verifyBuiltVoiceReader(wrongNameRoot, { platform: "darwin" });
    expect(wrongNameReport.findings).toContainEqual({
      category: "role",
      artifact: "preload/playback-renderer.cjs",
      reason: "preload must expose exactly one voiceReader bridge"
    });

    const extraExposureRoot = createBuildProductFixture();
    writeFixture(
      extraExposureRoot,
      "preload/playback-overlay.cjs",
      preloadBundle("playback-overlay", { extraExposure: true })
    );
    const extraExposureReport = await verifyBuiltVoiceReader(extraExposureRoot, { platform: "darwin" });
    expect(extraExposureReport.findings).toContainEqual({
      category: "role",
      artifact: "preload/playback-overlay.cjs",
      reason: "preload must expose exactly one voiceReader bridge"
    });
  });

  it("reports broken compiled Settings and route behavior", async () => {
    const root = createBuildProductFixture();
    writeFixture(
      root,
      "preload/reader-window.cjs",
      preloadBundle("reader-window", {
        brokenRoutes: true,
        brokenUnsubscribe: true,
        wrongChannels: true
      })
    );

    const report = await verifyBuiltVoiceReader(root, { platform: "darwin" });

    expect(report.findings).toEqual(
      expect.arrayContaining([
        {
          category: "behavior",
          artifact: "preload/reader-window.cjs",
          reason: "compiled Settings commands used unexpected channels"
        },
        {
          category: "behavior",
          artifact: "preload/reader-window.cjs",
          reason: "compiled route event used an unexpected channel"
        },
        {
          category: "behavior",
          artifact: "preload/reader-window.cjs",
          reason: "compiled route event did not preserve snapshot or unsubscribe behavior"
        },
        {
          category: "behavior",
          artifact: "preload/reader-window.cjs",
          reason: "compiled route commands used unexpected channels"
        },
        {
          category: "behavior",
          artifact: "preload/reader-window.cjs",
          reason: "compiled route commands did not preserve revisioned snapshots"
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
    "preload/reader-window.cjs": preloadBundle("reader-window"),
    "preload/playback-renderer.cjs": preloadBundle("playback-renderer"),
    "preload/playback-overlay.cjs": preloadBundle("playback-overlay"),
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

const roleCapabilities = {
  "reader-window": {
    invoke: [
      "getBootstrapState", "setOnboardingComplete", "setRoute", "getSettings", "setSpeechRate", "setModel",
      "setLaunchAtLogin", "setActivationShortcut", "setMiniMaxApiKey", "clearMiniMaxApiKey", "hasMiniMaxApiKey",
      "verifyMiniMaxKey", "refreshVoices", "setPreferredVoice", "getErrorLogCount", "clearErrorLog",
      "getReadingHistoryCount", "previewReadingHistoryRetention", "applyReadingHistoryRetention", "listReadingHistory",
      "deleteReadingHistoryRecord", "undoReadingHistoryDeletion", "clearReadingHistory", "createFavoriteFromHistoryRecord",
      "listFavorites", "deleteFavoriteRecord", "undoFavoriteDeletion", "playReadingTarget", "playHistoryRecord",
      "playFavoriteRecord", "stopPlayback", "copyText"
    ],
    event: ["onNavigate", "onPlaybackFinish", "onPlaybackFail", "onPlaybackStop"]
  },
  "playback-renderer": {
    invoke: ["reportAudioOutcome", "sendOverlayMetric"],
    event: ["onPlaybackStart", "onAudioChunk", "onSegmentEnd", "onAudioInputEnd", "onPlaybackFail", "onPlaybackStop"]
  },
  "playback-overlay": {
    invoke: ["notifyOverlayReady"],
    event: ["onOverlayShow", "onOverlayMetric", "onOverlayFinish", "onOverlayFail", "onOverlayStop"]
  }
};

const productionChannels = {
  getBootstrapState: "app-shell:get-bootstrap-state",
  setRoute: "app-shell:set-route",
  onNavigate: "app-shell:navigate",
  setSpeechRate: "app-data:set-speech-rate",
  setModel: "app-data:set-model"
};

function preloadBundle(
  role,
  {
    brokenRoutes = false,
    brokenUnsubscribe = false,
    expose = true,
    extra = [],
    extraExposure = false,
    globalName = "voiceReader",
    wrongChannels = false
  } = {}
) {
  if (!expose) return "module.exports = {};";
  const capabilities = roleCapabilities[role];
  return `
const { contextBridge, ipcRenderer } = require("electron");
const bridge = {};
for (const method of ${JSON.stringify([...capabilities.invoke, ...extra])}) {
  bridge[method] = (...args) => {
    if (${JSON.stringify(brokenRoutes)} && method === "setRoute") return { route: "broken", revision: -1 };
    const channel = ${JSON.stringify(wrongChannels)}
      ? "wrong:" + method
      : (${JSON.stringify(productionChannels)}[method] ?? "fixture:" + method);
    return ipcRenderer.invoke(channel, ...args);
  };
}
for (const method of ${JSON.stringify(capabilities.event)}) {
  bridge[method] = (callback) => {
    const listener = (_event, ...args) => callback(...args);
    const channel = ${JSON.stringify(wrongChannels)}
      ? "wrong:" + method
      : (${JSON.stringify(productionChannels)}[method] ?? "fixture:" + method);
    ipcRenderer.on(channel, listener);
    return () => { if (!${JSON.stringify(brokenUnsubscribe)}) ipcRenderer.off(channel, listener); };
  };
}

contextBridge.exposeInMainWorld(${JSON.stringify(globalName)}, bridge);
${extraExposure ? 'contextBridge.exposeInMainWorld("privileged", { dangerous() {} });' : ""}
`;
}
