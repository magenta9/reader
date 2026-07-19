import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const shouldBuild = !process.argv.includes("--no-build");
if (shouldBuild) await run("scripts/build.mjs", []);

const { ElectronPlaybackOutput } = await import("../dist/main/playback/electron-playback-output.js");
const { PlaybackService } = await import("../dist/main/playback/playback-service.js");
const { PlaybackCommandController } = await import(
  "../dist/main/playback/playback-command-controller.js"
);
const { createPlaybackControlImplementation } = await import(
  "../dist/main/app-bridge-handlers/playback-control.js"
);
const { createPlaybackRendererImplementation } = await import(
  "../dist/main/app-bridge-handlers/playback-renderer.js"
);
const { registerRoleHandlers } = await import("../dist/shared/role-bridge-registry.js");
const { playbackControlRoleContract, playbackRendererRoleContract } = await import(
  "../dist/shared/role-bridge-contracts.js"
);
const { streamMiniMaxSpeechAudio } = await import("../dist/shared/minimax.js");
const { PLAYBACK_FEEDBACK_SURFACES } = await import("../dist/shared/app-contracts.js");
const {
  APP_DATA_CHANNELS,
  APP_SHELL_CHANNELS,
  PLAYBACK_FEEDBACK_CHANNELS,
  PLAYBACK_CONTROL_CHANNELS,
  PLAYBACK_OVERLAY_COMMAND_CHANNELS,
  PLAYBACK_OVERLAY_EVENT_CHANNELS,
  RENDERER_AUDIO_CHANNELS
} = await import("../dist/shared/bridge-contracts.js");

for (const path of [
  "../dist/main/main.js",
  "../dist/main/app-role-bridges.js",
  "../dist/main/app-presence-controller.js",
  "../dist/main/playback/playback-request-resolver.js",
  "../dist/main/reading-target/reading-target-acquirer.js",
  "../dist/shared/app-contracts.js",
  "../dist/shared/bridge-contracts.js",
  "../dist/preload/reader-window.cjs",
  "../dist/preload/playback-renderer.cjs",
  "../dist/preload/playback-overlay.cjs",
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
assertFileMissing("../dist/preload/preload.cjs");
assertFileMissing("../dist/preload/bridge-adapters");
assertFileMissing("../dist/main/app-bridge-handlers.js");
if (process.platform === "darwin") {
  assertFileExists("../dist/native/selection-copy-macos.node");
}

const mainBundle = await readFile(new URL("../dist/main/main.js", import.meta.url), "utf8");
const appContractsBundle = await readFile(new URL("../dist/shared/app-contracts.js", import.meta.url), "utf8");
const readerPreloadBundle = await readFile(
  new URL("../dist/preload/reader-window.cjs", import.meta.url),
  "utf8"
);
const playbackRendererPreloadBundle = await readFile(
  new URL("../dist/preload/playback-renderer.cjs", import.meta.url),
  "utf8"
);
const playbackOverlayPreloadBundle = await readFile(
  new URL("../dist/preload/playback-overlay.cjs", import.meta.url),
  "utf8"
);
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
const appDataStoreSource = await readFile(new URL("../src/main/data/app-data-store.ts", import.meta.url), "utf8");
const appDataSchemaSource = await readFile(new URL("../src/main/data/app-data-schema.ts", import.meta.url), "utf8");
const packagedSmokeRuntimeSource = await readFile(
  new URL("../src/main/packaged-smoke-runtime.ts", import.meta.url),
  "utf8"
);
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
  "../preload/reader-window.cjs",
  "../preload/playback-renderer.cjs",
  "../preload/playback-overlay.cjs",
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
  PLAYBACK_OVERLAY_COMMAND_CHANNELS.ready,
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
  "registerAppRoleBridges",
  'label: "停止朗读"',
  "() => readingTargetAcquirer.acquire()"
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
for (const preloadBundle of [
  readerPreloadBundle,
  playbackRendererPreloadBundle,
  playbackOverlayPreloadBundle
]) {
  assertMissing(preloadBundle, ["../renderer/bridge", "window.location", "pathname"]);
}
const readerRuntimeBridge = evaluatePreloadBridge(readerPreloadBundle);
const playbackRendererRuntimeBridge = evaluatePreloadBridge(playbackRendererPreloadBundle);
const overlayRuntimeBridge = evaluatePreloadBridge(playbackOverlayPreloadBundle);
assert.equal(typeof readerRuntimeBridge.getSettings, "function");
assert.equal(typeof readerRuntimeBridge.setSpeechRate, "function");
assert.equal(typeof readerRuntimeBridge.setModel, "function");
assert.equal(typeof readerRuntimeBridge.updateSettings, "undefined");
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
assert.equal(typeof readerRuntimeBridge.reportAudioOutcome, "undefined");
assert.equal(typeof readerRuntimeBridge.sendOverlayMetric, "undefined");
assert.equal(typeof readerRuntimeBridge.finishOverlayPlayback, "undefined");
assert.equal(typeof readerRuntimeBridge.onOverlayShow, "undefined");
assert.equal(typeof playbackRendererRuntimeBridge.onPlaybackStart, "function");
assert.equal(typeof playbackRendererRuntimeBridge.onAudioChunk, "function");
assert.equal(typeof playbackRendererRuntimeBridge.onSegmentEnd, "function");
assert.equal(typeof playbackRendererRuntimeBridge.onAudioInputEnd, "function");
assert.equal(typeof playbackRendererRuntimeBridge.onPlaybackFinish, "undefined");
assert.equal(typeof playbackRendererRuntimeBridge.onPlaybackFail, "function");
assert.equal(typeof playbackRendererRuntimeBridge.onPlaybackStop, "function");
assert.equal(typeof playbackRendererRuntimeBridge.notifyPlaybackIdle, "undefined");
assert.equal(typeof playbackRendererRuntimeBridge.reportAudioOutcome, "function");
assert.equal(typeof playbackRendererRuntimeBridge.sendOverlayMetric, "function");
assert.equal(typeof playbackRendererRuntimeBridge.finishOverlayPlayback, "undefined");
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

const preferenceInvocations = [];
const builtPreferenceBridge = evaluatePreloadBridge(readerPreloadBundle, async (channel, ...args) => {
  preferenceInvocations.push([channel, ...args]);
  return { speechRate: args[0], model: args[0] };
});
await builtPreferenceBridge.setSpeechRate(1.6);
await builtPreferenceBridge.setModel("speech-2.8-hd");
assert.deepEqual(preferenceInvocations, [
  [APP_DATA_CHANNELS.setSpeechRate, 1.6],
  [APP_DATA_CHANNELS.setModel, "speech-2.8-hd"]
]);
const routeInvocations = [];
const builtRouteRuntime = evaluatePreloadRuntime(readerPreloadBundle, async (channel, ...args) => {
  routeInvocations.push([channel, ...args]);
  if (channel === APP_SHELL_CHANNELS.getBootstrapState) {
    return { hasCompletedOnboarding: true, route: { route: "home", revision: 4 } };
  }
  if (channel === APP_SHELL_CHANNELS.setRoute) {
    return { route: args[0], revision: 5 };
  }
});
const builtRouteSnapshots = [];
const unsubscribeBuiltRoute = builtRouteRuntime.bridge.onNavigate((snapshot) => {
  builtRouteSnapshots.push({ route: snapshot.route, revision: snapshot.revision });
});
builtRouteRuntime.emit(APP_SHELL_CHANNELS.navigate, { route: "history", revision: 5 });
unsubscribeBuiltRoute();
builtRouteRuntime.emit(APP_SHELL_CHANNELS.navigate, { route: "settings", revision: 6 });
assert.deepEqual(builtRouteSnapshots, [{ route: "history", revision: 5 }]);
assert.deepEqual(await builtRouteRuntime.bridge.getBootstrapState(), {
  hasCompletedOnboarding: true,
  route: { route: "home", revision: 4 }
});
assert.deepEqual(await builtRouteRuntime.bridge.setRoute("favorites"), {
  route: "favorites",
  revision: 5
});
assert.deepEqual(routeInvocations, [
  [APP_SHELL_CHANNELS.getBootstrapState],
  [APP_SHELL_CHANNELS.setRoute, "favorites"]
]);
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
for (const { name, source } of [
  { name: "MiniMaxAccountService", source: minimaxAccountSource },
  { name: "PlaybackService", source: playbackServiceSource },
  { name: "PlaybackRequestResolver", source: playbackRequestResolverSource },
  { name: "PlaybackCommandController", source: playbackCommandSource }
]) {
  assert.equal(source.includes("AppDataStore"), false, `${name} should not depend on the full data adapter`);
}
assertIncludes(mainSource, "AppDataStore.open(databasePath)");
assertMissing(appDataStoreSource, ["private migrate()", "CREATE TABLE IF NOT EXISTS settings"]);
assertIncludes(appDataSchemaSource, ["CURRENT_APP_DATA_SCHEMA_VERSION = 1", "BEGIN IMMEDIATE", "PRAGMA user_version"]);
assertIncludes(packagedSmokeRuntimeSource, ["assertCurrentAppDataSchema", "schemaVersion"]);
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
  "reportAudioOutcome"
]);
assertMissing(rendererBundle, ["getByteTimeDomainData", "sendOverlayMetric"]);
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
  "错误记录"
]) {
  assert.equal(readerWindowAppSource.includes(label), true);
}
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
  "grid-template-columns: 146px minmax(0, 1fr)",
  "min-height: 36px",
  "--control-border",
  ".settings-section + .settings-section",
  "@container (max-width: 620px)"
]);
assertIncludes(rendererCssSource, [
  ".history-storage-summary",
  "grid-template-columns: 68px minmax(0, 1fr) auto",
  ".history-record + .history-record"
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
completeDeliveryScenario.output.finishGeneration(101);
completeDeliveryScenario.output.completeSession(101);
assert.deepEqual(completeDeliveryScenario.playbackRenderer.messages, [
  [RENDERER_AUDIO_CHANNELS.startSession, completeSession],
  [RENDERER_AUDIO_CHANNELS.audioChunk, { sessionId: 101, bytes: new Uint8Array([1, 2, 3]) }],
  [RENDERER_AUDIO_CHANNELS.endSegment, { sessionId: 101 }],
  [RENDERER_AUDIO_CHANNELS.endSessionAudio, { sessionId: 101 }]
]);
assert.deepEqual(completeDeliveryScenario.overlayActions, ["show:101", "finish:101"]);

const readerWindow = createPlaybackWindowForTest();
const terminalFeedbackScenario = await createElectronPlaybackOutputScenario({ readerWindow });
terminalFeedbackScenario.output.startSession(createHistoryReplaySessionForTest(201));
terminalFeedbackScenario.output.audioChunk(201, new Uint8Array([9]));
terminalFeedbackScenario.output.endSegment(201);
terminalFeedbackScenario.output.finishGeneration(201);
assert.deepEqual(readerWindow.messages, []);
terminalFeedbackScenario.output.completeSession(201);
terminalFeedbackScenario.output.startSession(createFavoriteReplaySessionForTest(202));
terminalFeedbackScenario.output.failSession(202);
terminalFeedbackScenario.output.startSession(createOverlayPlaybackSessionForTest(203));
terminalFeedbackScenario.output.stopSession(203);
assert.deepEqual(readerWindow.messages, [
  [PLAYBACK_FEEDBACK_CHANNELS.finishSession, { sessionId: 201 }],
  [PLAYBACK_FEEDBACK_CHANNELS.failSession, { sessionId: 202 }]
]);
assert.deepEqual(
  terminalFeedbackScenario.playbackRenderer.messages.map(([channel]) => channel),
  [
    RENDERER_AUDIO_CHANNELS.startSession,
    RENDERER_AUDIO_CHANNELS.audioChunk,
    RENDERER_AUDIO_CHANNELS.endSegment,
    RENDERER_AUDIO_CHANNELS.endSessionAudio,
    RENDERER_AUDIO_CHANNELS.startSession,
    RENDERER_AUDIO_CHANNELS.failSession,
    RENDERER_AUDIO_CHANNELS.startSession,
    RENDERER_AUDIO_CHANNELS.stopSession
  ]
);
assert.deepEqual(terminalFeedbackScenario.overlayActions, ["show:203", "stop:203"]);

const overlayOwnershipScenario = await createElectronPlaybackOutputScenario();
overlayOwnershipScenario.output.startSession(createOverlayPlaybackSessionForTest(301));
overlayOwnershipScenario.output.startSession(createOverlayPlaybackSessionForTest(302));
overlayOwnershipScenario.output.stopSession(301);
overlayOwnershipScenario.output.stopSession(302);
assert.deepEqual(overlayOwnershipScenario.overlayActions, ["show:301", "show:302", "stop:302"]);

const builtLifecycleScenario = await createBuiltPlaybackLifecycleScenario();
const builtHistoryResult = await builtLifecycleScenario.invoke(
  PLAYBACK_CONTROL_CHANNELS.playHistoryRecord,
  "built-history"
);
await builtLifecycleScenario.playback.waitForCurrentGeneration();
assert.equal(builtLifecycleScenario.shortcuts.has("Escape"), true);
await builtLifecycleScenario.invoke(PLAYBACK_CONTROL_CHANNELS.rendererOutcome, {
  sessionId: builtHistoryResult.sessionId,
  status: "completed"
});
assert.equal(builtLifecycleScenario.shortcuts.has("Escape"), false);
assert.deepEqual(builtLifecycleScenario.readerWindow.messages, [
  [PLAYBACK_FEEDBACK_CHANNELS.finishSession, { sessionId: builtHistoryResult.sessionId }]
]);
builtLifecycleScenario.output.destroy();

const builtFailureScenario = await createBuiltPlaybackLifecycleScenario({
  streamAudio: async () => {
    throw new Error("MiniMax TTS failed with HTTP 500");
  }
});
const failedHistoryResult = await builtFailureScenario.invoke(
  PLAYBACK_CONTROL_CHANNELS.playHistoryRecord,
  "built-failure"
);
await builtFailureScenario.playback.waitForCurrentGeneration();
assert.equal(builtFailureScenario.shortcuts.has("Escape"), false);
assert.deepEqual(builtFailureScenario.readerWindow.messages, [
  [PLAYBACK_FEEDBACK_CHANNELS.failSession, { sessionId: failedHistoryResult.sessionId }]
]);
builtFailureScenario.output.destroy();

const builtSynchronousTerminalScenario = await createBuiltPlaybackLifecycleScenario({
  missingVoice: true
});
const synchronousTerminalResult = await builtSynchronousTerminalScenario.invoke(
  PLAYBACK_CONTROL_CHANNELS.playHistoryRecord,
  "built-missing-voice"
);
assert.equal(synchronousTerminalResult.started, true);
assert.equal(synchronousTerminalResult.stopShortcutAvailable, false);
assert.equal(builtSynchronousTerminalScenario.shortcuts.has("Escape"), false);
assert.deepEqual(builtSynchronousTerminalScenario.readerWindow.messages, [
  [PLAYBACK_FEEDBACK_CHANNELS.failSession, { sessionId: synchronousTerminalResult.sessionId }]
]);
builtSynchronousTerminalScenario.output.destroy();

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () =>
    new Response('data: {"data":{"audio":"0102","status":2}}\n', {
      headers: { "content-type": "text/event-stream" }
    });
  const builtProductionSuccess = await createBuiltPlaybackLifecycleScenario({
    streamAudio: streamMiniMaxSpeechAudio
  });
  const productionSuccessResult = await builtProductionSuccess.invoke(
    PLAYBACK_CONTROL_CHANNELS.playHistoryRecord,
    "built-production-success"
  );
  await builtProductionSuccess.playback.waitForCurrentGeneration();
  assert.deepEqual(
    builtProductionSuccess.playbackRenderer.messages.find(
      ([channel]) => channel === RENDERER_AUDIO_CHANNELS.audioChunk
    ),
    [
      RENDERER_AUDIO_CHANNELS.audioChunk,
      { sessionId: productionSuccessResult.sessionId, bytes: new Uint8Array([1, 2]) }
    ]
  );
  await builtProductionSuccess.invoke(PLAYBACK_CONTROL_CHANNELS.rendererOutcome, {
    sessionId: productionSuccessResult.sessionId,
    status: "completed"
  });
  assert.deepEqual(builtProductionSuccess.readerWindow.messages, [
    [PLAYBACK_FEEDBACK_CHANNELS.finishSession, { sessionId: productionSuccessResult.sessionId }]
  ]);
  builtProductionSuccess.output.destroy();

  for (const { body, expectedMessage } of [
    { body: "", expectedMessage: "MiniMax TTS returned no audio." },
    {
      body: 'data: {"data":{"audio":"xyz","status":2}}\n',
      expectedMessage: "MiniMax TTS returned malformed audio hex."
    }
  ]) {
    globalThis.fetch = async () =>
      new Response(body, { headers: { "content-type": "text/event-stream" } });
    const builtProductionFailure = await createBuiltPlaybackLifecycleScenario({
      streamAudio: streamMiniMaxSpeechAudio
    });
    const productionFailureResult = await builtProductionFailure.invoke(
      PLAYBACK_CONTROL_CHANNELS.playHistoryRecord,
      "built-production-failure"
    );
    await builtProductionFailure.playback.waitForCurrentGeneration();
    assert.equal(builtProductionFailure.shortcuts.has("Escape"), false);
    assert.deepEqual(builtProductionFailure.readerWindow.messages, [
      [PLAYBACK_FEEDBACK_CHANNELS.failSession, { sessionId: productionFailureResult.sessionId }]
    ]);
    assert.deepEqual(builtProductionFailure.errors, [
      { category: "minimax_runtime", message: expectedMessage }
    ]);
    builtProductionFailure.output.destroy();
  }
} finally {
  globalThis.fetch = originalFetch;
}

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
}

function evaluatePreloadBridge(preloadBundle, invoke = async () => undefined) {
  return evaluatePreloadRuntime(preloadBundle, invoke).bridge;
}

function evaluatePreloadRuntime(preloadBundle, invoke = async () => undefined) {
  let exposed;
  const listeners = new Map();
  const sandbox = {
    require(specifier) {
      if (specifier !== "electron") throw new Error(`Unexpected preload require: ${specifier}`);
      return {
        contextBridge: {
          exposeInMainWorld(_name, value) {
            exposed = value;
          }
        },
        ipcRenderer: {
          invoke,
          on(channel, listener) {
            const channelListeners = listeners.get(channel) ?? new Set();
            channelListeners.add(listener);
            listeners.set(channel, channelListeners);
          },
          off(channel, listener) {
            listeners.get(channel)?.delete(listener);
          }
        }
      };
    },
    module: { exports: {} },
    exports: {}
  };
  vm.runInNewContext(preloadBundle, sandbox);
  return {
    bridge: exposed,
    emit(channel, ...args) {
      for (const listener of listeners.get(channel) ?? []) listener({}, ...args);
    }
  };
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
    finish(sessionId) {
      actions.push(`finish:${sessionId}`);
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

async function createBuiltPlaybackLifecycleScenario({
  streamAudio = async (request) => request.onAudioChunk(new Uint8Array([1, 2])),
  missingVoice = false
} = {}) {
  const readerWindow = createPlaybackWindowForTest();
  const outputScenario = await createElectronPlaybackOutputScenario({ readerWindow });
  const errors = [];
  const store = {
    addErrorLog(error) {
      errors.push(error);
    },
    getSettings() {
      return { activationShortcut: "Command+J" };
    },
    updateSettings(settings) {
      return { activationShortcut: "Command+J", ...settings };
    }
  };
  const createPlan = (feedbackSurface) => ({
    ok: true,
    plan: {
      audioSession: { speechRate: 1, feedbackSurface, segmentWeights: [1] },
      segments: missingVoice
        ? [{ missingVoiceLanguage: "zh" }]
        : [
            {
              stream: async (stream, request) =>
                stream({
                  ...request,
                  apiKey: "built-key",
                  model: "speech-2.8-turbo",
                  voiceId: "built-voice",
                  text: "built playback lifecycle"
                })
            }
          ]
    }
  });
  const resolver = {
    resolveReadingTarget: () => createPlan(PLAYBACK_FEEDBACK_SURFACES.playbackOverlay),
    resolveHistoryReplay: () => createPlan(PLAYBACK_FEEDBACK_SURFACES.historyDetail),
    resolveFavoriteReplay: () => createPlan(PLAYBACK_FEEDBACK_SURFACES.favoriteDetail)
  };
  const playback = new PlaybackService(store, outputScenario.output, streamAudio, resolver);
  const shortcuts = new Map();
  const commands = new PlaybackCommandController(
    store,
    playback,
    {
      register(shortcut, callback) {
        shortcuts.set(shortcut, callback);
        return true;
      },
      unregister(shortcut) {
        shortcuts.delete(shortcut);
      }
    },
    async () => ({ text: "built playback lifecycle", source: "selected_text" })
  );
  const handlers = new Map();
  const transport = {
    handle(channel, handler) {
      handlers.set(channel, handler);
    }
  };
  registerRoleHandlers(
    playbackControlRoleContract,
    createPlaybackControlImplementation({ playbackCommands: commands }),
    transport
  );
  registerRoleHandlers(
    playbackRendererRoleContract,
    createPlaybackRendererImplementation({
      playbackCommands: commands,
      overlayController: { sendMetric() {} }
    }),
    transport
  );
  return {
    ...outputScenario,
    errors,
    playback,
    shortcuts,
    async invoke(channel, ...args) {
      const handler = handlers.get(channel);
      assert.equal(typeof handler, "function", `missing built IPC handler for ${channel}`);
      return handler({ senderId: 1 }, args);
    }
  };
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
