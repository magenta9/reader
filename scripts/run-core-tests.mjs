import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

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
const { PlaybackService } = await import("../dist/main/playback/playback-service.js");
const { ElectronAudioSink } = await import("../dist/main/playback/electron-audio-sink.js");

assert.equal(existsSync(new URL("../dist/main/main.js", import.meta.url)), true);
assert.equal(existsSync(new URL("../dist/shared/app-contracts.js", import.meta.url)), true);
assert.equal(existsSync(new URL("../dist/preload/preload.cjs", import.meta.url)), true);
assert.equal(existsSync(new URL("../dist/preload/preload.js", import.meta.url)), false);
assert.equal(existsSync(new URL("../dist/renderer/index.html", import.meta.url)), true);
assert.equal(existsSync(new URL("../dist/renderer/renderer.js", import.meta.url)), true);
assert.equal(existsSync(new URL("../dist/renderer/renderer.css", import.meta.url)), true);
assert.equal(existsSync(new URL("../dist/overlay/index.html", import.meta.url)), true);
assert.equal(existsSync(new URL("../dist/overlay/overlay.js", import.meta.url)), true);
assert.equal(existsSync(new URL("../dist/overlay/overlay.css", import.meta.url)), true);

const mainBundle = await readFile(new URL("../dist/main/main.js", import.meta.url), "utf8");
const appContractsBundle = await readFile(new URL("../dist/shared/app-contracts.js", import.meta.url), "utf8");
const preloadBundle = await readFile(new URL("../dist/preload/preload.cjs", import.meta.url), "utf8");
const rendererHtml = await readFile(new URL("../dist/renderer/index.html", import.meta.url), "utf8");
const rendererBundle = await readFile(new URL("../dist/renderer/renderer.js", import.meta.url), "utf8");
const overlayHtml = await readFile(new URL("../dist/overlay/index.html", import.meta.url), "utf8");
const overlayBundle = await readFile(new URL("../dist/overlay/overlay.js", import.meta.url), "utf8");
const overlayCss = await readFile(new URL("../dist/overlay/overlay.css", import.meta.url), "utf8");
const rendererSource = await readFile(new URL("../src/renderer/main.tsx", import.meta.url), "utf8");
const rendererCssSource = await readFile(new URL("../src/renderer/styles.css", import.meta.url), "utf8");
const packageScript = await readFile(new URL("../scripts/package-mac.mjs", import.meta.url), "utf8");
assert.equal(mainBundle.includes("VoiceReader"), true);
assert.equal(mainBundle.includes("\\u64AD\\u653E"), true);
assert.equal(mainBundle.includes("\\u6253\\u5F00 VoiceReader"), true);
assert.equal(mainBundle.includes("\\u5386\\u53F2\\u8BB0\\u5F55"), true);
assert.equal(mainBundle.includes("\\u8BBE\\u7F6E"), true);
assert.equal(mainBundle.includes("width: 1100"), true);
assert.equal(mainBundle.includes("height: 760"), true);
assert.equal(mainBundle.includes("minWidth: 900"), true);
assert.equal(mainBundle.includes("minHeight: 620"), true);
assert.equal(mainBundle.includes("../preload/preload.cjs"), true);
assert.equal(mainBundle.includes("setPath") && mainBundle.includes("userData"), true);
assert.equal(mainBundle.includes("shouldOpenWindowAtStartup"), true);
assert.equal(mainBundle.includes("wasOpenedAtLogin"), true);
assert.equal(mainBundle.includes('app.on("activate"'), true);
assert.equal(mainBundle.includes('readerWindow.on("close"'), true);
assert.equal(mainBundle.includes("event.preventDefault()"), true);
assert.equal(mainBundle.includes("readerWindow?.hide()"), true);
assert.equal(mainBundle.includes('openReaderWindow("history")'), true);
assert.equal(mainBundle.includes('openReaderWindow("settings")'), true);
assert.equal(mainBundle.includes("showInactive"), true);
assert.equal(mainBundle.includes("focusable: false") || mainBundle.includes("focusable: !1"), true);
assert.equal(mainBundle.includes("setAlwaysOnTop"), true);
assert.equal(mainBundle.includes("moveTop"), true);
assert.equal(mainBundle.includes("skipTransformProcessType"), true);
assert.equal(mainBundle.includes("getPrimaryDisplay"), true);
assert.equal(mainBundle.includes("setPosition"), true);
assert.equal(mainBundle.includes("../preload/preload.js"), false);
assert.equal(mainBundle.includes("overlay:metric"), true);
assert.equal(mainBundle.includes("overlay:finish-playback"), true);
assert.equal(mainBundle.includes("playback:renderer-idle"), true);
assert.equal(mainBundle.includes("stopCurrentPlayback"), true);
assert.equal(mainBundle.includes("stopSession"), true);
assert.equal(mainBundle.includes("app-data:set-activation-shortcut"), true);
assert.equal(mainBundle.includes("readSelectedTextOrClipboardText"), true);
assert.equal(mainBundle.includes("/usr/bin/osascript"), true);
assert.equal(mainBundle.includes("System Events"), true);
assert.equal(mainBundle.includes("__dirname"), false);
assert.equal(mainBundle.includes("import.meta.url"), true);
assert.equal(appContractsBundle.includes("export {};"), true);
assert.equal(preloadBundle.includes("../renderer/bridge"), false);
const bootstrapIndex = mainBundle.indexOf("async function bootstrap");
const whenReadyIndex = mainBundle.indexOf("await app.whenReady()");
assert.equal(bootstrapIndex >= 0 && whenReadyIndex > bootstrapIndex, true);
assert.equal(rendererHtml.includes("manifest.json"), false);
assert.equal(rendererHtml.includes("VoiceReader"), true);
assert.equal(rendererHtml.includes("media-src 'self' blob:"), true);
assert.equal(rendererBundle.includes("\\u4E3B\\u9875"), true);
assert.equal(rendererBundle.includes("\\u5386\\u53F2\\u8BB0\\u5F55"), true);
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
assert.equal(rendererBundle.includes("Clipboard") && rendererBundle.includes("history:"), true);
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
  "历史全文只保存在本机，不保存音频；当前朗读文本会发送给 MiniMax 生成语音。",
  "Error Log"
]) {
  assert.equal(rendererSource.includes(label), true);
}
assert.equal(rendererSource.includes("选择文本优先"), true);
assert.equal(rendererSource.includes("播放当前选择文本或剪切板"), true);
assert.equal(rendererCssSource.includes("prefers-color-scheme: dark"), true);
assert.equal(rendererCssSource.includes("grid-template-columns: repeat(2"), true);
assert.equal(rendererCssSource.includes(".shortcut-recorder"), true);
assert.equal(rendererCssSource.includes(".range-control"), true);
assert.equal(overlayHtml.includes("manifest.json"), false);
assert.equal(overlayHtml.includes("VoiceReader Overlay"), true);
assert.equal(overlayHtml.includes('<link rel="stylesheet" href="./overlay.css"'), true);
assert.equal(overlayBundle.includes("onOverlayShow"), true);
assert.equal(overlayBundle.includes("onOverlayMetric"), true);
assert.equal(overlayBundle.includes("stopPlayback"), true);
assert.equal(overlayBundle.includes("viewBox"), true);
assert.equal(overlayBundle.includes("×") || overlayBundle.includes("\\xD7"), false);
assert.equal(overlayBundle.includes("播放"), false);
assert.equal(overlayCss.includes(".overlay-pill:hover .hover-progress"), true);
assert.equal(overlayBundle.includes("scaleY"), true);
assert.equal(overlayCss.includes("transparent"), true);
assert.equal(overlayCss.includes("prefers-reduced-motion"), true);
assert.equal(packageScript.includes("dereference: true"), false);
assert.equal(packageScript.includes("verbatimSymlinks: true"), true);
assert.equal(packageScript.includes("default_app.asar"), true);
assert.equal(packageScript.includes("/usr/bin/codesign"), true);
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

const chineseSentence = `这是一句用于验证中文分段边界的长句子，它需要在自然标点处切分，而不是在句子的中间被硬切断。`;
const chineseSegments = createReadingSegments(Array.from({ length: 30 }, () => chineseSentence).join(""));
assert.ok(chineseSegments.length > 1);
assert.ok(chineseSegments.every((segment) => segment.text.length <= 900));
assert.ok(chineseSegments.every((segment) => segment.text.endsWith("。")));
assert.ok(chineseSegments.every((segment) => segment.language === "zh"));

const unpunctuatedSegments = createReadingSegments("长".repeat(1900));
assert.ok(unpunctuatedSegments.length > 1);
assert.ok(unpunctuatedSegments.every((segment) => segment.text.length <= 900));

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
  segments: historyRecordSegments,
  createdAt: 123_456
});
assert.equal(recordFromInput.createdAt, 123_456);
assert.equal(recordFromInput.preview, "第一行会作为预览。");
assert.equal(recordFromInput.languageSummary, "中文 / 英文 / 未知");
assert.equal(recordFromInput.source, "clipboard");
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
const cipher = {
  encryptString(value) {
    return Buffer.from(`encrypted:${value}`, "utf8");
  },
  decryptString(value) {
    return Buffer.from(value).toString("utf8").replace(/^encrypted:/, "");
  }
};
const store = new AppDataStore(join(dataDir, "voicereader.sqlite"), cipher);
const dbPath = join(dataDir, "voicereader.sqlite");
assert.equal(existsSync(dbPath), true);
const schemaDb = new DatabaseSync(dbPath);
const tables = schemaDb
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
  .all()
  .map((row) => String(row.name));
assert.ok(tables.includes("settings"));
assert.ok(tables.includes("reading_history"));
assert.ok(tables.includes("error_log"));
schemaDb.close();

assert.deepEqual(store.getSettings().activationShortcut, "Command+Shift+R");
assert.equal(store.getSettings().historyRetention, "1m");

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
  segments: historySegments,
  createdAt: 10_000_000 + 4 * 60 * 1000
});
assert.equal(historyReuse.id, historyA.id);
assert.equal(store.getReadingHistoryCount(), 1);

const historyB = store.saveOrReuseReadingHistoryRecord({
  text: "第一段中文文本。\n\nSecond English paragraph for duration.",
  segments: historySegments,
  createdAt: 10_000_000 + 6 * 60 * 1000
});
assert.notEqual(historyB.id, historyA.id);
assert.equal(store.getReadingHistoryCount(), 2);

store.updateSettings({ historyRetention: "7d" });
store.saveOrReuseReadingHistoryRecord({
  text: "旧记录",
  segments: createReadingSegments("旧记录"),
  createdAt: 1
});
store.cleanupExpiredReadingHistory(8 * 24 * 60 * 60 * 1000 + 2, "7d");
assert.equal(store.listReadingHistoryRecords().some((record) => record.text === "旧记录"), false);

store.updateSettings({ historyRetention: "forever" });
store.saveOrReuseReadingHistoryRecord({
  text: "永久保留记录",
  segments: createReadingSegments("永久保留记录"),
  createdAt: 2
});
store.cleanupExpiredReadingHistory(365 * 24 * 60 * 60 * 1000, "forever");
assert.equal(store.listReadingHistoryRecords().some((record) => record.text === "永久保留记录"), true);
store.clearReadingHistory();
assert.equal(store.getReadingHistoryCount(), 0);
const deleteA = store.saveOrReuseReadingHistoryRecord({
  text: "待删除记录 A",
  segments: createReadingSegments("待删除记录 A"),
  createdAt: 20_000
});
const deleteB = store.saveOrReuseReadingHistoryRecord({
  text: "待删除记录 B",
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

store.saveEncryptedMiniMaxApiKey("secret-minimax-key");
assert.equal(store.hasMiniMaxApiKey(), true);
assert.equal(store.readMiniMaxApiKey(), "secret-minimax-key");
assert.equal(store.getRawSettingForTest("minimax.apiKey.encrypted")?.includes("secret-minimax-key"), false);
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

store.saveEncryptedMiniMaxApiKey("valid-key");
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

store.saveEncryptedMiniMaxApiKey("bad-key");
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
const sink = {
  startSession(session) {
    playbackEvents.push(["start", session.sessionId, session.target.source, session.speechRate]);
  },
  audioChunk(sessionId, bytes) {
    playbackEvents.push(["chunk", sessionId, Array.from(bytes).join(",")]);
  },
  endSegment(sessionId) {
    playbackEvents.push(["segment-end", sessionId]);
  },
  finishSession(sessionId) {
    playbackEvents.push(["finish", sessionId]);
  },
  failSession(sessionId) {
    playbackEvents.push(["fail", sessionId]);
  },
  stopSession(sessionId) {
    playbackEvents.push(["stop", sessionId]);
  }
};

store.updateSettings({
  apiKeyStatus: "verified",
  voices: [zhVoice],
  preferredVoicesByLanguage: { zh: "voice-zh" },
  speechRate: 1.5
});
store.saveEncryptedMiniMaxApiKey("playback-key");
store.updateSettings({ apiKeyStatus: "verified" });

const playback = new PlaybackService(store, sink, async (request) => {
  assert.equal(request.apiKey, "playback-key");
  assert.equal(request.voiceId, "voice-zh");
  assert.equal(store.getReadingHistoryCount(), 1);
  assert.equal(store.listReadingHistoryRecords()[0]?.text, "这是一段剪切板文本。");
  await request.onAudioHex("abcd");
});
const playbackResult = await playback.playClipboardText("  这是一段剪切板文本。  ");
assert.equal(playbackResult.started, true);
await playback.waitForCurrentSession();
assert.deepEqual(playbackEvents.slice(-4), [
  ["start", playbackResult.sessionId, "clipboard", 1.5],
  ["chunk", playbackResult.sessionId, "171,205"],
  ["segment-end", playbackResult.sessionId],
  ["finish", playbackResult.sessionId]
]);
playback.stopSession(playbackResult.sessionId);
assert.deepEqual(playbackEvents.at(-1), ["stop", playbackResult.sessionId]);
assert.equal(store.getReadingHistoryCount(), 1);

const duplicatePlayback = await playback.playClipboardText("这是一段剪切板文本。");
assert.equal(duplicatePlayback.started, true);
await playback.waitForCurrentSession();
assert.equal(store.getReadingHistoryCount(), 1);

store.updateSettings({ apiKeyStatus: "missing" });
const missingPlaybackKey = await playback.playClipboardText("text");
assert.equal(missingPlaybackKey.started, false);
assert.equal(missingPlaybackKey.skipped, "unverified_api_key");
assert.equal(store.getErrorLogCount(), 0);

store.updateSettings({ apiKeyStatus: "verified", voices: [] });
const missingVoice = await playback.playClipboardText("text");
assert.equal(missingVoice.started, false);
assert.equal(missingVoice.skipped, "missing_voice");
assert.equal(store.getErrorLogCount(), 0);

store.updateSettings({ voices: [zhVoice], preferredVoicesByLanguage: { zh: "voice-zh" } });
const failingPlayback = new PlaybackService(store, sink, async () => {
  throw new Error("MiniMax TTS failed with HTTP 500");
});
const failingPlaybackResult = await failingPlayback.playClipboardText("这是一段会失败的文本。");
assert.equal(failingPlaybackResult.started, true);
await failingPlayback.waitForCurrentSession();
assert.equal(store.getErrorLogCount(), 1);
assert.equal(store.listErrorLogs()[0]?.category, "minimax_runtime");
assert.equal(store.listReadingHistoryRecords().some((record) => record.text === "这是一段会失败的文本。"), true);
store.clearErrorLogs();

store.clearReadingHistory();
const replayRecord = store.saveOrReuseReadingHistoryRecord({
  text: "这是一条历史重播文本。",
  segments: createReadingSegments("这是一条历史重播文本。"),
  createdAt: 777_000
});
const replayEvents = [];
const replayPlayback = new PlaybackService(
  store,
  {
    startSession(session) {
      replayEvents.push(["start", session.target.title, session.target.url]);
    },
    audioChunk(sessionId, bytes) {
      replayEvents.push(["chunk", sessionId, Array.from(bytes).join(",")]);
    },
    endSegment(sessionId) {
      replayEvents.push(["segment-end", sessionId]);
    },
    finishSession(sessionId) {
      replayEvents.push(["finish", sessionId]);
    },
    failSession(sessionId) {
      replayEvents.push(["fail", sessionId]);
    },
    stopSession(sessionId) {
      replayEvents.push(["stop", sessionId]);
    }
  },
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
assert.deepEqual(replayEvents[0], ["start", "History Replay", `history:${replayRecord.id}`]);
const missingReplay = await replayPlayback.playHistoryRecord("missing-record");
assert.equal(missingReplay.started, false);
assert.equal(missingReplay.skipped, "missing_history_record");

const overlayActions = [];
const sentPlaybackMessages = [];
const overlaySink = new ElectronAudioSink(
  () => ({
    isDestroyed: () => false,
    webContents: {
      send(channel, payload) {
        sentPlaybackMessages.push([channel, payload?.target?.title ?? payload?.sessionId]);
      }
    }
  }),
  {
    show() {
      overlayActions.push("show");
    },
    finish() {
      overlayActions.push("finish");
    },
    fail() {
      overlayActions.push("fail");
    },
    stop() {
      overlayActions.push("stop");
    }
  }
);
overlaySink.startSession({
  sessionId: 101,
  speechRate: 1,
  target: {
    title: "Clipboard",
    url: "",
    source: "clipboard",
    text: "剪切板播放",
    segments: []
  }
});
assert.deepEqual(overlayActions, ["show"]);
assert.deepEqual(sentPlaybackMessages.at(-1), ["playback:start-session", "Clipboard"]);
overlaySink.finishSession(101);
assert.deepEqual(overlayActions, ["show"]);
assert.deepEqual(sentPlaybackMessages.at(-1), ["playback:finish-session", 101]);
overlaySink.startSession({
  sessionId: 102,
  speechRate: 1,
  target: {
    title: "History Replay",
    url: "history:record-id",
    source: "clipboard",
    text: "历史重播",
    segments: []
  }
});
assert.deepEqual(overlayActions, ["show"]);
assert.deepEqual(sentPlaybackMessages.at(-1), ["playback:start-session", "History Replay"]);
overlaySink.stopSession(102);
assert.deepEqual(overlayActions, ["show", "stop"]);

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
const firstReplacement = await replacementPlayback.playClipboardText("第一段文本。");
assert.equal(firstReplacement.started, true);
const secondReplacement = await replacementPlayback.playClipboardText("第二段文本。");
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
