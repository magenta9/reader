import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const shouldBuild = !process.argv.includes("--no-build");
if (shouldBuild) await run("scripts/build.mjs", []);

const { ElectronPlaybackOutput } = await import("../dist/main/playback/electron-playback-output.js");
const { PLAYBACK_FEEDBACK_SURFACES } = await import("../dist/shared/app-contracts.js");
const {
  APP_DATA_CHANNELS,
  APP_SHELL_CHANNELS,
  PLAYBACK_CONTROL_CHANNELS,
  PLAYBACK_OVERLAY_COMMAND_CHANNELS,
  PLAYBACK_OVERLAY_EVENT_CHANNELS,
  RENDERER_AUDIO_CHANNELS
} = await import("../dist/shared/bridge-contracts.js");

const bridgeContractModuleChecks = [
  {
    distPath: "../dist/shared/bridge-contracts/app-shell.js",
    sourcePath: "../src/shared/bridge-contracts/app-shell.ts",
    expectedValues: ["APP_SHELL_CHANNELS", "interface AppShellBridge"]
  },
  {
    distPath: "../dist/shared/bridge-contracts/app-data.js",
    sourcePath: "../src/shared/bridge-contracts/app-data.ts",
    expectedValues: ["APP_DATA_CHANNELS", "interface AppDataBridge"]
  },
  {
    distPath: "../dist/shared/bridge-contracts/playback-control.js",
    sourcePath: "../src/shared/bridge-contracts/playback-control.ts",
    expectedValues: ["PLAYBACK_CONTROL_CHANNELS", "interface PlaybackControlBridge"]
  },
  {
    distPath: "../dist/shared/bridge-contracts/clipboard.js",
    sourcePath: "../src/shared/bridge-contracts/clipboard.ts",
    expectedValues: ["CLIPBOARD_CHANNELS", "interface ClipboardBridge"]
  },
  {
    distPath: "../dist/shared/bridge-contracts/renderer-audio.js",
    sourcePath: "../src/shared/bridge-contracts/renderer-audio.ts",
    expectedValues: [
      "RENDERER_AUDIO_CHANNELS",
      "interface PlaybackFeedbackBridge",
      "interface PlaybackRendererBridge"
    ]
  },
  {
    name: "playback-overlay",
    distPath: "../dist/shared/bridge-contracts/playback-overlay.js",
    sourcePath: "../src/shared/bridge-contracts/playback-overlay.ts",
    expectedValues: [
      "PLAYBACK_OVERLAY_EVENT_CHANNELS",
      "PLAYBACK_OVERLAY_COMMAND_CHANNELS",
      "interface PlaybackOverlayBridge"
    ]
  }
];

const mainBridgeHandlerModuleChecks = [
  {
    distPath: "../dist/main/app-bridge-handlers/app-shell.js",
    sourcePath: "../src/main/app-bridge-handlers/app-shell.ts",
    expectedValues: ["registerAppShellHandlers", "APP_SHELL_CHANNELS"]
  },
  {
    distPath: "../dist/main/app-bridge-handlers/app-data.js",
    sourcePath: "../src/main/app-bridge-handlers/app-data.ts",
    expectedValues: ["registerAppDataHandlers", "APP_DATA_CHANNELS", "setPreferredVoice"]
  },
  {
    distPath: "../dist/main/app-bridge-handlers/playback-control.js",
    sourcePath: "../src/main/app-bridge-handlers/playback-control.ts",
    expectedValues: [
      "registerPlaybackControlHandlers",
      "PLAYBACK_CONTROL_CHANNELS",
      "readingTargetAcquirer.revealPreviousAppBeforeCapture()",
      "playbackCommands.startReadingTargetPlayback()"
    ]
  },
  {
    distPath: "../dist/main/app-bridge-handlers/clipboard.js",
    sourcePath: "../src/main/app-bridge-handlers/clipboard.ts",
    expectedValues: ["registerClipboardHandlers", "CLIPBOARD_CHANNELS"]
  },
  {
    distPath: "../dist/main/app-bridge-handlers/playback-overlay.js",
    sourcePath: "../src/main/app-bridge-handlers/playback-overlay.ts",
    expectedValues: ["registerPlaybackOverlayHandlers", "PLAYBACK_OVERLAY_COMMAND_CHANNELS"]
  }
];

const preloadBridgeAdapterModuleChecks = [
  {
    distPath: "../dist/preload/bridge-adapters/app-shell.js",
    sourcePath: "../src/preload/bridge-adapters/app-shell.ts",
    expectedValues: ["createAppShellBridge", "APP_SHELL_CHANNELS", "onNavigate"]
  },
  {
    distPath: "../dist/preload/bridge-adapters/app-data.js",
    sourcePath: "../src/preload/bridge-adapters/app-data.ts",
    expectedValues: ["createAppDataBridge", "APP_DATA_CHANNELS", "setPreferredVoice"]
  },
  {
    distPath: "../dist/preload/bridge-adapters/playback-control.js",
    sourcePath: "../src/preload/bridge-adapters/playback-control.ts",
    expectedValues: ["createPlaybackControlBridge", "PLAYBACK_CONTROL_CHANNELS"]
  },
  {
    distPath: "../dist/preload/bridge-adapters/clipboard.js",
    sourcePath: "../src/preload/bridge-adapters/clipboard.ts",
    expectedValues: ["createClipboardBridge", "CLIPBOARD_CHANNELS"]
  },
  {
    distPath: "../dist/preload/bridge-adapters/renderer-audio.js",
    sourcePath: "../src/preload/bridge-adapters/renderer-audio.ts",
    expectedValues: [
      "createPlaybackFeedbackBridge",
      "createPlaybackRendererBridge",
      "RENDERER_AUDIO_CHANNELS",
      "PLAYBACK_OVERLAY_COMMAND_CHANNELS"
    ]
  },
  {
    distPath: "../dist/preload/bridge-adapters/playback-overlay.js",
    sourcePath: "../src/preload/bridge-adapters/playback-overlay.ts",
    expectedValues: [
      "createPlaybackOverlayBridge",
      "PLAYBACK_OVERLAY_EVENT_CHANNELS",
      "PLAYBACK_OVERLAY_COMMAND_CHANNELS"
    ]
  },
  {
    distPath: "../dist/preload/bridge-adapters/ipc.js",
    sourcePath: "../src/preload/bridge-adapters/ipc.ts",
    expectedValues: ["interface PreloadIpc", "invoke<T>", "subscribe<T>", "subscribeVoid"]
  }
];

for (const path of [
  "../dist/main/main.js",
  "../dist/main/app-bridge-handlers.js",
  ...mainBridgeHandlerModuleChecks.map(({ distPath }) => distPath),
  "../dist/main/app-presence-controller.js",
  "../dist/main/playback/playback-request-resolver.js",
  "../dist/main/reading-target/reading-target-acquirer.js",
  "../dist/shared/app-contracts.js",
  "../dist/shared/bridge-contracts.js",
  ...bridgeContractModuleChecks.map(({ distPath }) => distPath),
  "../dist/preload/preload.cjs",
  ...preloadBridgeAdapterModuleChecks.map(({ distPath }) => distPath),
  "../dist/renderer/index.html",
  "../dist/renderer/renderer.js",
  "../dist/renderer/record-view-model.js",
  "../dist/renderer/renderer.css",
  "../dist/playback-renderer/index.html",
  "../dist/playback-renderer/playback-renderer.js",
  "../dist/assets/voicereader-icon.svg",
  "../dist/assets/voicereader-template-icon.svg",
  "../dist/renderer/assets/voicereader-icon.svg",
  "../dist/overlay/index.html",
  "../dist/overlay/overlay.js",
  "../dist/overlay/overlay.css"
]) {
  assertFileExists(path);
}
assertFileMissing("../dist/preload/preload.js");
if (process.platform === "darwin") {
  assertFileExists("../dist/native/selection-copy-macos.node");
}

const mainBundle = await readFile(new URL("../dist/main/main.js", import.meta.url), "utf8");
const appContractsBundle = await readFile(new URL("../dist/shared/app-contracts.js", import.meta.url), "utf8");
const appContractsSource = await readFile(new URL("../src/shared/app-contracts.ts", import.meta.url), "utf8");
const bridgeContractsSource = await readFile(new URL("../src/shared/bridge-contracts.ts", import.meta.url), "utf8");
const preloadBundle = await readFile(new URL("../dist/preload/preload.cjs", import.meta.url), "utf8");
const preloadSource = await readFile(new URL("../src/preload/preload.ts", import.meta.url), "utf8");
const rendererHtml = await readFile(new URL("../dist/renderer/index.html", import.meta.url), "utf8");
const rendererBundle = await readFile(new URL("../dist/renderer/renderer.js", import.meta.url), "utf8");
const playbackRendererHtml = await readFile(new URL("../dist/playback-renderer/index.html", import.meta.url), "utf8");
const playbackRendererBundle = await readFile(
  new URL("../dist/playback-renderer/playback-renderer.js", import.meta.url),
  "utf8"
);
const overlayHtml = await readFile(new URL("../dist/overlay/index.html", import.meta.url), "utf8");
const overlayBundle = await readFile(new URL("../dist/overlay/overlay.js", import.meta.url), "utf8");
const overlayCss = await readFile(new URL("../dist/overlay/overlay.css", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../src/main/main.ts", import.meta.url), "utf8");
const appBridgeHandlersSource = await readFile(new URL("../src/main/app-bridge-handlers.ts", import.meta.url), "utf8");
const appPresenceControllerSource = await readFile(new URL("../src/main/app-presence-controller.ts", import.meta.url), "utf8");
const rendererSource = await readFile(new URL("../src/renderer/main.tsx", import.meta.url), "utf8");
const readerWindowAppSource = await readFile(new URL("../src/renderer/App.tsx", import.meta.url), "utf8");
const playbackAudioSource = await readFile(
  new URL("../src/playback-renderer/audio-player.ts", import.meta.url),
  "utf8"
);
const playbackRendererSource = await readFile(new URL("../src/playback-renderer/main.ts", import.meta.url), "utf8");
const overlaySource = await readFile(new URL("../src/overlay/main.tsx", import.meta.url), "utf8");
const playbackOverlayAppSource = await readFile(new URL("../src/overlay/App.tsx", import.meta.url), "utf8");
const voiceReaderBridgeSource = await readFile(new URL("../src/shared/voice-reader-bridge.ts", import.meta.url), "utf8");
const appDataStoreSource = await readFile(new URL("../src/main/data/app-data-store.ts", import.meta.url), "utf8");
const minimaxAccountSource = await readFile(new URL("../src/main/data/minimax-account-service.ts", import.meta.url), "utf8");
const playbackServiceSource = await readFile(new URL("../src/main/playback/playback-service.ts", import.meta.url), "utf8");
const playbackCommandSource = await readFile(new URL("../src/main/playback/playback-command-controller.ts", import.meta.url), "utf8");
const playbackRequestResolverSource = await readFile(new URL("../src/main/playback/playback-request-resolver.ts", import.meta.url), "utf8");
const playbackOverlayControllerSource = await readFile(new URL("../src/main/playback/playback-overlay-controller.ts", import.meta.url), "utf8");
const readingTargetAcquirerSource = await readFile(new URL("../src/main/reading-target/reading-target-acquirer.ts", import.meta.url), "utf8");
const rendererCssSource = await readFile(new URL("../src/renderer/styles.css", import.meta.url), "utf8");
const packageScript = await readFile(new URL("../scripts/package-mac.mjs", import.meta.url), "utf8");
const appVerificationScript = await readFile(new URL("../scripts/verify-mac-app.mjs", import.meta.url), "utf8");
const appIconSource = await readFile(new URL("../assets/voicereader-icon.svg", import.meta.url), "utf8");
const templateTrayIconSource = await readFile(new URL("../assets/voicereader-template-icon.svg", import.meta.url), "utf8");
const builtTemplateTrayIcon = await readFile(new URL("../dist/assets/voicereader-template-icon.svg", import.meta.url), "utf8");
const checkedSources = new Map();
for (const { sourcePath, expectedValues } of [
  ...bridgeContractModuleChecks,
  ...mainBridgeHandlerModuleChecks,
  ...preloadBridgeAdapterModuleChecks
]) {
  const source = await readFile(new URL(sourcePath, import.meta.url), "utf8");
  checkedSources.set(sourcePath, source);
  assertIncludes(source, expectedValues);
}
const playbackOverlayBridgeSource =
  checkedSources.get("../src/shared/bridge-contracts/playback-overlay.ts") ?? "";
assertIncludes(mainBundle, [
  "VoiceReader",
  "\\u64AD\\u653E",
  "\\u6253\\u5F00 VoiceReader",
  "\\u5386\\u53F2\\u8BB0\\u5F55",
  "\\u6536\\u85CF",
  "\\u8BBE\\u7F6E",
  "width: 1100",
  "height: 760",
  "minWidth: 900",
  "minHeight: 620",
  "titleBarStyle",
  "hiddenInset",
  "../preload/preload.cjs",
  "setPath",
  "userData",
  "AppPresenceController",
  "shouldOpenWindowAtStartup",
  "wasOpenedAtLogin",
  'app.on("activate"',
  'readerWindow.on("close"',
  "event.preventDefault()",
  "readerWindow?.hide()",
  'openReaderWindow("history")',
  'openReaderWindow("favorites")',
  'openReaderWindow("settings")',
  "VoiceReader Playback Renderer",
  "playback-renderer/index.html",
  "backgroundThrottling: false",
  "showInactive"
]);
assert.equal(mainBundle.includes("focusable: false") || mainBundle.includes("focusable: !1"), true);
assertIncludes(mainBundle, [
  "setAlwaysOnTop",
  "moveTop",
  "screen-saver",
  "getDisplayNearestPoint",
  "getCursorScreenPoint",
  "setPosition",
  APP_SHELL_CHANNELS.navigate,
  PLAYBACK_OVERLAY_EVENT_CHANNELS.metric,
  PLAYBACK_OVERLAY_COMMAND_CHANNELS.finishPlayback,
  PLAYBACK_OVERLAY_COMMAND_CHANNELS.ready,
  PLAYBACK_CONTROL_CHANNELS.rendererIdle,
  "PlaybackCommandController",
  "ElectronPlaybackOutput",
  "stopSession",
  APP_DATA_CHANNELS.setActivationShortcut,
  APP_DATA_CHANNELS.createFavoriteFromHistoryRecord,
  APP_DATA_CHANNELS.listFavorites,
  APP_DATA_CHANNELS.deleteFavoriteRecord,
  PLAYBACK_CONTROL_CHANNELS.playFavoriteRecord,
  "ReadingTargetAcquirer",
  "selected_text",
  "selection-copy-macos.node",
  "readSelectedText",
  "import.meta.url"
]);
assertMissing(mainBundle, ["../preload/preload.js", "safeStorage", "isTrustedAccessibilityClient", "/usr/bin/osascript", "__dirname"]);
assertIncludes(mainSource, [
  "shouldRevealPreviousAppBeforeSelectionCapture",
  "AppPresenceController",
  "appPresence.ensureDockVisible()",
  "appPresence.setDockIconFromSvg(appIconAssetPath)",
  "appPresence.hideForSelectionCapture()",
  "ReadingTargetAcquirer",
  "ElectronPlaybackOutput.create",
  "createPlaybackRendererWindow",
  "playbackRendererEntry",
  "playbackOutput.destroy()",
  "registerAppBridgeHandlers",
  'label: "停止朗读"',
  "() => readingTargetAcquirer.acquire()"
]);
assertIncludes(appBridgeHandlersSource, [
  "registerAppBridgeHandlers",
  "registerAppShellHandlers",
  "registerAppDataHandlers",
  "registerPlaybackControlHandlers",
  "registerClipboardHandlers",
  "registerPlaybackOverlayHandlers"
]);
assertMissing(appBridgeHandlersSource, [
  "ipcMain.handle",
  "APP_SHELL_CHANNELS",
  "APP_DATA_CHANNELS",
  "PLAYBACK_CONTROL_CHANNELS",
  "PLAYBACK_OVERLAY_COMMAND_CHANNELS",
  "CLIPBOARD_CHANNELS"
]);
assertMissing(mainSource, [
  "function syncDockPresence",
  "function syncDockIcon",
  "function hideReaderAppForSelectionCapture"
]);
assertIncludes(appPresenceControllerSource, [
  "class AppPresenceController",
  "ensureDockVisible",
  "setDockIconFromSvg",
  "hideForSelectionCapture"
]);
const openReaderWindowIndex = mainSource.indexOf("function openReaderWindow(route: AppRoute): void");
const openReaderWindowPendingRouteIndex = mainSource.indexOf("pendingRoute = route;", openReaderWindowIndex);
const openReaderWindowDockIndex = mainSource.indexOf("appPresence.ensureDockVisible();", openReaderWindowIndex);
assert.equal(openReaderWindowIndex >= 0, true);
assert.equal(openReaderWindowPendingRouteIndex > openReaderWindowIndex, true);
assert.equal(openReaderWindowDockIndex > openReaderWindowIndex, true);
assert.equal(openReaderWindowDockIndex < openReaderWindowPendingRouteIndex, true);

assertIncludes(readingTargetAcquirerSource, [
  "class ReadingTargetAcquirer",
  "revealPreviousAppBeforeCapture",
  "readClipboardTextAfterSelectionCopy",
  "REVEAL_PREVIOUS_APP_DELAY_MS",
  "SELECTION_COPY_DELAY_MS",
  "SELECTION_COPY_POLL_TIMEOUT_MS",
  "SELECTION_COPY_POLL_INTERVAL_MS",
  "Date.now() - startedAt < SELECTION_COPY_POLL_TIMEOUT_MS",
  "Selected Text capture failed",
  "safeSelectionCaptureErrorMessage",
  "selection-copy-macos.node",
  "createRequire(import.meta.url)",
  "resolveNativeSelectionCopyAddonPath",
  "../../native/selection-copy-macos.node"
]);
assertMissing(mainSource, [
  "readClipboardTextAfterSelectionCopy",
  "REVEAL_PREVIOUS_APP_DELAY_MS",
  "SELECTION_COPY_DELAY_MS",
  "SELECTION_COPY_POLL_TIMEOUT_MS",
  "SELECTION_COPY_POLL_INTERVAL_MS",
  "Date.now() - startedAt < SELECTION_COPY_POLL_TIMEOUT_MS",
  "Selected Text capture failed",
  "safeSelectionCaptureErrorMessage",
  "selection-copy-macos.node"
]);
assertMissing(mainSource, [
  "x-apple.systempreferences",
  "openExternal",
  "openSelectedTextCapturePermissionSettings",
  "Privacy_Automation",
  "requireSelectedText",
  'target = {\n      text: "",\n      source: "selected_text"\n    };\n  }'
]);
assertIncludes(appContractsBundle, "PLAYBACK_FEEDBACK_SURFACES");
assertIncludes(appContractsSource, "FavoriteRecord");
assertIncludes(appContractsSource, "favoriteDetail");
assertMissing(appContractsSource, [
  "interface ReaderWindowBridge",
  "interface PlaybackFeedbackBridge",
  "interface PlaybackRendererBridge",
  "interface PlaybackOverlayBridge"
]);
assertIncludes(bridgeContractsSource, [
  "./bridge-contracts/app-data.js",
  "./bridge-contracts/app-shell.js",
  "./bridge-contracts/clipboard.js",
  "./bridge-contracts/playback-control.js",
  "./bridge-contracts/playback-overlay.js",
  "./bridge-contracts/renderer-audio.js",
  "ReaderWindowBridge",
  "ReaderWindowRuntimeBridge",
  "PlaybackFeedbackBridge",
  "PlaybackRendererBridge",
  "VoiceReaderBridge"
]);
assertMissing(playbackOverlayBridgeSource, "PLAYBACK_OVERLAY_CHANNELS");
assertMissing(bridgeContractsSource, [
  "APP_SHELL_CHANNELS",
  "APP_DATA_CHANNELS",
  "PLAYBACK_CONTROL_CHANNELS",
  "CLIPBOARD_CHANNELS",
  "RENDERER_AUDIO_CHANNELS",
  "PLAYBACK_OVERLAY_CHANNELS",
  "interface AppShellBridge",
  "interface AppDataBridge",
  "interface PlaybackControlBridge",
  "interface ClipboardBridge"
]);
assertMissing(preloadBundle, "../renderer/bridge");
for (const { name, source, expectedValues } of [
  {
    name: "preload runtime bridge",
    source: preloadSource,
    expectedValues: [
      "readerWindowBridge",
      "playbackRendererBridge",
      "playbackOverlayBridge",
      "createAppShellBridge",
      "createAppDataBridge",
      "createPlaybackControlBridge",
      "createClipboardBridge",
      "createPlaybackFeedbackBridge",
      "createPlaybackRendererBridge",
      "createPlaybackOverlayBridge",
      "createRuntimeBridge",
      "isPlaybackOverlayRuntime",
      'window.location.pathname.includes("/overlay/")',
      "isPlaybackRendererRuntime",
      'window.location.pathname.includes("/playback-renderer/")'
    ]
  },
  {
    name: "shared voice-reader bridge",
    source: voiceReaderBridgeSource,
    expectedValues: [
      "voiceReader: unknown",
      "getReaderWindowBridge",
      "getPlaybackRendererBridge",
      "getPlaybackOverlayBridge"
    ]
  },
  {
    name: "reader window",
    source: rendererSource,
    expectedValues: ["getReaderWindowBridge"]
  },
  {
    name: "playback audio",
    source: playbackAudioSource,
    expectedValues: ["PlaybackRendererBridge", "mountPlaybackAudio"]
  },
  {
    name: "playback renderer",
    source: playbackRendererSource,
    expectedValues: ["getPlaybackRendererBridge", "mountPlaybackAudio"]
  },
  { name: "playback overlay", source: overlaySource, expectedValues: ["getPlaybackOverlayBridge"] }
]) {
  for (const expected of expectedValues) {
    assert.equal(source.includes(expected), true, `${name} should include ${expected}`);
  }
}
const readerRuntimeBridge = evaluatePreloadBridge("/renderer/index.html");
const playbackRendererRuntimeBridge = evaluatePreloadBridge("/playback-renderer/index.html");
const overlayRuntimeBridge = evaluatePreloadBridge("/overlay/index.html");
assert.equal(typeof readerRuntimeBridge.getSettings, "function");
assert.equal(typeof readerRuntimeBridge.createFavoriteFromHistoryRecord, "function");
assert.equal(typeof readerRuntimeBridge.listFavorites, "function");
assert.equal(typeof readerRuntimeBridge.deleteFavoriteRecord, "function");
assert.equal(typeof readerRuntimeBridge.playFavoriteRecord, "function");
assert.equal(typeof readerRuntimeBridge.onPlaybackFinish, "function");
assert.equal(typeof readerRuntimeBridge.onPlaybackFail, "function");
assert.equal(typeof readerRuntimeBridge.onPlaybackStop, "function");
assert.equal(typeof readerRuntimeBridge.onPlaybackStart, "undefined");
assert.equal(typeof readerRuntimeBridge.onAudioChunk, "undefined");
assert.equal(typeof readerRuntimeBridge.onSegmentEnd, "undefined");
assert.equal(typeof readerRuntimeBridge.notifyPlaybackIdle, "undefined");
assert.equal(typeof readerRuntimeBridge.sendOverlayMetric, "undefined");
assert.equal(typeof readerRuntimeBridge.finishOverlayPlayback, "undefined");
assert.equal(typeof readerRuntimeBridge.onOverlayShow, "undefined");
assert.equal(typeof playbackRendererRuntimeBridge.onPlaybackStart, "function");
assert.equal(typeof playbackRendererRuntimeBridge.onAudioChunk, "function");
assert.equal(typeof playbackRendererRuntimeBridge.onSegmentEnd, "function");
assert.equal(typeof playbackRendererRuntimeBridge.onPlaybackFinish, "function");
assert.equal(typeof playbackRendererRuntimeBridge.onPlaybackFail, "function");
assert.equal(typeof playbackRendererRuntimeBridge.onPlaybackStop, "function");
assert.equal(typeof playbackRendererRuntimeBridge.notifyPlaybackIdle, "function");
assert.equal(typeof playbackRendererRuntimeBridge.sendOverlayMetric, "function");
assert.equal(typeof playbackRendererRuntimeBridge.finishOverlayPlayback, "function");
assert.equal(typeof playbackRendererRuntimeBridge.getSettings, "undefined");
assert.equal(typeof playbackRendererRuntimeBridge.updateSettings, "undefined");
assert.equal(typeof playbackRendererRuntimeBridge.listReadingHistory, "undefined");
assert.equal(typeof playbackRendererRuntimeBridge.listFavorites, "undefined");
assert.equal(typeof playbackRendererRuntimeBridge.playReadingTarget, "undefined");
assert.equal(typeof playbackRendererRuntimeBridge.onOverlayShow, "undefined");
assert.equal(typeof overlayRuntimeBridge.stopPlayback, "undefined");
assert.equal(typeof overlayRuntimeBridge.onOverlayShow, "function");
assert.equal(typeof overlayRuntimeBridge.getSettings, "undefined");
assert.equal(typeof overlayRuntimeBridge.onPlaybackStart, "undefined");
assert.equal(typeof overlayRuntimeBridge.onPlaybackFinish, "undefined");
for (const { name, source } of [
  { name: "reader window entrypoint", source: rendererSource },
  { name: "reader window app", source: readerWindowAppSource },
  { name: "playback audio", source: playbackAudioSource },
  { name: "playback renderer entrypoint", source: playbackRendererSource },
  { name: "playback overlay entrypoint", source: overlaySource },
  { name: "playback overlay app", source: playbackOverlayAppSource }
]) {
  assert.equal(source.includes("window.voiceReader"), false, `${name} should use a role bridge`);
}
for (const { name, source, expected } of [
  { name: "AppDataStore", source: appDataStoreSource, expected: "type PlaybackDataStore" },
  { name: "MiniMaxAccountService", source: minimaxAccountSource, expected: "MiniMaxAccountDataStore" },
  { name: "PlaybackService", source: playbackServiceSource, expected: "PlaybackRequestResolver" },
  { name: "PlaybackRequestResolver", source: playbackRequestResolverSource, expected: "PlaybackDataStore" },
  { name: "PlaybackCommandController", source: playbackCommandSource, expected: "PlaybackCommandDataStore" }
]) {
  assert.equal(source.includes(expected), true, `${name} should use a role-specific data interface`);
}
for (const expected of ["PlaybackSessionPort", "handleRendererIdle"]) {
  assert.equal(
    playbackCommandSource.includes(expected),
    true,
    `PlaybackCommandController should own playback session command lifecycle: ${expected}`
  );
}
for (const { name, source } of [
  { name: "MiniMaxAccountService", source: minimaxAccountSource },
  { name: "PlaybackService", source: playbackServiceSource },
  { name: "PlaybackRequestResolver", source: playbackRequestResolverSource },
  { name: "PlaybackCommandController", source: playbackCommandSource }
]) {
  assert.equal(source.includes("AppDataStore"), false, `${name} should not depend on the full data adapter`);
}
const bootstrapIndex = mainBundle.indexOf("async function bootstrap");
const whenReadyIndex = mainBundle.indexOf("await app.whenReady()");
assert.equal(bootstrapIndex >= 0 && whenReadyIndex > bootstrapIndex, true);
assert.equal(rendererHtml.includes("manifest.json"), false);
assert.equal(rendererHtml.includes("VoiceReader"), true);
assert.equal(rendererHtml.includes("media-src 'self' blob:"), true);
assert.equal(rendererBundle.includes("./assets/voicereader-icon.svg"), true);
assert.equal(playbackRendererHtml.includes("manifest.json"), false);
assertIncludes(playbackRendererHtml, [
  "VoiceReader Playback Renderer",
  "media-src 'self' blob:",
  '<script type="module" src="./playback-renderer.js"></script>'
]);
assertIncludes(playbackRendererBundle, [
  "getByteTimeDomainData",
  "requestAnimationFrame",
  "sendOverlayMetric",
  "finishOverlayPlayback"
]);
assertMissing(rendererBundle, [
  "getByteTimeDomainData",
  "sendOverlayMetric",
  "finishOverlayPlayback",
  RENDERER_AUDIO_CHANNELS.startSession,
  RENDERER_AUDIO_CHANNELS.audioChunk
]);
assertIncludes(appIconSource, 'rect width="1024" height="1024"');
assertMissing(appIconSource, 'x="64" y="64"');
assertIncludes(mainSource, [
  "nativeImage.createFromBuffer(createTrayIconPngBuffer()",
  "image.setTemplateImage(false)",
  "function encodePng"
]);
assertIncludes(templateTrayIconSource, "stroke-opacity");
assertMissing(templateTrayIconSource, ["linearGradient", "width=\"1024\""]);
assert.equal(builtTemplateTrayIcon, templateTrayIconSource);
assert.equal(rendererBundle.includes("\\u4E3B\\u9875"), true);
assert.equal(rendererBundle.includes("\\u5386\\u53F2\\u8BB0\\u5F55"), true);
assert.equal(rendererBundle.includes("\\u6536\\u85CF"), true);
assert.equal(rendererBundle.includes("\\u8BBE\\u7F6E"), true);
assert.equal(rendererBundle.includes("\\u4ECA\\u5929"), true);
assert.equal(rendererBundle.includes("\\u6628\\u5929"), true);
assert.equal(rendererBundle.includes("\\u672C\\u5468"), true);
assert.equal(rendererBundle.includes("\\u66F4\\u65E9"), true);
assert.equal(rendererBundle.includes("\\u590D\\u5236\\u5168\\u6587"), true);
assert.equal(rendererBundle.includes("\\u91CD\\u65B0\\u64AD\\u653E"), true);
for (const label of ["账户与连接", "快捷键", "朗读", "历史记录", "通用"]) {
  assert.equal(readerWindowAppSource.includes(label), true);
}
for (const label of [
  "MiniMax API Key",
  "验证连接",
  "刷新 Voice",
  "开始朗读快捷键可用",
  "0.5",
  "3",
  "自定义 Model ID",
  "保存 Model",
  "保存 Model 时不做可用性验证",
  "历史全文和收藏全文只保存在本机，不保存音频；当前朗读文本会发送给 MiniMax 生成语音。",
  "添加收藏",
  "已添加",
  "暂无收藏",
  "在历史记录详情中添加收藏后，会显示在这里。",
  "收藏于",
  "原朗读",
  "收藏重播中",
  "错误记录"
]) {
  assert.equal(readerWindowAppSource.includes(label), true);
}
assertMissing(readerWindowAppSource, ["清空收藏", "收藏数量"]);
assert.equal(readerWindowAppSource.includes("function Home"), true);
assert.equal(readerWindowAppSource.includes("getSetupRecoveryAction"), true);
assert.equal(readerWindowAppSource.includes('role="group"'), true);
assert.equal(readerWindowAppSource.includes("aria-pressed"), true);
assertIncludes(readerWindowAppSource, ["SETTINGS_GROUP_IDS", "aria-labelledby={SETTINGS_GROUP_IDS[group]}"]);
for (const homeClass of [
  ".home-dashboard",
  ".command-panel",
  ".setup-action",
  ".home-status-line",
  ".shortcut-status",
  ".home-options"
]) {
  assert.equal(rendererCssSource.includes(homeClass), true);
}
assertMissing(rendererCssSource, [
  ".health-strip",
  ".shortcut-card",
  ".shortcut-hint",
  ".status-dot",
  ".voice-panel"
]);
assertIncludes(rendererCssSource, ["--window-drag-height", "-webkit-app-region: drag"]);
assert.equal(rendererCssSource.includes("prefers-color-scheme: dark"), true);
assert.equal(rendererCssSource.includes(".brand-mark"), true);
assert.equal(rendererCssSource.includes("background: transparent"), true);
assertIncludes(rendererCssSource, [
  "container-type: inline-size",
  "grid-template-columns: 176px minmax(0, 1fr)",
  ".settings-section + .settings-section",
  "@container (max-width: 620px)"
]);
assertMissing(rendererCssSource, ["grid-template-columns: repeat(2"]);
assert.equal(rendererCssSource.includes(".shortcut-recorder"), true);
assert.equal(rendererCssSource.includes(".range-control"), true);
assertMissing(overlayHtml, "manifest.json");
assertIncludes(overlayHtml, ["VoiceReader Overlay", '<link rel="stylesheet" href="./overlay.css"']);
assertIncludes(overlayBundle, ["onOverlayShow", "onOverlayMetric", "scaleY"]);
assertMissing(overlayBundle, ["stopPlayback", "×", "\\xD7", "播放"]);
assertMissing(playbackOverlayAppSource, "viewBox");
assertIncludes(playbackOverlayAppSource, ["progress: number", "Math.max(current.progress", "scaleX"]);
assertIncludes(overlayCss, ["transparent", "--pill: #000", "--pill-border", "border: 1px solid var(--pill-border)", "prefers-reduced-motion", "width: 120px", "height: 32px", "gap: 2.65px", "width: 2.6px", ".waveform-aura", ".waveform-bars", ".overlay-root.is-playing .playback-progress", ".playback-progress span", ".overlay-root.is-preparing .waveform"]);
assertMissing(overlayCss, [".close-button", "grid-template-columns:", "--pill: #000;\n    --shadow", "button {", "box-shadow: inset 0 1px 0"]);
assertIncludes(playbackOverlayControllerSource, ["type: \"panel\"", "width: 132", "height: 44", 'const overlayWindowLevel = "screen-saver"', "getDisplayNearestPoint(screen.getCursorScreenPoint())", "skipTransformProcessType"]);
assertIncludes(playbackOverlayControllerSource, "attachOverlayToFullscreenSpaces(window);\n    window.moveTop()");
assertIncludes(playbackOverlayControllerSource, "refreshOverlayWorkspaceAttachment(window)");
assertIncludes(playbackOverlayControllerSource, "metric.progress");
assertOverlayPassiveCoverage();
assertIncludes(playbackAudioSource, ["segmentWeights", "getSessionProgress", "createVoiceLevels", "smoothingTimeConstant", "levels,", "progress:"]);
assertMissing(playbackAudioSource, "const progress = audioProgress");
assertIncludes(playbackOverlayAppSource, ["const BAR_COUNT = 13", "smoothMotionValue", "normalizeWaveformLevels"]);
assertIncludes(appContractsSource, ["levels?: number[]", "progress: number"]);
assert.equal(packageScript.includes("dereference: true"), false);
assert.equal(packageScript.includes("verbatimSymlinks: true"), true);
assert.equal(packageScript.includes("default_app.asar"), true);
assert.equal(packageScript.includes("assets/voicereader-icon.svg"), true);
assert.equal(packageScript.includes("createAppIconPng"), false);
assert.equal(packageScript.includes("/usr/bin/qlmanage"), true);
assert.equal(packageScript.includes("NSAppleEventsUsageDescription"), false);
assert.equal(packageScript.includes('removePlistEntry(plist, "LSUIElement")'), true);
assert.equal(packageScript.includes("/usr/bin/codesign"), true);
assert.equal(packageScript.includes("--deep"), true);
assert.equal(packageScript.includes("--requirements"), true);
assert.equal(packageScript.includes("appBundleIdentifier = \"com.local.voicereader\""), true);
assert.equal(packageScript.includes("=designated => identifier"), true);
assert.equal(packageScript.includes("/usr/bin/hdiutil"), true);
assert.equal(appVerificationScript.includes("/usr/bin/lipo"), true);
assert.equal(appVerificationScript.includes("/usr/bin/codesign"), true);
assert.equal(appVerificationScript.includes("--verify"), true);

const playbackRendererReady = deferred();
const pendingPlaybackRenderer = createPlaybackWindowForTest({
  loadFile: () => playbackRendererReady.promise
});
let playbackOutputReady = false;
const creatingPlaybackOutput = createElectronPlaybackOutputScenario({
  playbackRenderer: pendingPlaybackRenderer
}).then((scenario) => {
  playbackOutputReady = true;
  return scenario;
});
await Promise.resolve();
assert.deepEqual(pendingPlaybackRenderer.loadedFiles, ["/app/playback-renderer/index.html"]);
assert.equal(playbackOutputReady, false);
playbackRendererReady.resolve();
const readyPlaybackScenario = await creatingPlaybackOutput;
assert.equal(playbackOutputReady, true);
readyPlaybackScenario.output.destroy();

const completeDeliveryScenario = await createElectronPlaybackOutputScenario();
const completeSession = createOverlayPlaybackSessionForTest(101);
completeDeliveryScenario.output.startSession(completeSession);
completeDeliveryScenario.output.audioChunk(101, new Uint8Array([1, 2, 3]));
completeDeliveryScenario.output.endSegment(101);
completeDeliveryScenario.output.finishSession(101);
assert.deepEqual(completeDeliveryScenario.playbackRenderer.messages, [
  [RENDERER_AUDIO_CHANNELS.startSession, completeSession],
  [RENDERER_AUDIO_CHANNELS.audioChunk, { sessionId: 101, bytes: new Uint8Array([1, 2, 3]) }],
  [RENDERER_AUDIO_CHANNELS.endSegment, { sessionId: 101 }],
  [RENDERER_AUDIO_CHANNELS.finishSession, { sessionId: 101 }]
]);
assert.deepEqual(completeDeliveryScenario.overlayActions, ["show:101"]);

const readerWindow = createPlaybackWindowForTest();
const terminalFeedbackScenario = await createElectronPlaybackOutputScenario({ readerWindow });
terminalFeedbackScenario.output.startSession(createHistoryReplaySessionForTest(201));
terminalFeedbackScenario.output.audioChunk(201, new Uint8Array([9]));
terminalFeedbackScenario.output.endSegment(201);
terminalFeedbackScenario.output.finishSession(201);
terminalFeedbackScenario.output.startSession(createFavoriteReplaySessionForTest(202));
terminalFeedbackScenario.output.failSession(202);
terminalFeedbackScenario.output.startSession(createOverlayPlaybackSessionForTest(203));
terminalFeedbackScenario.output.stopSession(203);
assert.deepEqual(readerWindow.messages, [
  [RENDERER_AUDIO_CHANNELS.finishSession, { sessionId: 201 }],
  [RENDERER_AUDIO_CHANNELS.failSession, { sessionId: 202 }]
]);
assert.deepEqual(
  terminalFeedbackScenario.playbackRenderer.messages.map(([channel]) => channel),
  [
    RENDERER_AUDIO_CHANNELS.startSession,
    RENDERER_AUDIO_CHANNELS.audioChunk,
    RENDERER_AUDIO_CHANNELS.endSegment,
    RENDERER_AUDIO_CHANNELS.finishSession,
    RENDERER_AUDIO_CHANNELS.startSession,
    RENDERER_AUDIO_CHANNELS.failSession,
    RENDERER_AUDIO_CHANNELS.startSession,
    RENDERER_AUDIO_CHANNELS.stopSession
  ]
);
assert.deepEqual(terminalFeedbackScenario.overlayActions, ["show:203", "stop:203"]);

const overlayOwnershipScenario = await createElectronPlaybackOutputScenario();
overlayOwnershipScenario.output.startSession(createOverlayPlaybackSessionForTest(301));
overlayOwnershipScenario.output.handleRendererIdle(999);
overlayOwnershipScenario.output.startSession(createOverlayPlaybackSessionForTest(302));
overlayOwnershipScenario.output.stopSession(301);
overlayOwnershipScenario.output.handleRendererIdle(302);
overlayOwnershipScenario.output.stopSession(302);
assert.deepEqual(overlayOwnershipScenario.overlayActions, ["show:301", "show:302"]);

completeDeliveryScenario.output.destroy();
assert.throws(
  () => completeDeliveryScenario.output.startSession(createOverlayPlaybackSessionForTest(401)),
  /Playback Renderer is unavailable/
);
terminalFeedbackScenario.output.destroy();
overlayOwnershipScenario.output.destroy();

console.log("Dist contract tests passed.");

function run(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      stdio: "inherit"
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with code ${code}`));
    });
  });
}

function assertFileExists(path) {
  assert.equal(existsSync(new URL(path, import.meta.url)), true);
}

function assertFileMissing(path) {
  assert.equal(existsSync(new URL(path, import.meta.url)), false);
}

function assertIncludes(source, expected) {
  for (const value of [expected].flat()) {
    assert.equal(source.includes(value), true, `source should include ${value}`);
  }
}

function assertMissing(source, expected) {
  for (const value of [expected].flat()) {
    assert.equal(source.includes(value), false, `source should not include ${value}`);
  }
}

function assertOverlayPassiveCoverage() {
  assertIncludes(playbackOverlayAppSource, [
    'status: "preparing"',
    'status: "playing"',
    "notifyOverlayReady",
    'aria-label="朗读进度"',
    'className="sr-only"'
  ]);
  assertMissing(playbackOverlayAppSource, ["DRAG_HOLD_MS", "setPointerCapture", "moveOverlayBy"]);
  assertMissing(overlayCss, ["cursor: grab", ".is-dragging", ":hover"]);
  assertIncludes(playbackOverlayControllerSource, [
    "setIgnoreMouseEvents(true)",
    "pendingOutcome",
    "activeSessionId",
    "markReady",
    "anchorPosition"
  ]);
  assertMissing(playbackOverlayControllerSource, ["moveBy(delta", "manualPosition", "constrainOverlayPosition"]);
  assertIncludes(playbackOverlayBridgeSource, ["notifyOverlayReady", 'ready: "overlay:ready"']);
  assertMissing(playbackOverlayBridgeSource, ["OverlayDragDelta", "moveOverlayBy"]);
}

function evaluatePreloadBridge(pathname) {
  let exposed;
  const sandbox = {
    window: { location: { pathname } },
    require(specifier) {
      if (specifier !== "electron") throw new Error(`Unexpected preload require: ${specifier}`);
      return {
        contextBridge: {
          exposeInMainWorld(_name, value) {
            exposed = value;
          }
        },
        ipcRenderer: {
          invoke: async () => undefined,
          on() {},
          off() {}
        }
      };
    },
    module: { exports: {} },
    exports: {}
  };
  vm.runInNewContext(preloadBundle, sandbox);
  return exposed;
}

function createOverlayPlaybackSessionForTest(sessionId) {
  return createPlaybackSessionForTest(sessionId, PLAYBACK_FEEDBACK_SURFACES.playbackOverlay);
}

function createHistoryReplaySessionForTest(sessionId) {
  return createPlaybackSessionForTest(sessionId, PLAYBACK_FEEDBACK_SURFACES.historyDetail);
}

function createFavoriteReplaySessionForTest(sessionId) {
  return createPlaybackSessionForTest(sessionId, PLAYBACK_FEEDBACK_SURFACES.favoriteDetail);
}

function createPlaybackSessionForTest(sessionId, feedbackSurface, segmentWeights = [1]) {
  return {
    sessionId,
    speechRate: 1,
    feedbackSurface,
    segmentWeights
  };
}

function createOverlayControllerForTest(actions) {
  return {
    dismiss() {
      actions.push("dismiss");
    },
    show(sessionId) {
      actions.push(`show:${sessionId}`);
    },
    fail(sessionId) {
      actions.push(`fail:${sessionId}`);
    },
    stop(sessionId) {
      actions.push(`stop:${sessionId}`);
    }
  };
}

async function createElectronPlaybackOutputScenario({
  playbackRenderer = createPlaybackWindowForTest(),
  readerWindow
} = {}) {
  const overlayActions = [];
  const output = await ElectronPlaybackOutput.create({
    createPlaybackRenderer: () => playbackRenderer.window,
    getReaderWindow: () => readerWindow?.window,
    overlay: createOverlayControllerForTest(overlayActions),
    playbackRendererEntry: "/app/playback-renderer/index.html"
  });
  return { output, overlayActions, playbackRenderer, readerWindow };
}

function createPlaybackWindowForTest({ loadFile = async () => undefined } = {}) {
  const loadedFiles = [];
  const messages = [];
  let destroyed = false;
  let destroyCount = 0;
  const window = {
    destroy() {
      destroyCount += 1;
      destroyed = true;
    },
    isDestroyed: () => destroyed,
    async loadFile(path) {
      loadedFiles.push(path);
      await loadFile(path);
    },
    webContents: {
      send(channel, payload) {
        messages.push([channel, payload]);
      }
    }
  };
  return {
    get destroyCount() {
      return destroyCount;
    },
    get destroyed() {
      return destroyed;
    },
    loadedFiles,
    messages,
    window
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
