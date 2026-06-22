import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const shouldBuild = !process.argv.includes("--no-build");
if (shouldBuild) await run("scripts/build.mjs", []);

const { ElectronAudioSink } = await import("../dist/main/playback/electron-audio-sink.js");
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
    expectedValues: ["RENDERER_AUDIO_CHANNELS", "interface RendererAudioBridge"]
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
      "createRendererAudioBridge",
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
const overlayHtml = await readFile(new URL("../dist/overlay/index.html", import.meta.url), "utf8");
const overlayBundle = await readFile(new URL("../dist/overlay/overlay.js", import.meta.url), "utf8");
const overlayCss = await readFile(new URL("../dist/overlay/overlay.css", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../src/main/main.ts", import.meta.url), "utf8");
const appBridgeHandlersSource = await readFile(new URL("../src/main/app-bridge-handlers.ts", import.meta.url), "utf8");
const appPresenceControllerSource = await readFile(new URL("../src/main/app-presence-controller.ts", import.meta.url), "utf8");
const rendererSource = await readFile(new URL("../src/renderer/main.tsx", import.meta.url), "utf8");
const readerWindowAppSource = await readFile(new URL("../src/renderer/App.tsx", import.meta.url), "utf8");
const rendererAudioSource = await readFile(new URL("../src/renderer/audio-player.ts", import.meta.url), "utf8");
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
  PLAYBACK_OVERLAY_COMMAND_CHANNELS.moveBy,
  PLAYBACK_OVERLAY_COMMAND_CHANNELS.finishPlayback,
  PLAYBACK_CONTROL_CHANNELS.rendererIdle,
  "PlaybackCommandController",
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
  "registerAppBridgeHandlers",
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
assertMissing(appContractsSource, ["interface ReaderWindowBridge", "interface RendererAudioBridge", "interface PlaybackOverlayBridge"]);
assertIncludes(bridgeContractsSource, [
  "./bridge-contracts/app-data.js",
  "./bridge-contracts/app-shell.js",
  "./bridge-contracts/clipboard.js",
  "./bridge-contracts/playback-control.js",
  "./bridge-contracts/playback-overlay.js",
  "./bridge-contracts/renderer-audio.js",
  "ReaderWindowBridge",
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
      "rendererAudioBridge",
      "playbackOverlayBridge",
      "createAppShellBridge",
      "createAppDataBridge",
      "createPlaybackControlBridge",
      "createClipboardBridge",
      "createRendererAudioBridge",
      "createPlaybackOverlayBridge",
      "createRuntimeBridge",
      "isPlaybackOverlayRuntime",
      'window.location.pathname.includes("/overlay/")'
    ]
  },
  {
    name: "shared voice-reader bridge",
    source: voiceReaderBridgeSource,
    expectedValues: [
      "voiceReader: unknown",
      "getReaderWindowBridge",
      "getRendererAudioBridge",
      "getPlaybackOverlayBridge"
    ]
  },
  {
    name: "reader window",
    source: rendererSource,
    expectedValues: ["getReaderWindowBridge", "getRendererAudioBridge"]
  },
  { name: "renderer audio", source: rendererAudioSource, expectedValues: ["RendererAudioBridge"] },
  { name: "playback overlay", source: overlaySource, expectedValues: ["getPlaybackOverlayBridge"] }
]) {
  for (const expected of expectedValues) {
    assert.equal(source.includes(expected), true, `${name} should include ${expected}`);
  }
}
const readerRuntimeBridge = evaluatePreloadBridge("/renderer/index.html");
const overlayRuntimeBridge = evaluatePreloadBridge("/overlay/index.html");
assert.equal(typeof readerRuntimeBridge.getSettings, "function");
assert.equal(typeof readerRuntimeBridge.createFavoriteFromHistoryRecord, "function");
assert.equal(typeof readerRuntimeBridge.listFavorites, "function");
assert.equal(typeof readerRuntimeBridge.deleteFavoriteRecord, "function");
assert.equal(typeof readerRuntimeBridge.playFavoriteRecord, "function");
assert.equal(typeof readerRuntimeBridge.onPlaybackStart, "function");
assert.equal(typeof readerRuntimeBridge.onOverlayShow, "undefined");
assert.equal(typeof overlayRuntimeBridge.stopPlayback, "undefined");
assert.equal(typeof overlayRuntimeBridge.onOverlayShow, "function");
assert.equal(typeof overlayRuntimeBridge.getSettings, "undefined");
assert.equal(typeof overlayRuntimeBridge.onPlaybackStart, "undefined");
for (const { name, source } of [
  { name: "reader window entrypoint", source: rendererSource },
  { name: "reader window app", source: readerWindowAppSource },
  { name: "renderer audio", source: rendererAudioSource },
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
assert.equal(rendererBundle.includes("getByteTimeDomainData"), true);
assert.equal(rendererBundle.includes("requestAnimationFrame"), true);
assert.equal(rendererBundle.includes("sendOverlayMetric"), true);
assert.equal(rendererBundle.includes("finishOverlayPlayback"), true);
for (const label of ["账户与连接", "快捷键", "朗读", "历史记录", "通用"]) {
  assert.equal(readerWindowAppSource.includes(label), true);
}
for (const label of [
  "MiniMax API Key",
  "验证连接",
  "刷新 Voice",
  "快捷键已注册",
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
  "Error Log"
]) {
  assert.equal(readerWindowAppSource.includes(label), true);
}
assertMissing(readerWindowAppSource, ["清空收藏", "收藏数量"]);
assert.equal(readerWindowAppSource.includes("function Home"), true);
assert.equal(readerWindowAppSource.includes("getSetupRecoveryAction"), true);
assert.equal(readerWindowAppSource.includes('role="group"'), true);
assert.equal(readerWindowAppSource.includes("aria-pressed"), true);
for (const homeClass of [".home-dashboard", ".health-strip", ".command-panel", ".setup-action", ".voice-panel"]) {
  assert.equal(rendererCssSource.includes(homeClass), true);
}
assertIncludes(rendererCssSource, ["--window-drag-height", "-webkit-app-region: drag"]);
assert.equal(rendererCssSource.includes("prefers-color-scheme: dark"), true);
assert.equal(rendererCssSource.includes(".brand-mark"), true);
assert.equal(rendererCssSource.includes("background: transparent"), true);
assert.equal(rendererCssSource.includes("grid-template-columns: repeat(2"), true);
assert.equal(rendererCssSource.includes(".shortcut-recorder"), true);
assert.equal(rendererCssSource.includes(".range-control"), true);
assertMissing(overlayHtml, "manifest.json");
assertIncludes(overlayHtml, ["VoiceReader Overlay", '<link rel="stylesheet" href="./overlay.css"']);
assertIncludes(overlayBundle, ["onOverlayShow", "onOverlayMetric", "scaleY"]);
assertMissing(overlayBundle, ["stopPlayback", "×", "\\xD7", "播放"]);
assertMissing(playbackOverlayAppSource, "viewBox");
assertIncludes(playbackOverlayAppSource, ["progress: number", "Math.max(current.progress", "scaleX"]);
assertIncludes(overlayCss, ["transparent", "--pill: #000", "--pill-border", "border: 1px solid var(--pill-border)", "prefers-reduced-motion", "width: 120px", "height: 32px", "gap: 4px", "padding: 0 15px", "width: 3.6px", ".overlay-root.is-visible .overlay-pill:hover", ".hover-progress span", "scale(1.035)"]);
assertMissing(overlayCss, [".close-button", "grid-template-columns:", "--pill: #000;\n    --shadow", "button {", "box-shadow: inset 0 1px 0"]);
assertIncludes(playbackOverlayControllerSource, ["type: \"panel\"", "width: 132", "height: 44", 'const overlayWindowLevel = "screen-saver"', "getDisplayNearestPoint(screen.getCursorScreenPoint())", "skipTransformProcessType"]);
assertIncludes(playbackOverlayControllerSource, "attachOverlayToFullscreenSpaces(window);\n    window.moveTop()");
assertIncludes(playbackOverlayControllerSource, "refreshOverlayWorkspaceAttachment(window)");
assertIncludes(playbackOverlayControllerSource, "metric.progress");
assertOverlayDragCoverage();
assertIncludes(rendererAudioSource, ["segmentWeights", "getSessionProgress", "progress:"]);
assertMissing(rendererAudioSource, "const progress = audioProgress");
assertIncludes(playbackOverlayAppSource, "const BAR_COUNT = 10");
assertIncludes(appContractsSource, "progress: number");
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
assert.equal(packageScript.includes("--verify"), true);

const { overlaySink, overlayActions, sentPlaybackMessages } = createElectronAudioSinkScenario();
overlaySink.startSession(createOverlayPlaybackSessionForTest(101));
assert.deepEqual(overlayActions, ["show"]);
assert.deepEqual(sentPlaybackMessages.at(-1), [RENDERER_AUDIO_CHANNELS.startSession, 101, false]);
overlaySink.finishSession(101);
assert.deepEqual(overlayActions, ["show"]);
assert.deepEqual(sentPlaybackMessages.at(-1), [RENDERER_AUDIO_CHANNELS.finishSession, 101]);
overlaySink.stopSession(101);
assert.deepEqual(overlayActions, ["show", "stop"]);
assert.deepEqual(sentPlaybackMessages.at(-1), [RENDERER_AUDIO_CHANNELS.stopSession, 101]);

const rendererIdleScenario = createElectronAudioSinkScenario();
rendererIdleScenario.overlaySink.startSession(createOverlayPlaybackSessionForTest(102));
assert.deepEqual(rendererIdleScenario.overlayActions, ["show"]);
rendererIdleScenario.overlaySink.finishSession(102);
rendererIdleScenario.overlaySink.handleRendererIdle(102);
rendererIdleScenario.overlaySink.stopSession(102);
assert.deepEqual(rendererIdleScenario.overlayActions, ["show"]);
assert.deepEqual(rendererIdleScenario.sentPlaybackMessages.at(-1), [RENDERER_AUDIO_CHANNELS.stopSession, 102]);

const failureScenario = createElectronAudioSinkScenario();
failureScenario.overlaySink.startSession(createOverlayPlaybackSessionForTest(106));
failureScenario.overlaySink.failSession(106);
assert.deepEqual(failureScenario.overlayActions, ["show", "fail"]);
assert.deepEqual(failureScenario.sentPlaybackMessages.at(-1), [RENDERER_AUDIO_CHANNELS.failSession, 106]);

const replacementScenario = createElectronAudioSinkScenario();
replacementScenario.overlaySink.startSession(createOverlayPlaybackSessionForTest(107));
replacementScenario.overlaySink.finishSession(107);
replacementScenario.overlaySink.startSession(createHistoryReplaySessionForTest(108));
assert.deepEqual(replacementScenario.overlayActions, ["show", "stop"]);
assert.deepEqual(replacementScenario.sentPlaybackMessages.at(-1), [RENDERER_AUDIO_CHANNELS.startSession, 108, false]);
replacementScenario.overlaySink.stopSession(107);
assert.deepEqual(replacementScenario.overlayActions, ["show", "stop"]);

const historySinkScenario = createElectronAudioSinkScenario();
historySinkScenario.overlaySink.startSession(createHistoryReplaySessionForTest(104));
assert.deepEqual(historySinkScenario.overlayActions, []);
assert.deepEqual(historySinkScenario.sentPlaybackMessages.at(-1), [RENDERER_AUDIO_CHANNELS.startSession, 104, false]);
historySinkScenario.overlaySink.finishSession(104);
assert.deepEqual(historySinkScenario.overlayActions, []);
assert.deepEqual(historySinkScenario.sentPlaybackMessages.at(-1), [RENDERER_AUDIO_CHANNELS.finishSession, 104]);
historySinkScenario.overlaySink.stopSession(104);
assert.deepEqual(historySinkScenario.overlayActions, []);
assert.deepEqual(historySinkScenario.sentPlaybackMessages.at(-1), [RENDERER_AUDIO_CHANNELS.stopSession, 104]);

const favoriteSinkScenario = createElectronAudioSinkScenario();
favoriteSinkScenario.overlaySink.startSession(createFavoriteReplaySessionForTest(109));
assert.deepEqual(favoriteSinkScenario.overlayActions, []);
assert.deepEqual(favoriteSinkScenario.sentPlaybackMessages.at(-1), [RENDERER_AUDIO_CHANNELS.startSession, 109, false]);
favoriteSinkScenario.overlaySink.finishSession(109);
assert.deepEqual(favoriteSinkScenario.overlayActions, []);
assert.deepEqual(favoriteSinkScenario.sentPlaybackMessages.at(-1), [RENDERER_AUDIO_CHANNELS.finishSession, 109]);

const noWindowScenario = createElectronAudioSinkScenario(() => undefined);
noWindowScenario.overlaySink.startSession(createOverlayPlaybackSessionForTest(103));
noWindowScenario.overlaySink.finishSession(103);
assert.deepEqual(noWindowScenario.overlayActions, ["show", "finish"]);
noWindowScenario.overlaySink.stopSession(103);
assert.deepEqual(noWindowScenario.overlayActions, ["show", "finish"]);

let delayedWindow;
const delayedWindowScenario = createElectronAudioSinkScenario(() => delayedWindow);
delayedWindowScenario.overlaySink.startSession(createOverlayPlaybackSessionForTest(105));
delayedWindow = createPlaybackWindowForTest(delayedWindowScenario.sentPlaybackMessages);
delayedWindowScenario.overlaySink.finishSession(105);
assert.deepEqual(delayedWindowScenario.overlayActions, ["show", "finish"]);
assert.deepEqual(delayedWindowScenario.sentPlaybackMessages, []);

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

function assertOverlayDragCoverage() {
  assertIncludes(overlayBundle, "moveOverlayBy");
  assertIncludes(playbackOverlayAppSource, [
    "DRAG_HOLD_MS",
    "setPointerCapture",
    "hasLongPressActivated",
    "cancelDrag();\n      setState",
    "moveOverlayBy"
  ]);
  assertIncludes(overlayCss, ["cursor: grab", ".overlay-root.is-dragging .overlay-pill"]);
  assertIncludes(playbackOverlayControllerSource, ["moveBy(delta", "manualPosition", "constrainOverlayPosition"]);
  assertIncludes(playbackOverlayBridgeSource, ["OverlayDragDelta", "moveOverlayBy"]);
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
    show() {
      actions.push("show");
    },
    finish() {
      actions.push("finish");
    },
    fail() {
      actions.push("fail");
    },
    stop() {
      actions.push("stop");
    }
  };
}

function createElectronAudioSinkScenario(getWindow) {
  const overlayActions = [];
  const sentPlaybackMessages = [];
  const playbackWindow = createPlaybackWindowForTest(sentPlaybackMessages);
  const overlaySink = new ElectronAudioSink(
    getWindow ?? (() => playbackWindow),
    createOverlayControllerForTest(overlayActions)
  );

  return { overlaySink, overlayActions, sentPlaybackMessages };
}

function createPlaybackWindowForTest(sentPlaybackMessages) {
  return {
    isDestroyed: () => false,
    webContents: {
      send(channel, payload) {
        if (channel === RENDERER_AUDIO_CHANNELS.startSession) {
          sentPlaybackMessages.push([channel, payload?.sessionId, hasReadingTargetPayload(payload)]);
          return;
        }
        sentPlaybackMessages.push([channel, payload?.sessionId]);
      }
    }
  };
}

function hasReadingTargetPayload(payload) {
  return Boolean(payload && typeof payload === "object" && "target" in payload);
}
