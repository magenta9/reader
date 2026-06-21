import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";

await run("scripts/build.mjs", []);

const { detectLanguage } = await import("../dist/shared/language.js");
const { createReadingSegments, normalizeReadableText } = await import("../dist/shared/segments.js");
const { buildMiniMaxTtsBody, describeMiniMaxApiKeyProblem, getMiniMaxBaseUrlOrder, parseMiniMaxStream } = await import(
  "../dist/shared/minimax.js"
);
const { COMMON_MINIMAX_VOICES, mergeVoiceLists, normalizeMiniMaxVoices, selectVoiceId, voicesForLanguage } = await import("../dist/shared/voices.js");
const { AppDataStore } = await import("../dist/main/data/app-data-store.js");
const {
  createReadingHistoryPreview,
  createReadingHistoryRecord,
  estimateReadingDurationSeconds,
  readingHistoryRetentionCutoff,
  summarizeReadingSegmentLanguages
} = await import("../dist/main/data/reading-history-record.js");
const { MiniMaxAccountService } = await import("../dist/main/data/minimax-account-service.js");
const { normalizeShortcutInput, PlaybackCommandController } = await import("../dist/main/playback/playback-command-controller.js");
const { PlaybackRequestResolver } = await import("../dist/main/playback/playback-request-resolver.js");
const { PlaybackService } = await import("../dist/main/playback/playback-service.js");
const { ReadingTargetAcquirer } = await import("../dist/main/reading-target/reading-target-acquirer.js");
const { ElectronAudioSink } = await import("../dist/main/playback/electron-audio-sink.js");
const { PlaybackAudioQueue } = await import("../dist/renderer/audio-player.js");
const {
  groupFavoriteRecords,
  resolveAdjacentSelectionAfterDelete,
  resolveSelectedRecordId
} = await import("../dist/renderer/record-view-model.js");
const {
  DEFAULT_ACTIVATION_SHORTCUT,
  LEGACY_DEFAULT_ACTIVATION_SHORTCUT,
  PLAYBACK_FEEDBACK_SURFACES
} = await import("../dist/shared/app-contracts.js");

for (const path of [
  "../dist/main/main.js",
  "../dist/main/playback/playback-request-resolver.js",
  "../dist/main/reading-target/reading-target-acquirer.js",
  "../dist/shared/app-contracts.js",
  "../dist/preload/preload.cjs",
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
const preloadBundle = await readFile(new URL("../dist/preload/preload.cjs", import.meta.url), "utf8");
const preloadSource = await readFile(new URL("../src/preload/preload.ts", import.meta.url), "utf8");
const rendererHtml = await readFile(new URL("../dist/renderer/index.html", import.meta.url), "utf8");
const rendererBundle = await readFile(new URL("../dist/renderer/renderer.js", import.meta.url), "utf8");
const overlayHtml = await readFile(new URL("../dist/overlay/index.html", import.meta.url), "utf8");
const overlayBundle = await readFile(new URL("../dist/overlay/overlay.js", import.meta.url), "utf8");
const overlayCss = await readFile(new URL("../dist/overlay/overlay.css", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../src/main/main.ts", import.meta.url), "utf8");
const rendererSource = await readFile(new URL("../src/renderer/main.tsx", import.meta.url), "utf8");
const rendererAudioSource = await readFile(new URL("../src/renderer/audio-player.ts", import.meta.url), "utf8");
const overlaySource = await readFile(new URL("../src/overlay/main.tsx", import.meta.url), "utf8");
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
  "syncDockPresence",
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
  "overlay:metric",
  "overlay:move-by",
  "overlay:finish-playback",
  "playback:renderer-idle",
  "PlaybackCommandController",
  "stopSession",
  "app-data:set-activation-shortcut",
  "app-data:create-favorite-from-history-record",
  "app-data:list-favorites",
  "app-data:delete-favorite-record",
  "playback:play-favorite-record",
  "ReadingTargetAcquirer",
  "selected_text",
  "selection-copy-macos.node",
  "readSelectedText",
  "import.meta.url"
]);
assertMissing(mainBundle, ["../preload/preload.js", "safeStorage", "isTrustedAccessibilityClient", "/usr/bin/osascript", "__dirname"]);
assertIncludes(mainSource, [
  "shouldRevealPreviousAppBeforeSelectionCapture",
  "hideReaderAppForSelectionCapture",
  "ReadingTargetAcquirer",
  "registerIpcHandlers(readingTargetAcquirer)",
  "readingTargetAcquirer.revealPreviousAppBeforeCapture()",
  "playbackCommands.startReadingTargetPlayback()",
  "() => readingTargetAcquirer.acquire()",
  "pendingRoute = route;\n  syncDockPresence();",
  "app.hide();\n    syncDockPresence();",
  "app.dock.show()",
  "app.hide()"
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
assertIncludes(appContractsSource, "FavoriteRecord");
assertIncludes(appContractsSource, "favoriteDetail");
assertMissing(preloadBundle, "../renderer/bridge");
for (const { name, source, expectedValues } of [
  {
    name: "preload runtime bridge",
    source: preloadSource,
    expectedValues: [
      "readerWindowBridge",
      "rendererAudioBridge",
      "playbackOverlayBridge",
      "overlay:move-by",
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
  { name: "reader window", source: rendererSource },
  { name: "renderer audio", source: rendererAudioSource },
  { name: "playback overlay", source: overlaySource }
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
  assert.equal(rendererSource.includes(label), true);
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
  assert.equal(rendererSource.includes(label), true);
}
assertMissing(rendererSource, ["清空收藏", "收藏数量"]);
assert.equal(rendererSource.includes("function Home"), true);
assert.equal(rendererSource.includes("getSetupRecoveryAction"), true);
assert.equal(rendererSource.includes('role="group"'), true);
assert.equal(rendererSource.includes("aria-pressed"), true);
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
assertMissing(overlaySource, "viewBox");
assertIncludes(overlaySource, ["progress: number", "Math.max(current.progress", "scaleX"]);
assertIncludes(overlayCss, ["transparent", "--pill: #000", "--pill-border", "border: 1px solid var(--pill-border)", "prefers-reduced-motion", "width: 120px", "height: 32px", "gap: 4px", "padding: 0 15px", "width: 3.6px", ".overlay-root.is-visible .overlay-pill:hover", ".hover-progress span", "scale(1.035)"]);
assertMissing(overlayCss, [".close-button", "grid-template-columns:", "--pill: #000;\n    --shadow", "button {", "box-shadow: inset 0 1px 0"]);
assertIncludes(playbackOverlayControllerSource, ["type: \"panel\"", "width: 132", "height: 44", 'const overlayWindowLevel = "screen-saver"', "getDisplayNearestPoint(screen.getCursorScreenPoint())", "skipTransformProcessType"]);
assertIncludes(playbackOverlayControllerSource, "attachOverlayToFullscreenSpaces(window);\n    window.moveTop()");
assertIncludes(playbackOverlayControllerSource, "refreshOverlayWorkspaceAttachment(window)");
assertIncludes(playbackOverlayControllerSource, "metric.progress");
assertOverlayDragCoverage();
assertIncludes(rendererAudioSource, ["segmentWeights", "getSessionProgress", "progress:"]);
assertMissing(rendererAudioSource, "const progress = audioProgress");
assertIncludes(overlaySource, "const BAR_COUNT = 10");
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

assert.equal(detectLanguage("这是一个中文段落，用来测试语音阅读。"), "zh");
assert.equal(detectLanguage("This is an English paragraph for reading aloud."), "en");
assert.equal(detectLanguage("これは日本語の文章です。"), "ja");
assert.equal(detectLanguage("이 문장은 한국어입니다."), "ko");
assert.equal(detectLanguage("12345 !!!"), "unknown");

assert.equal(
  normalizeReadableText("First paragraph.  \n\n\nSecond paragraph with more text."),
  "First paragraph.\n\nSecond paragraph with more text."
);
const segments = createReadingSegments(Array.from({ length: 80 }, (_, index) => `Sentence ${index}.`).join(" "));
assert.ok(segments.length > 1);
assert.ok(segments.every((segment) => segment.language === "en"));
assert.ok(segments.every((segment) => segment.text.length <= 900));
assert.ok(segments[0].text.length <= 240);

const chineseSentence = `这是一句用于验证中文分段边界的长句子，它需要在自然标点处切分，而不是在句子的中间被硬切断。`;
const chineseSegments = createReadingSegments(Array.from({ length: 30 }, () => chineseSentence).join(""));
assert.ok(chineseSegments.length > 1);
assert.ok(chineseSegments.every((segment) => segment.text.length <= 900));
assert.ok(chineseSegments[0].text.length <= 240);
assert.ok(chineseSegments.every((segment) => segment.text.endsWith("。")));
assert.ok(chineseSegments.every((segment) => segment.language === "zh"));

const unpunctuatedSegments = createReadingSegments("长".repeat(1900));
assert.ok(unpunctuatedSegments.length > 1);
assert.ok(unpunctuatedSegments.every((segment) => segment.text.length <= 900));
assert.ok(unpunctuatedSegments[0].text.length <= 240);

const unpunctuatedEnglish = "a".repeat(1900);
const unpunctuatedEnglishSegments = createReadingSegments(unpunctuatedEnglish);
assert.ok(unpunctuatedEnglishSegments.length > 1);
assert.equal(
  unpunctuatedEnglishSegments.map((segment) => segment.text).join(""),
  unpunctuatedEnglish
);

const normalizedVoices = normalizeMiniMaxVoices({
  system_voice: [
    { voice_id: "Chinese_Male_1", description: ["Chinese (Mandarin)"] },
    { voice_id: "English_Female_1", description: ["English"] }
  ]
});
assert.deepEqual(
  normalizedVoices.map((voice) => [voice.voice_id, voice.language]),
  [
    ["Chinese_Male_1", "zh"],
    ["English_Female_1", "en"]
  ]
);
assert.equal(selectVoiceId(normalizedVoices, { zh: "Chinese_Male_1" }, "zh"), "Chinese_Male_1");
assert.equal(selectVoiceId(normalizedVoices, { zh: "custom-voice-id" }, "zh"), "custom-voice-id");
assert.equal(selectVoiceId(normalizedVoices, {}, "en"), "English_Female_1");
assert.equal(voicesForLanguage(normalizedVoices, "zh")[0].voice_id, "Chinese_Male_1");
assert.equal(
  mergeVoiceLists(normalizedVoices, COMMON_MINIMAX_VOICES).filter(
    (voice) => voice.voice_id === COMMON_MINIMAX_VOICES[0].voice_id
  ).length,
  1
);

const historyRecordSegments = [
  { id: "segment-1", text: "中文。", language: "zh" },
  { id: "segment-2", text: "English sentence.", language: "en" },
  { id: "segment-3", text: "???", language: "unknown" }
];
const historyRecordText = "第一行会作为预览。\n\n第二段会保留在全文里。";
const recordFromInput = createReadingHistoryRecord({
  text: historyRecordText,
  source: "selected_text",
  segments: historyRecordSegments,
  createdAt: 123_456
});
assert.equal(recordFromInput.createdAt, 123_456);
assert.equal(recordFromInput.preview, "第一行会作为预览。");
assert.equal(recordFromInput.languageSummary, "中文 / 英文 / 未知");
assert.equal(recordFromInput.source, "selected_text");
assert.equal(createReadingHistoryPreview(` ${"a".repeat(130)} `), `${"a".repeat(119)}…`);
assert.equal(summarizeReadingSegmentLanguages([]), "未知");
assert.ok(estimateReadingDurationSeconds("这是一段中文。English words here.") > 0);
assert.equal(readingHistoryRetentionCutoff(1000, "forever"), undefined);
assert.equal(readingHistoryRetentionCutoff(8 * 24 * 60 * 60 * 1000, "7d"), 24 * 60 * 60 * 1000);

assert.deepEqual(buildMiniMaxTtsBody("speech-2.8-turbo", "voice-a", "hello"), {
  model: "speech-2.8-turbo",
  text: "hello",
  stream: true,
  output_format: "hex",
  language_boost: "auto",
  voice_setting: {
    voice_id: "voice-a",
    speed: 1,
    vol: 1,
    pitch: 0
  },
  audio_setting: {
    sample_rate: 32000,
    bitrate: 128000,
    format: "mp3",
    channel: 1
  }
});

const emitted = [];
const encoder = new TextEncoder();
const stream = new ReadableStream({
  start(controller) {
    controller.enqueue(
      encoder.encode('data: {"data":{"audio":"abcd"}}\n\ndata: {"data":{"audio":"ef01"}}\n')
    );
    controller.close();
  }
});
await parseMiniMaxStream(stream, (audioHex) => emitted.push(audioHex));
assert.deepEqual(emitted, ["abcd", "ef01"]);

const streamingWithFinalAggregate = [];
const streamWithFinalAggregate = new ReadableStream({
  start(controller) {
    controller.enqueue(
      encoder.encode(
        [
          'data: {"data":{"audio":"aaaa","status":1}}',
          'data: {"data":{"audio":"bbbb","status":1}}',
          'data: {"data":{"audio":"aaaabbbb","status":2}}'
        ].join("\n\n")
      )
    );
    controller.close();
  }
});
await parseMiniMaxStream(streamWithFinalAggregate, (audioHex) =>
  streamingWithFinalAggregate.push(audioHex)
);
assert.deepEqual(streamingWithFinalAggregate, ["aaaa", "bbbb"]);

const streamWithOnlyIncrementalAudio = new ReadableStream({
  start(controller) {
    controller.enqueue(
      encoder.encode(
        [
          'data: {"data":{"audio":"1111","status":1}}',
          'data: {"data":{"audio":"2222","status":1}}'
        ].join("\n\n")
      )
    );
    controller.close();
  }
});
const onlyIncrementalAudio = [];
await parseMiniMaxStream(streamWithOnlyIncrementalAudio, (audioHex) =>
  onlyIncrementalAudio.push(audioHex)
);
assert.deepEqual(onlyIncrementalAudio, ["1111", "2222"]);

const streamWithOnlyFinalAudio = new ReadableStream({
  start(controller) {
    controller.enqueue(encoder.encode('data: {"data":{"audio":"final","status":2}}\n'));
    controller.close();
  }
});
const onlyFinalAudio = [];
await parseMiniMaxStream(streamWithOnlyFinalAudio, (audioHex) => onlyFinalAudio.push(audioHex));
assert.deepEqual(onlyFinalAudio, ["final"]);

const loginPayload = btoa(
  JSON.stringify({
    TokenType: 4,
    UserName: "example",
    Phone: "123"
  })
)
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/g, "");
assert.equal(describeMiniMaxApiKeyProblem(`header.${loginPayload}.signature`), undefined);
assert.equal(describeMiniMaxApiKeyProblem("sk-valid-looking-key"), undefined);
assert.equal(getMiniMaxBaseUrlOrder(`header.${loginPayload}.signature`)[0], "https://api.minimaxi.com");
assert.equal(getMiniMaxBaseUrlOrder("sk-valid-looking-key")[0], "https://api.minimax.io");

const dataDir = await mkdtemp(join(tmpdir(), "voicereader-data-"));
const store = new AppDataStore(join(dataDir, "voicereader.sqlite"));
const dbPath = join(dataDir, "voicereader.sqlite");
assert.equal(existsSync(dbPath), true);
const schemaDb = new DatabaseSync(dbPath);
const tables = schemaDb
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
  .all()
  .map((row) => String(row.name));
assert.ok(tables.includes("settings"));
assert.ok(tables.includes("reading_history"));
assert.ok(tables.includes("favorite_records"));
assert.ok(tables.includes("error_log"));
schemaDb.close();

const legacyDataDir = await mkdtemp(join(tmpdir(), "voicereader-legacy-data-"));
const legacyDbPath = join(legacyDataDir, "voicereader.sqlite");
const legacyDb = new DatabaseSync(legacyDbPath);
legacyDb.exec(`
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);
legacyDb
  .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
  .run("minimax.apiKey.encrypted", "legacy-safe-storage-ciphertext");
legacyDb.close();
const legacyStore = new AppDataStore(legacyDbPath);
assert.equal(legacyStore.getRawSettingForTest("minimax.apiKey.encrypted"), undefined);
assert.equal(legacyStore.readMiniMaxApiKey(), undefined);
legacyStore.close();

assert.deepEqual(store.getSettings().activationShortcut, DEFAULT_ACTIVATION_SHORTCUT);
assert.equal(store.getSettings().historyRetention, "1m");

const shortcutMigrationDataDir = await mkdtemp(join(tmpdir(), "voicereader-shortcut-migration-"));
const shortcutMigrationDbPath = join(shortcutMigrationDataDir, "voicereader.sqlite");
const shortcutMigrationDb = new DatabaseSync(shortcutMigrationDbPath);
shortcutMigrationDb.exec(`
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);
shortcutMigrationDb
  .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
  .run("app.settings", JSON.stringify({ activationShortcut: LEGACY_DEFAULT_ACTIVATION_SHORTCUT }));
shortcutMigrationDb.close();
const shortcutMigrationStore = new AppDataStore(shortcutMigrationDbPath);
assert.equal(shortcutMigrationStore.getSettings().activationShortcut, DEFAULT_ACTIVATION_SHORTCUT);
assert.equal(
  JSON.parse(shortcutMigrationStore.getRawSettingForTest("app.settings")).activationShortcut,
  DEFAULT_ACTIVATION_SHORTCUT
);
shortcutMigrationStore.close();

const updatedSettings = store.updateSettings({
  hasCompletedOnboarding: true,
  launchAtLogin: true,
  speechRate: 2.75,
  model: "custom-model",
  historyRetention: "7d"
});
assert.equal(updatedSettings.hasCompletedOnboarding, true);
assert.equal(updatedSettings.launchAtLogin, true);
assert.equal(updatedSettings.speechRate, 2.75);
assert.equal(updatedSettings.model, "custom-model");
assert.equal(updatedSettings.historyRetention, "7d");

store.clearReadingHistory();
const historySegments = [
  { id: "segment-1", text: "第一段中文文本。", language: "zh" },
  { id: "segment-2", text: "Second English paragraph for duration.", language: "en" }
];
const historyA = store.saveOrReuseReadingHistoryRecord({
  text: "第一段中文文本。\n\nSecond English paragraph for duration.",
  source: "clipboard",
  segments: historySegments,
  createdAt: 10_000_000
});
assert.equal(historyA.text, "第一段中文文本。\n\nSecond English paragraph for duration.");
assert.equal(historyA.preview, "第一段中文文本。");
assert.equal(historyA.languageSummary, "中文 / 英文");
assert.equal(historyA.source, "clipboard");
assert.ok(historyA.durationEstimateSeconds > 0);
assert.equal(store.getReadingHistoryCount(), 1);
assert.deepEqual(Object.keys(historyA).sort(), [
  "createdAt",
  "durationEstimateSeconds",
  "id",
  "languageSummary",
  "preview",
  "source",
  "text"
]);

const historyReuse = store.saveOrReuseReadingHistoryRecord({
  text: "第一段中文文本。\n\nSecond English paragraph for duration.",
  source: "clipboard",
  segments: historySegments,
  createdAt: 10_000_000 + 4 * 60 * 1000
});
assert.equal(historyReuse.id, historyA.id);
assert.equal(historyReuse.source, "clipboard");
assert.equal(store.getReadingHistoryCount(), 1);

const historySelectedSource = store.saveOrReuseReadingHistoryRecord({
  text: "第一段中文文本。\n\nSecond English paragraph for duration.",
  source: "selected_text",
  segments: historySegments,
  createdAt: 10_000_000 + 4 * 60 * 1000
});
assert.notEqual(historySelectedSource.id, historyA.id);
assert.equal(historySelectedSource.source, "selected_text");
assert.equal(store.getReadingHistoryCount(), 2);

const historyB = store.saveOrReuseReadingHistoryRecord({
  text: "第一段中文文本。\n\nSecond English paragraph for duration.",
  source: "clipboard",
  segments: historySegments,
  createdAt: 10_000_000 + 6 * 60 * 1000
});
assert.notEqual(historyB.id, historyA.id);
assert.equal(historyB.source, "clipboard");
assert.equal(store.getReadingHistoryCount(), 3);

const missingFavorite = store.createFavoriteFromHistoryRecord("missing-history-record", 30_000_000);
assert.equal(missingFavorite, undefined);
const favoriteA = store.createFavoriteFromHistoryRecord(historyA.id, 30_000_000);
const favoriteDuplicate = store.createFavoriteFromHistoryRecord(historyA.id, 30_001_000);
assert.ok(favoriteA);
assert.ok(favoriteDuplicate);
assert.notEqual(favoriteDuplicate.id, favoriteA.id);
assert.equal(favoriteA.text, historyA.text);
assert.equal(favoriteA.preview, historyA.preview);
assert.equal(favoriteA.durationEstimateSeconds, historyA.durationEstimateSeconds);
assert.equal(favoriteA.languageSummary, historyA.languageSummary);
assert.equal(favoriteA.source, historyA.source);
assert.equal(favoriteA.sourceCreatedAt, historyA.createdAt);
assert.equal(favoriteA.favoritedAt, 30_000_000);
assert.deepEqual(store.getFavoriteRecord(favoriteA.id), favoriteA);
assert.deepEqual(Object.keys(favoriteA).sort(), [
  "durationEstimateSeconds",
  "favoritedAt",
  "id",
  "languageSummary",
  "preview",
  "source",
  "sourceCreatedAt",
  "text"
]);
assert.deepEqual(favoriteIds(store), [favoriteDuplicate.id, favoriteA.id]);
store.deleteReadingHistoryRecord(historyA.id);
assert.equal(store.getReadingHistoryRecord(historyA.id), undefined);
assert.deepEqual(favoriteIds(store), [favoriteDuplicate.id, favoriteA.id]);
assert.equal(store.listFavoriteRecords().find((record) => record.id === favoriteA.id)?.text, historyA.text);

store.updateSettings({ historyRetention: "7d" });
const expiredHistory = store.saveOrReuseReadingHistoryRecord({
  text: "旧记录",
  source: "clipboard",
  segments: createReadingSegments("旧记录"),
  createdAt: 1
});
const expiredHistoryFavorite = store.createFavoriteFromHistoryRecord(expiredHistory.id, 30_002_000);
assert.ok(expiredHistoryFavorite);
store.cleanupExpiredReadingHistory(8 * 24 * 60 * 60 * 1000 + 2, "7d");
assert.equal(store.listReadingHistoryRecords().some((record) => record.text === "旧记录"), false);
assert.equal(hasFavorite(store, expiredHistoryFavorite.id, (record) => record.text === "旧记录"), true);

store.updateSettings({ historyRetention: "forever" });
store.saveOrReuseReadingHistoryRecord({
  text: "永久保留记录",
  source: "clipboard",
  segments: createReadingSegments("永久保留记录"),
  createdAt: 2
});
store.cleanupExpiredReadingHistory(365 * 24 * 60 * 60 * 1000, "forever");
assert.equal(store.listReadingHistoryRecords().some((record) => record.text === "永久保留记录"), true);
store.clearReadingHistory();
assert.equal(store.getReadingHistoryCount(), 0);
assert.deepEqual(
  favoriteIds(store).filter((id) => [favoriteA.id, favoriteDuplicate.id, expiredHistoryFavorite.id].includes(id)),
  [expiredHistoryFavorite.id, favoriteDuplicate.id, favoriteA.id]
);
store.deleteFavoriteRecord(favoriteDuplicate.id);
assert.equal(hasFavorite(store, favoriteDuplicate.id), false);
assert.equal(store.getFavoriteRecord(favoriteDuplicate.id), undefined);
assert.equal(hasFavorite(store, favoriteA.id), true);
assert.equal(hasFavorite(store, expiredHistoryFavorite.id), true);

const favoriteGroupingNow = new Date(2026, 5, 17, 12).getTime();
const favoriteViewRecords = [
  createFavoriteRecordForTest("older", new Date(2026, 5, 1, 9).getTime(), "更早收藏全文"),
  createFavoriteRecordForTest("today-early", new Date(2026, 5, 17, 8).getTime(), "今日较早收藏全文"),
  createFavoriteRecordForTest("week", new Date(2026, 5, 15, 10).getTime(), "本周收藏全文"),
  createFavoriteRecordForTest("yesterday", new Date(2026, 5, 16, 11).getTime(), "昨日收藏全文"),
  createFavoriteRecordForTest("today-late", new Date(2026, 5, 17, 10).getTime(), "今日较晚收藏全文")
];
assert.deepEqual(
  groupFavoriteRecords(favoriteViewRecords, favoriteGroupingNow).map((group) => [
    group.label,
    group.records.map((record) => record.id)
  ]),
  [
    ["今天", ["today-late", "today-early"]],
    ["昨天", ["yesterday"]],
    ["本周", ["week"]],
    ["更早", ["older"]]
  ]
);
const favoriteSelectionRecords = ["today-late", "today-early", "yesterday"].map(
  (id) => favoriteViewRecords.find((record) => record.id === id)
);
assert.equal(resolveSelectedRecordId(favoriteSelectionRecords, undefined), "today-late");
assert.equal(resolveSelectedRecordId(favoriteSelectionRecords, "yesterday"), "yesterday");
assert.equal(resolveSelectedRecordId(favoriteSelectionRecords, "missing", "today-late"), "today-late");
assert.equal(resolveSelectedRecordId([], "today-late"), undefined);
assert.equal(resolveAdjacentSelectionAfterDelete(favoriteSelectionRecords, "today-early"), "yesterday");
assert.equal(resolveAdjacentSelectionAfterDelete(favoriteSelectionRecords, "yesterday"), "today-early");
assert.equal(resolveAdjacentSelectionAfterDelete([favoriteSelectionRecords[0]], "today-late"), undefined);
assert.equal(createFavoriteRecordForTest("copy", favoriteGroupingNow, "只复制收藏全文").text, "只复制收藏全文");

const deleteA = store.saveOrReuseReadingHistoryRecord({
  text: "待删除记录 A",
  source: "clipboard",
  segments: createReadingSegments("待删除记录 A"),
  createdAt: 20_000
});
const deleteB = store.saveOrReuseReadingHistoryRecord({
  text: "待删除记录 B",
  source: "clipboard",
  segments: createReadingSegments("待删除记录 B"),
  createdAt: 21_000
});
assert.deepEqual(
  store.listReadingHistoryRecords().map((record) => record.id),
  [deleteB.id, deleteA.id]
);
assert.equal(store.getReadingHistoryRecord(deleteA.id)?.text, "待删除记录 A");
store.deleteReadingHistoryRecord(deleteA.id);
assert.equal(store.getReadingHistoryRecord(deleteA.id), undefined);
assert.deepEqual(
  store.listReadingHistoryRecords().map((record) => record.id),
  [deleteB.id]
);
store.clearReadingHistory();

store.saveMiniMaxApiKey("secret-minimax-key");
assert.equal(store.hasMiniMaxApiKey(), true);
assert.equal(store.readMiniMaxApiKey(), "secret-minimax-key");
assert.equal(store.getRawSettingForTest("minimax.apiKey"), "secret-minimax-key");
store.clearMiniMaxApiKey();
assert.equal(store.hasMiniMaxApiKey(), false);
assert.equal(store.readMiniMaxApiKey(), undefined);

store.recordSkippedPlaybackInput("empty_clipboard");
store.recordSkippedPlaybackInput("non_text_clipboard");
store.recordSkippedPlaybackInput("missing_api_key");
assert.equal(store.getErrorLogCount(), 0);

for (let index = 0; index < 105; index += 1) {
  store.addErrorLog({
    category: "playback_runtime",
    message: ` failure ${index} `.repeat(20),
    createdAt: index
  });
}
assert.equal(store.getErrorLogCount(), 100);
const logs = store.listErrorLogs();
assert.equal(logs.length, 100);
assert.equal(logs[0].createdAt, 104);
assert.equal(logs.at(-1)?.createdAt, 5);
assert.ok(logs.every((entry) => entry.message.length <= 240));
store.clearErrorLogs();
assert.equal(store.getErrorLogCount(), 0);

store.saveMiniMaxApiKey("valid-key");
const zhVoice = {
  voice_id: "voice-zh",
  display_name: "Chinese Voice",
  language: "zh"
};
const account = new MiniMaxAccountService(store, {
  now: () => 12345,
  getVoices: async (apiKey) => {
    assert.equal(apiKey, "valid-key");
    return [zhVoice];
  }
});
const verified = await account.verifyApiKey();
assert.equal(verified.ok, true);
assert.equal(verified.settings.apiKeyStatus, "verified");
assert.equal(verified.settings.apiKeyVerifiedAt, 12345);
assert.equal(verified.settings.voices[0]?.voice_id, "voice-zh");
assert.equal(store.getErrorLogCount(), 0);

const preferredSettings = account.setPreferredVoice("zh", "voice-zh");
assert.equal(preferredSettings.preferredVoicesByLanguage.zh, "voice-zh");

const cachedAccount = new MiniMaxAccountService(store, {
  getVoices: async () => {
    throw new Error("fetch failed");
  }
});
const cachedRefresh = await cachedAccount.refreshVoices();
assert.equal(cachedRefresh.ok, true);
assert.equal(cachedRefresh.usedCachedVoices, true);
assert.equal(cachedRefresh.settings.apiKeyStatus, "verified");
assert.equal(cachedRefresh.settings.voices[0]?.voice_id, "voice-zh");
assert.equal(cachedRefresh.error, "Network error");
assert.equal(store.getErrorLogCount(), 0);

store.clearMiniMaxApiKey();
const missingKey = await cachedAccount.verifyApiKey();
assert.equal(missingKey.ok, false);
assert.equal(missingKey.settings.apiKeyStatus, "missing");
assert.equal(store.getErrorLogCount(), 0);

store.saveMiniMaxApiKey("bad-key");
const failingAccount = new MiniMaxAccountService(store, {
  getVoices: async () => {
    throw new Error("invalid api key");
  }
});
const failed = await failingAccount.verifyApiKey();
assert.equal(failed.ok, false);
assert.equal(failed.settings.apiKeyStatus, "failed");
assert.equal(failed.error, "Invalid API key");
assert.equal(store.getErrorLogCount(), 0);

const playbackEvents = [];
const sink = createPlaybackSinkForTest(playbackEvents, (session) => [
  "start",
  session.sessionId,
  hasReadingTargetPayload(session),
  session.speechRate,
  session.feedbackSurface,
  session.segmentWeights
]);

store.updateSettings({
  apiKeyStatus: "verified",
  voices: [zhVoice],
  preferredVoicesByLanguage: { zh: "voice-zh" },
  speechRate: 1.5
});
store.saveMiniMaxApiKey("playback-key");
store.updateSettings({ apiKeyStatus: "verified" });

const resolverDataDir = await mkdtemp(join(tmpdir(), "voicereader-resolver-data-"));
const resolverStore = new AppDataStore(join(resolverDataDir, "voicereader.sqlite"));
resolverStore.saveMiniMaxApiKey("resolver-key");
resolverStore.updateSettings({
  apiKeyStatus: "verified",
  voices: [zhVoice],
  preferredVoicesByLanguage: { zh: "voice-zh" },
  speechRate: 1.25
});
const resolver = new PlaybackRequestResolver(resolverStore);
const resolvedReadingTarget = resolver.resolveReadingTarget(clipboardTargetInput("  解析器剪切板文本。  "));
assert.equal(resolvedReadingTarget.ok, true);
assert.equal(resolvedReadingTarget.request.apiKey, "resolver-key");
assert.equal(resolvedReadingTarget.request.settings.speechRate, 1.25);
assert.equal(resolvedReadingTarget.request.target.text, "解析器剪切板文本。");
assert.equal(resolvedReadingTarget.request.feedbackSurface, PLAYBACK_FEEDBACK_SURFACES.playbackOverlay);
assertReadingHistoryContains(resolverStore, {
  count: 1,
  text: "解析器剪切板文本。",
  source: "clipboard"
});
const resolverHistoryRecord = resolverStore.listReadingHistoryRecords()[0];
const resolvedHistoryReplay = resolver.resolveHistoryReplay(resolverHistoryRecord.id);
assert.equal(resolvedHistoryReplay.ok, true);
assert.equal(resolvedHistoryReplay.request.target.text, "解析器剪切板文本。");
assert.equal(resolvedHistoryReplay.request.feedbackSurface, PLAYBACK_FEEDBACK_SURFACES.historyDetail);
assert.equal(resolverStore.getReadingHistoryCount(), 1);
const resolverFavoriteRecord = resolverStore.createFavoriteFromHistoryRecord(resolverHistoryRecord.id);
const resolvedFavoriteReplay = resolver.resolveFavoriteReplay(resolverFavoriteRecord.id);
assert.equal(resolvedFavoriteReplay.ok, true);
assert.equal(resolvedFavoriteReplay.request.target.text, "解析器剪切板文本。");
assert.equal(resolvedFavoriteReplay.request.feedbackSurface, PLAYBACK_FEEDBACK_SURFACES.favoriteDetail);
assert.equal(resolverStore.getReadingHistoryCount(), 1);
assert.deepEqual(resolver.resolveHistoryReplay("missing-history"), {
  ok: false,
  result: { started: false, skipped: "missing_history_record" }
});
assert.deepEqual(resolver.resolveReadingTarget(clipboardTargetInput("   ")), {
  ok: false,
  result: { started: false, skipped: "empty_clipboard" }
});
resolverStore.close();

const playback = new PlaybackService(store, sink, async (request) => {
  assert.equal(request.apiKey, "playback-key");
  assert.equal(request.voiceId, "voice-zh");
  await request.onAudioHex("abcd");
});
const playbackResult = await playback.playReadingTarget(clipboardTargetInput("  这是一段剪切板文本。  "));
assert.equal(playbackResult.started, true);
assertReadingHistoryContains(store, {
  count: 1,
  text: "这是一段剪切板文本。",
  source: "clipboard"
});
await playback.waitForCurrentSession();
assert.deepEqual(playbackEvents.slice(-4), [
  ["start", playbackResult.sessionId, false, 1.5, PLAYBACK_FEEDBACK_SURFACES.playbackOverlay, [10]],
  ["chunk", playbackResult.sessionId, "171,205"],
  ["segment-end", playbackResult.sessionId],
  ["finish", playbackResult.sessionId]
]);
playback.stopSession(playbackResult.sessionId);
assert.deepEqual(playbackEvents.at(-1), ["stop", playbackResult.sessionId]);
assert.equal(store.getReadingHistoryCount(), 1);

const duplicatePlayback = await playback.playReadingTarget(clipboardTargetInput("这是一段剪切板文本。"));
assert.equal(duplicatePlayback.started, true);
await playback.waitForCurrentSession();
assert.equal(store.getReadingHistoryCount(), 1);

const selectedTextPlayback = await playback.playReadingTarget(selectedTextTargetInput("这是一段选中文本。"));
assert.equal(selectedTextPlayback.started, true);
assertReadingHistoryContains(store, {
  count: 2,
  text: "这是一段选中文本。",
  source: "selected_text"
});
await playback.waitForCurrentSession();
assert.deepEqual(playbackEvents.slice(-4), [
  ["start", selectedTextPlayback.sessionId, false, 1.5, PLAYBACK_FEEDBACK_SURFACES.playbackOverlay, [9]],
  ["chunk", selectedTextPlayback.sessionId, "171,205"],
  ["segment-end", selectedTextPlayback.sessionId],
  ["finish", selectedTextPlayback.sessionId]
]);

store.updateSettings({ apiKeyStatus: "missing" });
const missingPlaybackKey = await playback.playReadingTarget(clipboardTargetInput("text"));
assert.equal(missingPlaybackKey.started, false);
assert.equal(missingPlaybackKey.skipped, "unverified_api_key");
assert.equal(store.getErrorLogCount(), 0);

store.updateSettings({ apiKeyStatus: "verified", voices: [] });
const missingVoice = await playback.playReadingTarget(clipboardTargetInput("text"));
assert.equal(missingVoice.started, false);
assert.equal(missingVoice.skipped, "missing_voice");
assert.equal(store.getErrorLogCount(), 0);

const clipboardAcquirerLog = [];
const clipboardAcquirerClipboard = createClipboardForReadingTargetTest({
  text: "剪切板后备文本",
  html: "<p>html</p>"
});
const clipboardAcquirer = createReadingTargetAcquirerForTest({
  clipboard: clipboardAcquirerClipboard,
  errorLog: { addErrorLog: (entry) => clipboardAcquirerLog.push(entry) },
  hidePreviousAppForSelectionCapture: () => clipboardAcquirerLog.push({ hidden: true }),
  loadSelectionCopyAddon: () => {
    throw new Error("accessibility unavailable");
  },
  delay: async () => undefined
});
await clipboardAcquirer.revealPreviousAppBeforeCapture();
const clipboardAcquiredTarget = await clipboardAcquirer.acquire();
assert.deepEqual(clipboardAcquiredTarget, {
  text: "剪切板后备文本",
  source: "clipboard"
});
assert.deepEqual(clipboardAcquirerClipboard.snapshot(), {
  text: "剪切板后备文本",
  html: "<p>html</p>",
  rtf: "",
  hasImage: false
});
assert.equal(clipboardAcquirerLog.some((entry) => entry.hidden === true), true);
assert.equal(clipboardAcquirerLog.some((entry) => entry.message?.startsWith("Selected Text capture failed:")), true);

const selectedAcquirerClipboard = createClipboardForReadingTargetTest({ text: "原剪切板" });
const selectedAcquirer = createReadingTargetAcquirerForTest({
  clipboard: selectedAcquirerClipboard,
  loadSelectionCopyAddon: () => ({
    readSelectedText: () => "通过辅助功能读取的选中文本",
    copySelection: () => assert.fail("copySelection should not run after accessibility text succeeds")
  })
});
assert.deepEqual(await selectedAcquirer.acquire(), {
  text: "通过辅助功能读取的选中文本",
  source: "selected_text"
});

const copiedSelectionClipboard = createClipboardForReadingTargetTest({ text: "原剪切板" });
const copiedSelectionAcquirer = createReadingTargetAcquirerForTest({
  clipboard: copiedSelectionClipboard,
  createMarker: () => "__TEST_SELECTION_MARKER__",
  loadSelectionCopyAddon: () => ({
    readSelectedText: () => "",
    copySelection: () => copiedSelectionClipboard.writeText("通过复制读取的选中文本")
  })
});
assert.deepEqual(await copiedSelectionAcquirer.acquire(), {
  text: "通过复制读取的选中文本",
  source: "selected_text"
});
assert.deepEqual(copiedSelectionClipboard.snapshot(), {
  text: "原剪切板",
  html: "",
  rtf: "",
  hasImage: false
});

const unchangedClipboardAfterCopy = createClipboardForReadingTargetTest({ text: "复制前剪切板" });
const unchangedCopyAcquirer = createReadingTargetAcquirerForTest({
  clipboard: unchangedClipboardAfterCopy,
  createMarker: () => "__TEST_SELECTION_MARKER__",
  loadSelectionCopyAddon: () => ({
    readSelectedText: () => "",
    copySelection: () => undefined
  })
});
assert.deepEqual(await unchangedCopyAcquirer.acquire(), {
  text: "复制前剪切板",
  source: "clipboard"
});
assert.deepEqual(unchangedClipboardAfterCopy.snapshot(), {
  text: "复制前剪切板",
  html: "",
  rtf: "",
  hasImage: false
});

store.updateSettings({ voices: [zhVoice], preferredVoicesByLanguage: { zh: "voice-zh" } });
const commandShortcuts = createShortcutRegistryForTest();
let commandTargetInput = selectedTextTargetInput("命令播放文本。");
const commandPlaybackEvents = [];
const commandPlaybackSink = createPlaybackSinkForTest(commandPlaybackEvents);
const commandPlayback = new PlaybackService(store, commandPlaybackSink, async (request) => {
  await request.onAudioHex("abcd");
});
const commands = new PlaybackCommandController(
  store,
  commandPlayback,
  commandShortcuts,
  async () => {
    return commandTargetInput;
  }
);
commands.registerActivationShortcut();
assert.ok(commandShortcuts.handlers.has(DEFAULT_ACTIVATION_SHORTCUT));
const commandResult = await commands.startReadingTargetPlayback();
assert.equal(commandResult.started, true);
assert.ok(commandShortcuts.handlers.has("Escape"));
commands.handleRendererIdle(commandResult.sessionId);
assert.equal(commandShortcuts.handlers.has("Escape"), false);
commandShortcuts.handlers.get(DEFAULT_ACTIVATION_SHORTCUT)?.();
await delayForTest(400);

let pendingTargetResolve;
let pendingTargetReadCount = 0;
const pendingCommands = new PlaybackCommandController(
  store,
  commandPlayback,
  commandShortcuts,
  () => {
    pendingTargetReadCount += 1;
    return new Promise((resolve) => {
      pendingTargetResolve = () => resolve(selectedTextTargetInput("并发快捷键播放。"));
    });
  }
);
const pendingFirst = pendingCommands.startReadingTargetPlayback();
const pendingSecond = pendingCommands.startReadingTargetPlayback();
assert.equal(pendingTargetReadCount, 1);
pendingTargetResolve();
assert.equal((await pendingFirst).started, true);
assert.equal((await pendingSecond).started, true);
assert.equal(pendingTargetReadCount, 1);

commandTargetInput = clipboardTargetInput("第二次命令播放。");
const stoppedCommand = await commands.startReadingTargetPlayback();
assert.equal(stoppedCommand.started, true);
commands.stopPlayback();
assert.deepEqual(commandPlaybackEvents.at(-1), ["stop", stoppedCommand.sessionId]);
assert.equal(normalizeShortcutInput(" Command + Shift + R "), "Command+Shift+R");
assert.equal(normalizeShortcutInput(` ${DEFAULT_ACTIVATION_SHORTCUT.replaceAll("+", " + ")} `), DEFAULT_ACTIVATION_SHORTCUT);
assert.equal(normalizeShortcutInput("R"), undefined);
commandShortcuts.failures.add("Control+Shift+R");
const failedShortcut = commands.setActivationShortcut("Control+Shift+R");
assert.equal(failedShortcut.ok, false);
assert.equal(store.getSettings().activationShortcut, DEFAULT_ACTIVATION_SHORTCUT);
commandShortcuts.failures.clear();
const shortcutUpdate = commands.setActivationShortcut("Control+Shift+R");
assert.equal(shortcutUpdate.ok, true);
assert.equal(store.getSettings().activationShortcut, "Control+Shift+R");
store.clearReadingHistory();
const commandReplayRecord = store.saveOrReuseReadingHistoryRecord({
  text: "命令历史重播。",
  source: "selected_text",
  segments: createReadingSegments("命令历史重播。"),
  createdAt: 888_000
});
const commandReplayResult = await commands.startHistoryReplay(commandReplayRecord.id);
assert.equal(commandReplayResult.started, true);
assert.ok(commandShortcuts.handlers.has("Escape"));
assert.deepEqual(commandPlaybackEvents.at(-4), [
  "start",
  commandReplayResult.sessionId,
  false,
  PLAYBACK_FEEDBACK_SURFACES.historyDetail
]);
assert.deepEqual(commandPlaybackEvents.at(-3), ["chunk", commandReplayResult.sessionId, "171,205"]);
assert.equal(store.getReadingHistoryRecord(commandReplayRecord.id)?.text, "命令历史重播。");
commands.handleRendererIdle(commandReplayResult.sessionId);
assert.equal(commandShortcuts.handlers.has("Escape"), false);
const commandFavoriteReplayRecord = store.createFavoriteFromHistoryRecord(commandReplayRecord.id, 889_000);
assert.ok(commandFavoriteReplayRecord);
const commandFavoriteReplayResult = await commands.startFavoriteReplay(commandFavoriteReplayRecord.id);
assert.equal(commandFavoriteReplayResult.started, true);
assert.ok(commandShortcuts.handlers.has("Escape"));
assert.deepEqual(commandPlaybackEvents.at(-4), [
  "start",
  commandFavoriteReplayResult.sessionId,
  false,
  PLAYBACK_FEEDBACK_SURFACES.favoriteDetail
]);
assert.deepEqual(commandPlaybackEvents.at(-3), ["chunk", commandFavoriteReplayResult.sessionId, "171,205"]);
assert.equal(store.getFavoriteRecord(commandFavoriteReplayRecord.id)?.sourceCreatedAt, commandReplayRecord.createdAt);
commands.handleRendererIdle(commandFavoriteReplayResult.sessionId);
assert.equal(commandShortcuts.handlers.has("Escape"), false);

const failingPlayback = new PlaybackService(store, sink, async () => {
  throw new Error("MiniMax TTS failed with HTTP 500");
});
const failingPlaybackResult = await failingPlayback.playReadingTarget(clipboardTargetInput("这是一段会失败的文本。"));
assert.equal(failingPlaybackResult.started, true);
await failingPlayback.waitForCurrentSession();
assert.equal(store.getErrorLogCount(), 1);
assert.equal(store.listErrorLogs()[0]?.category, "minimax_runtime");
assert.equal(store.listReadingHistoryRecords().some((record) => record.text === "这是一段会失败的文本。"), true);
store.clearErrorLogs();

store.clearReadingHistory();
const replayRecord = store.saveOrReuseReadingHistoryRecord({
  text: "这是一条历史重播文本。",
  source: "selected_text",
  segments: createReadingSegments("这是一条历史重播文本。"),
  createdAt: 777_000
});
const replayEvents = [];
const replayPlayback = new PlaybackService(
  store,
  createPlaybackSinkForTest(replayEvents, (session) => [
    "start",
    session.sessionId,
    "target" in session,
    session.feedbackSurface,
  ]),
  async (request) => {
    assert.equal(request.text, "这是一条历史重播文本。");
    await request.onAudioHex("abcd");
  }
);
const replayResult = await replayPlayback.playHistoryRecord(replayRecord.id);
assert.equal(replayResult.started, true);
await replayPlayback.waitForCurrentSession();
assert.equal(store.getReadingHistoryCount(), 1);
assert.equal(store.getReadingHistoryRecord(replayRecord.id)?.createdAt, 777_000);
assert.deepEqual(replayEvents[0], [
  "start",
  replayResult.sessionId,
  false,
  PLAYBACK_FEEDBACK_SURFACES.historyDetail
]);
const missingReplay = await replayPlayback.playHistoryRecord("missing-record");
assert.equal(missingReplay.started, false);
assert.equal(missingReplay.skipped, "missing_history_record");

const favoriteReplaySource = store.saveOrReuseReadingHistoryRecord({
  text: "这是一条收藏重播文本。",
  source: "clipboard",
  segments: createReadingSegments("这是一条收藏重播文本。"),
  createdAt: 778_000
});
const favoriteReplayRecord = store.createFavoriteFromHistoryRecord(favoriteReplaySource.id, 779_000);
assert.ok(favoriteReplayRecord);
const favoriteReplayEvents = [];
const favoriteReplayPlayback = new PlaybackService(
  store,
  createPlaybackSinkForTest(favoriteReplayEvents, (session) => [
    "start",
    session.sessionId,
    "target" in session,
    session.feedbackSurface
  ]),
  async (request) => {
    assert.equal(request.text, "这是一条收藏重播文本。");
    assert.equal(request.apiKey, "playback-key");
    assert.equal(request.voiceId, "voice-zh");
    await request.onAudioHex("abcd");
  }
);
const historyCountBeforeFavoriteReplay = store.getReadingHistoryCount();
const favoriteReplayResult = await favoriteReplayPlayback.playFavoriteRecord(favoriteReplayRecord.id);
assert.equal(favoriteReplayResult.started, true);
await favoriteReplayPlayback.waitForCurrentSession();
assert.equal(store.getReadingHistoryCount(), historyCountBeforeFavoriteReplay);
assert.equal(store.getFavoriteRecord(favoriteReplayRecord.id)?.favoritedAt, 779_000);
assert.equal(store.getFavoriteRecord(favoriteReplayRecord.id)?.sourceCreatedAt, 778_000);
assert.deepEqual(favoriteReplayEvents[0], [
  "start",
  favoriteReplayResult.sessionId,
  false,
  PLAYBACK_FEEDBACK_SURFACES.favoriteDetail
]);
const missingFavoriteReplay = await favoriteReplayPlayback.playFavoriteRecord("missing-favorite-record");
assert.equal(missingFavoriteReplay.started, false);
assert.equal(missingFavoriteReplay.skipped, "missing_favorite_record");

const { overlaySink, overlayActions, sentPlaybackMessages } = createElectronAudioSinkScenario();
overlaySink.startSession(createOverlayPlaybackSessionForTest(101));
assert.deepEqual(overlayActions, ["show"]);
assert.deepEqual(sentPlaybackMessages.at(-1), ["playback:start-session", 101, false]);
overlaySink.finishSession(101);
assert.deepEqual(overlayActions, ["show"]);
assert.deepEqual(sentPlaybackMessages.at(-1), ["playback:finish-session", 101]);
overlaySink.stopSession(101);
assert.deepEqual(overlayActions, ["show", "stop"]);
assert.deepEqual(sentPlaybackMessages.at(-1), ["playback:stop-session", 101]);

const rendererIdleScenario = createElectronAudioSinkScenario();
rendererIdleScenario.overlaySink.startSession(createOverlayPlaybackSessionForTest(102));
assert.deepEqual(rendererIdleScenario.overlayActions, ["show"]);
rendererIdleScenario.overlaySink.finishSession(102);
rendererIdleScenario.overlaySink.handleRendererIdle(102);
rendererIdleScenario.overlaySink.stopSession(102);
assert.deepEqual(rendererIdleScenario.overlayActions, ["show"]);
assert.deepEqual(rendererIdleScenario.sentPlaybackMessages.at(-1), ["playback:stop-session", 102]);

const failureScenario = createElectronAudioSinkScenario();
failureScenario.overlaySink.startSession(createOverlayPlaybackSessionForTest(106));
failureScenario.overlaySink.failSession(106);
assert.deepEqual(failureScenario.overlayActions, ["show", "fail"]);
assert.deepEqual(failureScenario.sentPlaybackMessages.at(-1), ["playback:fail-session", 106]);

const replacementScenario = createElectronAudioSinkScenario();
replacementScenario.overlaySink.startSession(createOverlayPlaybackSessionForTest(107));
replacementScenario.overlaySink.finishSession(107);
replacementScenario.overlaySink.startSession(createHistoryReplaySessionForTest(108));
assert.deepEqual(replacementScenario.overlayActions, ["show", "stop"]);
assert.deepEqual(replacementScenario.sentPlaybackMessages.at(-1), ["playback:start-session", 108, false]);
replacementScenario.overlaySink.stopSession(107);
assert.deepEqual(replacementScenario.overlayActions, ["show", "stop"]);

const historySinkScenario = createElectronAudioSinkScenario();
historySinkScenario.overlaySink.startSession(createHistoryReplaySessionForTest(104));
assert.deepEqual(historySinkScenario.overlayActions, []);
assert.deepEqual(historySinkScenario.sentPlaybackMessages.at(-1), ["playback:start-session", 104, false]);
historySinkScenario.overlaySink.finishSession(104);
assert.deepEqual(historySinkScenario.overlayActions, []);
assert.deepEqual(historySinkScenario.sentPlaybackMessages.at(-1), ["playback:finish-session", 104]);
historySinkScenario.overlaySink.stopSession(104);
assert.deepEqual(historySinkScenario.overlayActions, []);
assert.deepEqual(historySinkScenario.sentPlaybackMessages.at(-1), ["playback:stop-session", 104]);

const favoriteSinkScenario = createElectronAudioSinkScenario();
favoriteSinkScenario.overlaySink.startSession(createFavoriteReplaySessionForTest(109));
assert.deepEqual(favoriteSinkScenario.overlayActions, []);
assert.deepEqual(favoriteSinkScenario.sentPlaybackMessages.at(-1), ["playback:start-session", 109, false]);
favoriteSinkScenario.overlaySink.finishSession(109);
assert.deepEqual(favoriteSinkScenario.overlayActions, []);
assert.deepEqual(favoriteSinkScenario.sentPlaybackMessages.at(-1), ["playback:finish-session", 109]);

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

await withPlaybackAudioQueueScenario(async ({ overlayQueue, overlayQueueEvents }) => {
  overlayQueue.startSession(createOverlayPlaybackSessionForTest(201));
  overlayQueue.finishSession(201);
  await flushPlaybackMicrotasks();
  assert.deepEqual(overlayQueueEvents, [
    ["metric", 0, 1],
    ["finish-overlay"],
    ["idle", 201]
  ]);
});

await withPlaybackAudioQueueScenario(async ({ overlayQueue, overlayQueueEvents }) => {
  overlayQueue.startSession(createHistoryReplaySessionForTest(202));
  overlayQueue.finishSession(202);
  await flushPlaybackMicrotasks();
  assert.deepEqual(overlayQueueEvents, [["idle", 202]]);
});

await withPlaybackAudioQueueScenario(async ({ overlayQueue, overlayQueueEvents, animationFrames, playedAudios }) => {
  overlayQueue.startSession(createOverlayPlaybackSessionForTest(203));
  overlayQueue.pushChunk(203, new Uint8Array([1, 2, 3]));
  overlayQueue.endSegment(203);
  overlayQueue.finishSession(203);
  await flushPlaybackMicrotasks();
  await flushPlaybackMicrotasks();
  const lastAudio = playedAudios.at(-1);
  assert.equal(lastAudio?.src, "blob:voice-reader-test");
  animationFrames.shift()();
  assert.equal(hasOverlayEvent(overlayQueueEvents, "metric", (event) => event[1] > 0), true);
  assert.equal(hasOverlayEvent(overlayQueueEvents, "finish-overlay"), false);
  lastAudio.listeners.ended();
  await flushPlaybackMicrotasks();
  await flushPlaybackMicrotasks();
  assert.equal(hasOverlayEvent(overlayQueueEvents, "finish-overlay"), true);
  assert.equal(hasOverlayEvent(overlayQueueEvents, "idle", (event) => event[1] === 203), true);
});

await withPlaybackAudioQueueScenario(async ({ overlayQueue, overlayQueueEvents, animationFrames }) => {
  overlayQueue.startSession(createHistoryReplaySessionForTest(204));
  overlayQueue.pushChunk(204, new Uint8Array([4, 5, 6]));
  overlayQueue.endSegment(204);
  await flushPlaybackMicrotasks();
  await flushPlaybackMicrotasks();
  assert.equal(animationFrames.length, 0);
  assert.deepEqual(overlayQueueEvents, []);
  overlayQueue.stop();
});

await withPlaybackAudioQueueScenario(async ({ overlayQueue, overlayQueueEvents, animationFrames }) => {
  overlayQueue.startSession(createFavoriteReplaySessionForTest(206));
  overlayQueue.pushChunk(206, new Uint8Array([7, 8, 9]));
  overlayQueue.endSegment(206);
  await flushPlaybackMicrotasks();
  await flushPlaybackMicrotasks();
  assert.equal(animationFrames.length, 0);
  assert.deepEqual(overlayQueueEvents, []);
  overlayQueue.stop();
});

await withPlaybackAudioQueueScenario(async ({ overlayQueue, overlayQueueEvents, animationFrames, playedAudios }) => {
  overlayQueue.startSession(createPlaybackSessionForTest(205, PLAYBACK_FEEDBACK_SURFACES.playbackOverlay, [9, 1]));
  overlayQueue.pushChunk(205, new Uint8Array([1]));
  overlayQueue.endSegment(205);
  overlayQueue.pushChunk(205, new Uint8Array([2]));
  overlayQueue.endSegment(205);
  overlayQueue.finishSession(205);
  await flushPlaybackMicrotasks();
  await flushPlaybackMicrotasks();
  const firstAudio = playedAudios.at(-1);
  animationFrames.shift()();
  const firstMetric = overlayQueueEvents.find((event) => event[0] === "metric");
  assert.equal(firstMetric[2] > 0.4 && firstMetric[2] < 0.5, true);
  firstAudio.listeners.ended();
  await flushPlaybackMicrotasks();
  await flushPlaybackMicrotasks();
  const secondAudio = playedAudios.at(-1);
  const metricCountBeforeSecondSegment = overlayQueueEvents.filter((event) => event[0] === "metric").length;
  while (
    animationFrames.length &&
    overlayQueueEvents.filter((event) => event[0] === "metric").length === metricCountBeforeSecondSegment
  ) {
    animationFrames.shift()();
  }
  const secondMetric = overlayQueueEvents.filter((event) => event[0] === "metric").at(-1);
  assert.equal(secondMetric[2] > 0.9 && secondMetric[2] < 1, true);
  secondAudio.listeners.ended();
  await flushPlaybackMicrotasks();
  await flushPlaybackMicrotasks();
});

let firstStreamAborted = false;
let streamCall = 0;
const replacementPlayback = new PlaybackService(store, sink, async (request) => {
  streamCall += 1;
  if (streamCall === 1) {
    await new Promise((resolve) => {
      request.signal.addEventListener(
        "abort",
        () => {
          firstStreamAborted = true;
          resolve(undefined);
        },
        { once: true }
      );
    });
    return;
  }
  await request.onAudioHex("ef01");
});
const firstReplacement = await replacementPlayback.playReadingTarget(clipboardTargetInput("第一段文本。"));
assert.equal(firstReplacement.started, true);
const secondReplacement = await replacementPlayback.playReadingTarget(selectedTextTargetInput("第二段文本。"));
assert.equal(secondReplacement.started, true);
await replacementPlayback.waitForCurrentSession();
assert.equal(firstStreamAborted, true);
assert.equal(playbackEvents.some((event) => event[0] === "stop" && event[1] === firstReplacement.sessionId), true);
store.close();

console.log("Core tests passed.");

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

function clipboardTargetInput(text) {
  return { text, source: "clipboard" };
}

function selectedTextTargetInput(text) {
  return { text, source: "selected_text" };
}

function createFavoriteRecordForTest(id, favoritedAt, text) {
  return {
    id,
    favoritedAt,
    sourceCreatedAt: favoritedAt - 1000,
    text,
    preview: text,
    durationEstimateSeconds: 60,
    languageSummary: "中文",
    source: "clipboard"
  };
}

function favoriteIds(store) {
  return store.listFavoriteRecords().map((record) => record.id);
}

function hasFavorite(store, id, matches = () => true) {
  return store.listFavoriteRecords().some((record) => record.id === id && matches(record));
}

function assertReadingHistoryContains(store, expected) {
  assert.equal(store.getReadingHistoryCount(), expected.count);
  assert.equal(
    store
      .listReadingHistoryRecords()
      .some((record) => record.text === expected.text && record.source === expected.source),
    true
  );
}

function createShortcutRegistryForTest() {
  return {
    handlers: new Map(),
    failures: new Set(),
    register(shortcut, callback) {
      if (this.failures.has(shortcut)) return false;
      this.handlers.set(shortcut, callback);
      return true;
    },
    unregister(shortcut) {
      this.handlers.delete(shortcut);
    }
  };
}

function delayForTest(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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
  assertIncludes(overlaySource, [
    "DRAG_HOLD_MS",
    "setPointerCapture",
    "hasLongPressActivated",
    "cancelDrag();\n      setState",
    "moveOverlayBy"
  ]);
  assertIncludes(overlayCss, ["cursor: grab", ".overlay-root.is-dragging .overlay-pill"]);
  assertIncludes(playbackOverlayControllerSource, ["moveBy(delta", "manualPosition", "constrainOverlayPosition"]);
  assertIncludes(appContractsSource, ["OverlayDragDelta", "moveOverlayBy"]);
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
        if (channel === "playback:start-session") {
          sentPlaybackMessages.push([channel, payload?.sessionId, hasReadingTargetPayload(payload)]);
          return;
        }
        sentPlaybackMessages.push([channel, payload?.sessionId]);
      }
    }
  };
}

async function flushPlaybackMicrotasks() {
  for (let index = 0; index < 4; index += 1) {
    await Promise.resolve();
  }
}

async function withPlaybackAudioQueueScenario(runTest) {
  const browserFakes = installPlaybackAudioQueueBrowserFakes();
  const overlayQueue = new PlaybackAudioQueue();
  try {
    await runTest({ ...browserFakes, overlayQueue });
  } finally {
    overlayQueue.stop();
    browserFakes.restore();
  }
}

function hasOverlayEvent(events, eventName, matches = () => true) {
  return events.some((event) => event[0] === eventName && matches(event));
}

function installPlaybackAudioQueueBrowserFakes() {
  const restoreCallbacks = [];
  const overlayQueueEvents = [];
  const animationFrames = [];
  const playedAudios = [];

  replaceProperty(restoreCallbacks, globalThis, "window", {
    voiceReader: {
      sendOverlayMetric(metric) {
        overlayQueueEvents.push(["metric", metric.amplitude, metric.progress]);
        return Promise.resolve();
      },
      finishOverlayPlayback() {
        overlayQueueEvents.push(["finish-overlay"]);
        return Promise.resolve();
      },
      notifyPlaybackIdle(sessionId) {
        overlayQueueEvents.push(["idle", sessionId]);
        return Promise.resolve();
      }
    },
    AudioContext: class {
      destination = {};
      createMediaElementSource() {
        return { connect() {} };
      }
      createAnalyser() {
        return {
          fftSize: 0,
          frequencyBinCount: 4,
          connect() {},
          getByteTimeDomainData(data) {
            data.fill(255);
          }
        };
      }
      close() {
        return Promise.resolve();
      }
    },
    requestAnimationFrame(callback) {
      animationFrames.push(callback);
      return animationFrames.length;
    },
    cancelAnimationFrame() {}
  });
  replaceProperty(
    restoreCallbacks,
    globalThis,
    "Audio",
    class {
      currentTime = 0.5;
      duration = 1;
      listeners = {};
      playbackRate = 1;
      src = "";

      constructor(url) {
        this.src = url;
        playedAudios.push(this);
      }

      addEventListener(eventName, callback) {
        this.listeners[eventName] = callback;
      }

      play() {
        return Promise.resolve();
      }

      pause() {}
    }
  );
  replaceProperty(restoreCallbacks, globalThis, "performance", { now: () => 100 });
  replaceProperty(restoreCallbacks, URL, "createObjectURL", () => "blob:voice-reader-test");
  replaceProperty(restoreCallbacks, URL, "revokeObjectURL", () => {});

  return {
    overlayQueueEvents,
    animationFrames,
    playedAudios,
    restore() {
      for (const restore of restoreCallbacks.reverse()) restore();
    }
  };
}

function replaceProperty(restoreCallbacks, object, key, value) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  Object.defineProperty(object, key, {
    configurable: true,
    value
  });
  restoreCallbacks.push(() => {
    if (descriptor) {
      Object.defineProperty(object, key, descriptor);
    } else {
      delete object[key];
    }
  });
}

function createPlaybackSinkForTest(events, startEvent = (session) => [
  "start",
  session.sessionId,
  hasReadingTargetPayload(session),
  session.feedbackSurface
]) {
  return {
    startSession(session) {
      events.push(startEvent(session));
    },
    audioChunk(sessionId, bytes) {
      events.push(["chunk", sessionId, Array.from(bytes).join(",")]);
    },
    endSegment(sessionId) {
      events.push(["segment-end", sessionId]);
    },
    finishSession(sessionId) {
      events.push(["finish", sessionId]);
    },
    failSession(sessionId) {
      events.push(["fail", sessionId]);
    },
    stopSession(sessionId) {
      events.push(["stop", sessionId]);
    }
  };
}

function hasReadingTargetPayload(payload) {
  return Boolean(payload && typeof payload === "object" && "target" in payload);
}

function createReadingTargetAcquirerForTest(options = {}) {
  return new ReadingTargetAcquirer({
    clipboard: options.clipboard ?? createClipboardForReadingTargetTest(),
    errorLog: options.errorLog ?? {
      addErrorLog: () => assert.fail("Reading Target acquisition should not log an error")
    },
    hidePreviousAppForSelectionCapture: options.hidePreviousAppForSelectionCapture ?? (() => undefined),
    loadSelectionCopyAddon: options.loadSelectionCopyAddon,
    createMarker: options.createMarker,
    delay: async () => undefined
  });
}

function createClipboardForReadingTargetTest(initial = {}) {
  const image = initial.image ?? { isEmpty: () => true };
  let state = {
    text: initial.text ?? "",
    html: initial.html ?? "",
    rtf: initial.rtf ?? "",
    image
  };

  return {
    readText: () => state.text,
    readHTML: () => state.html,
    readRTF: () => state.rtf,
    readImage: () => state.image,
    writeText(text) {
      state = { text, html: "", rtf: "", image: { isEmpty: () => true } };
    },
    clear() {
      state = { text: "", html: "", rtf: "", image: { isEmpty: () => true } };
    },
    write(next) {
      state = {
        text: next.text ?? "",
        html: next.html ?? "",
        rtf: next.rtf ?? "",
        image: next.image ?? { isEmpty: () => true }
      };
    },
    snapshot() {
      return {
        text: state.text,
        html: state.html,
        rtf: state.rtf,
        hasImage: !state.image.isEmpty()
      };
    }
  };
}
