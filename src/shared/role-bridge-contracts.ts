import type {
  AppDataBridge,
  AppShellBridge,
  ClipboardBridge,
  PlaybackControlBridge,
  PlaybackFeedbackBridge,
  PlaybackOverlayBridge,
  PlaybackRendererBridge,
  ReaderWindowRuntimeBridge
} from "./bridge-contracts.js";
import {
  APP_DATA_CHANNELS,
  APP_SHELL_CHANNELS,
  CLIPBOARD_CHANNELS,
  PLAYBACK_CONTROL_CHANNELS,
  PLAYBACK_FEEDBACK_CHANNELS,
  PLAYBACK_OVERLAY_COMMAND_CHANNELS,
  PLAYBACK_OVERLAY_EVENT_CHANNELS,
  RENDERER_AUDIO_CHANNELS
} from "./bridge-contracts.js";
import {
  defineRoleBridgeContract,
  defineRoleBridgeRegistry,
  eventEndpoint,
  invokeEndpoint,
  selectRoleBridgeContract,
  type BridgeFromContract
} from "./role-bridge-registry.js";

type Method<Bridge, Key extends keyof Bridge> = Extract<Bridge[Key], (...args: never[]) => unknown>;
type Args<Bridge, Key extends keyof Bridge> = Parameters<Method<Bridge, Key>>;
type Result<Bridge, Key extends keyof Bridge> = Awaited<ReturnType<Method<Bridge, Key>>>;
type EventArgs<Bridge, Key extends keyof Bridge> = Args<Bridge, Key>[0] extends (
  ...args: infer Payload
) => void
  ? Payload
  : never;

const appShellInvoke = <Key extends keyof AppShellBridge>(key: Key, channel: string) =>
  invokeEndpoint<Args<AppShellBridge, Key>, Result<AppShellBridge, Key>>()(key, channel);
const appDataInvoke = <Key extends keyof AppDataBridge>(key: Key, channel: string) =>
  invokeEndpoint<Args<AppDataBridge, Key>, Result<AppDataBridge, Key>>()(key, channel);
const playbackControlInvoke = <Key extends keyof PlaybackControlBridge>(key: Key, channel: string) =>
  invokeEndpoint<Args<PlaybackControlBridge, Key>, Result<PlaybackControlBridge, Key>>()(key, channel);
const clipboardInvoke = <Key extends keyof ClipboardBridge>(key: Key, channel: string) =>
  invokeEndpoint<Args<ClipboardBridge, Key>, Result<ClipboardBridge, Key>>()(key, channel);

export const readerWindowRoleContract = defineRoleBridgeContract("reader-window", [
  appShellInvoke("getBootstrapState", APP_SHELL_CHANNELS.getBootstrapState),
  appShellInvoke("setOnboardingComplete", APP_SHELL_CHANNELS.setOnboardingComplete),
  appShellInvoke("setRoute", APP_SHELL_CHANNELS.setRoute),
  eventEndpoint<EventArgs<AppShellBridge, "onNavigate">>()(
    "onNavigate",
    "emitNavigate",
    APP_SHELL_CHANNELS.navigate
  ),
  appDataInvoke("getSettings", APP_DATA_CHANNELS.getSettings),
  appDataInvoke("setSpeechRate", APP_DATA_CHANNELS.setSpeechRate),
  appDataInvoke("setModel", APP_DATA_CHANNELS.setModel),
  appDataInvoke("setLaunchAtLogin", APP_DATA_CHANNELS.setLaunchAtLogin),
  appDataInvoke("setActivationShortcut", APP_DATA_CHANNELS.setActivationShortcut),
  appDataInvoke("setMiniMaxApiKey", APP_DATA_CHANNELS.setMiniMaxApiKey),
  appDataInvoke("clearMiniMaxApiKey", APP_DATA_CHANNELS.clearMiniMaxApiKey),
  appDataInvoke("hasMiniMaxApiKey", APP_DATA_CHANNELS.hasMiniMaxApiKey),
  appDataInvoke("verifyMiniMaxKey", APP_DATA_CHANNELS.verifyMiniMaxKey),
  appDataInvoke("refreshVoices", APP_DATA_CHANNELS.refreshVoices),
  appDataInvoke("setPreferredVoice", APP_DATA_CHANNELS.setPreferredVoice),
  appDataInvoke("getErrorLogCount", APP_DATA_CHANNELS.getErrorLogCount),
  appDataInvoke("clearErrorLog", APP_DATA_CHANNELS.clearErrorLog),
  appDataInvoke("getReadingHistoryCount", APP_DATA_CHANNELS.getReadingHistoryCount),
  appDataInvoke("previewReadingHistoryRetention", APP_DATA_CHANNELS.previewReadingHistoryRetention),
  appDataInvoke("applyReadingHistoryRetention", APP_DATA_CHANNELS.applyReadingHistoryRetention),
  appDataInvoke("listReadingHistory", APP_DATA_CHANNELS.listReadingHistory),
  appDataInvoke("deleteReadingHistoryRecord", APP_DATA_CHANNELS.deleteReadingHistoryRecord),
  appDataInvoke("undoReadingHistoryDeletion", APP_DATA_CHANNELS.undoReadingHistoryDeletion),
  appDataInvoke("clearReadingHistory", APP_DATA_CHANNELS.clearReadingHistory),
  appDataInvoke("createFavoriteFromHistoryRecord", APP_DATA_CHANNELS.createFavoriteFromHistoryRecord),
  appDataInvoke("listFavorites", APP_DATA_CHANNELS.listFavorites),
  appDataInvoke("deleteFavoriteRecord", APP_DATA_CHANNELS.deleteFavoriteRecord),
  appDataInvoke("undoFavoriteDeletion", APP_DATA_CHANNELS.undoFavoriteDeletion),
  playbackControlInvoke("playReadingTarget", PLAYBACK_CONTROL_CHANNELS.playReadingTarget),
  playbackControlInvoke("playHistoryRecord", PLAYBACK_CONTROL_CHANNELS.playHistoryRecord),
  playbackControlInvoke("playFavoriteRecord", PLAYBACK_CONTROL_CHANNELS.playFavoriteRecord),
  playbackControlInvoke("stopPlayback", PLAYBACK_CONTROL_CHANNELS.stop),
  clipboardInvoke("copyText", CLIPBOARD_CHANNELS.writeText),
  eventEndpoint<EventArgs<PlaybackFeedbackBridge, "onPlaybackFinish">>()(
    "onPlaybackFinish",
    "emitPlaybackFinish",
    PLAYBACK_FEEDBACK_CHANNELS.finishSession
  ),
  eventEndpoint<EventArgs<PlaybackFeedbackBridge, "onPlaybackFail">>()(
    "onPlaybackFail",
    "emitPlaybackFail",
    PLAYBACK_FEEDBACK_CHANNELS.failSession
  ),
  eventEndpoint<EventArgs<PlaybackFeedbackBridge, "onPlaybackStop">>()(
    "onPlaybackStop",
    "emitPlaybackStop",
    PLAYBACK_FEEDBACK_CHANNELS.stopSession
  )
] as const);

export const playbackRendererRoleContract = defineRoleBridgeContract("playback-renderer", [
  eventEndpoint<EventArgs<PlaybackRendererBridge, "onPlaybackStart">>()(
    "onPlaybackStart",
    "emitPlaybackStart",
    RENDERER_AUDIO_CHANNELS.startSession
  ),
  eventEndpoint<EventArgs<PlaybackRendererBridge, "onAudioChunk">>()(
    "onAudioChunk",
    "emitAudioChunk",
    RENDERER_AUDIO_CHANNELS.audioChunk
  ),
  eventEndpoint<EventArgs<PlaybackRendererBridge, "onSegmentEnd">>()(
    "onSegmentEnd",
    "emitSegmentEnd",
    RENDERER_AUDIO_CHANNELS.endSegment
  ),
  eventEndpoint<EventArgs<PlaybackRendererBridge, "onAudioInputEnd">>()(
    "onAudioInputEnd",
    "emitAudioInputEnd",
    RENDERER_AUDIO_CHANNELS.endSessionAudio
  ),
  eventEndpoint<EventArgs<PlaybackRendererBridge, "onPlaybackFail">>()(
    "onPlaybackFail",
    "emitPlaybackFail",
    RENDERER_AUDIO_CHANNELS.failSession
  ),
  eventEndpoint<EventArgs<PlaybackRendererBridge, "onPlaybackStop">>()(
    "onPlaybackStop",
    "emitPlaybackStop",
    RENDERER_AUDIO_CHANNELS.stopSession
  ),
  invokeEndpoint<
    Args<PlaybackRendererBridge, "reportAudioOutcome">,
    Result<PlaybackRendererBridge, "reportAudioOutcome">
  >()("reportAudioOutcome", PLAYBACK_CONTROL_CHANNELS.rendererOutcome),
  invokeEndpoint<
    Args<PlaybackRendererBridge, "sendOverlayMetric">,
    Result<PlaybackRendererBridge, "sendOverlayMetric">
  >()("sendOverlayMetric", PLAYBACK_OVERLAY_COMMAND_CHANNELS.metric)
] as const);

export const playbackOverlayRoleContract = defineRoleBridgeContract("playback-overlay", [
  eventEndpoint<EventArgs<PlaybackOverlayBridge, "onOverlayShow">>()(
    "onOverlayShow",
    "emitOverlayShow",
    PLAYBACK_OVERLAY_EVENT_CHANNELS.show
  ),
  eventEndpoint<EventArgs<PlaybackOverlayBridge, "onOverlayMetric">>()(
    "onOverlayMetric",
    "emitOverlayMetric",
    PLAYBACK_OVERLAY_EVENT_CHANNELS.metric
  ),
  eventEndpoint<EventArgs<PlaybackOverlayBridge, "onOverlayFinish">>()(
    "onOverlayFinish",
    "emitOverlayFinish",
    PLAYBACK_OVERLAY_EVENT_CHANNELS.finish
  ),
  eventEndpoint<EventArgs<PlaybackOverlayBridge, "onOverlayFail">>()(
    "onOverlayFail",
    "emitOverlayFail",
    PLAYBACK_OVERLAY_EVENT_CHANNELS.fail
  ),
  eventEndpoint<EventArgs<PlaybackOverlayBridge, "onOverlayStop">>()(
    "onOverlayStop",
    "emitOverlayStop",
    PLAYBACK_OVERLAY_EVENT_CHANNELS.stop
  ),
  invokeEndpoint<
    Args<PlaybackOverlayBridge, "notifyOverlayReady">,
    Result<PlaybackOverlayBridge, "notifyOverlayReady">
  >()("notifyOverlayReady", PLAYBACK_OVERLAY_COMMAND_CHANNELS.ready)
] as const);

export const voiceReaderRoleBridgeRegistry = defineRoleBridgeRegistry([
  readerWindowRoleContract,
  playbackRendererRoleContract,
  playbackOverlayRoleContract
] as const);

export const appShellRoleContract = selectRoleBridgeContract(readerWindowRoleContract, [
  "getBootstrapState",
  "setOnboardingComplete",
  "setRoute",
  "onNavigate"
] as const);

export const appDataRoleContract = selectRoleBridgeContract(readerWindowRoleContract, [
  "getSettings",
  "setSpeechRate",
  "setModel",
  "setLaunchAtLogin",
  "setActivationShortcut",
  "setMiniMaxApiKey",
  "clearMiniMaxApiKey",
  "hasMiniMaxApiKey",
  "verifyMiniMaxKey",
  "refreshVoices",
  "setPreferredVoice",
  "getErrorLogCount",
  "clearErrorLog",
  "getReadingHistoryCount",
  "previewReadingHistoryRetention",
  "applyReadingHistoryRetention",
  "listReadingHistory",
  "deleteReadingHistoryRecord",
  "undoReadingHistoryDeletion",
  "clearReadingHistory",
  "createFavoriteFromHistoryRecord",
  "listFavorites",
  "deleteFavoriteRecord",
  "undoFavoriteDeletion"
] as const);

export const clipboardRoleContract = selectRoleBridgeContract(readerWindowRoleContract, [
  "copyText"
] as const);

export type ReaderWindowRoleBridge = BridgeFromContract<typeof readerWindowRoleContract>;
export type PlaybackRendererRoleBridge = BridgeFromContract<typeof playbackRendererRoleContract>;
export type PlaybackOverlayRoleBridge = BridgeFromContract<typeof playbackOverlayRoleContract>;

type Assert<Condition extends true> = Condition;
type Assignable<From, To> = [From] extends [To] ? true : false;

type ReaderContractMatchesExistingBridge = Assert<
  Assignable<ReaderWindowRoleBridge, ReaderWindowRuntimeBridge>
>;
type ExistingReaderBridgeMatchesContract = Assert<
  Assignable<ReaderWindowRuntimeBridge, ReaderWindowRoleBridge>
>;
type RendererContractMatchesExistingBridge = Assert<
  Assignable<PlaybackRendererRoleBridge, PlaybackRendererBridge>
>;
type ExistingRendererBridgeMatchesContract = Assert<
  Assignable<PlaybackRendererBridge, PlaybackRendererRoleBridge>
>;
type OverlayContractMatchesExistingBridge = Assert<
  Assignable<PlaybackOverlayRoleBridge, PlaybackOverlayBridge>
>;
type ExistingOverlayBridgeMatchesContract = Assert<
  Assignable<PlaybackOverlayBridge, PlaybackOverlayRoleBridge>
>;

export type RoleBridgeCompatibilityChecks =
  | ReaderContractMatchesExistingBridge
  | ExistingReaderBridgeMatchesContract
  | RendererContractMatchesExistingBridge
  | ExistingRendererBridgeMatchesContract
  | OverlayContractMatchesExistingBridge
  | ExistingOverlayBridgeMatchesContract;
