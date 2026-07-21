import type {
  AppRoute,
  AppSettings,
  AudioChunkPayload,
  BootstrapState,
  FavoriteRecord,
  HistoryRetention,
  HistoryRetentionChangeResult,
  HistoryRetentionImpact,
  MiniMaxSetupResult,
  OverlayMetric,
  PlaybackAudioOutcome,
  PlaybackAudioSession,
  PlaybackStartResult,
  ReadingHistoryRecord,
  RouteSnapshot,
  SessionOverlayMetric,
  SessionPayload,
  ShortcutUpdateResult
} from "./app-contracts.js";
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
  type BridgeFromContract
} from "./role-bridge-registry.js";
import type { DetectedLanguage } from "./types.js";

const appShellEndpoints = [
  invokeEndpoint<[], BootstrapState>()("getBootstrapState", APP_SHELL_CHANNELS.getBootstrapState),
  invokeEndpoint<[complete: boolean], void>()(
    "setOnboardingComplete",
    APP_SHELL_CHANNELS.setOnboardingComplete
  ),
  invokeEndpoint<[route: AppRoute], RouteSnapshot>()("setRoute", APP_SHELL_CHANNELS.setRoute),
  eventEndpoint<[snapshot: RouteSnapshot]>()(
    "onNavigate",
    "emitNavigate",
    APP_SHELL_CHANNELS.navigate
  )
] as const;

const appDataEndpoints = [
  invokeEndpoint<[], AppSettings>()("getSettings", APP_DATA_CHANNELS.getSettings),
  invokeEndpoint<[speechRate: number], AppSettings>()("setSpeechRate", APP_DATA_CHANNELS.setSpeechRate),
  invokeEndpoint<[model: string], AppSettings>()("setModel", APP_DATA_CHANNELS.setModel),
  invokeEndpoint<[launchAtLogin: boolean], AppSettings>()(
    "setLaunchAtLogin",
    APP_DATA_CHANNELS.setLaunchAtLogin
  ),
  invokeEndpoint<[shortcut: string], ShortcutUpdateResult>()(
    "setActivationShortcut",
    APP_DATA_CHANNELS.setActivationShortcut
  ),
  invokeEndpoint<[apiKey: string], void>()("setMiniMaxApiKey", APP_DATA_CHANNELS.setMiniMaxApiKey),
  invokeEndpoint<[], void>()("clearMiniMaxApiKey", APP_DATA_CHANNELS.clearMiniMaxApiKey),
  invokeEndpoint<[], boolean>()("hasMiniMaxApiKey", APP_DATA_CHANNELS.hasMiniMaxApiKey),
  invokeEndpoint<[], MiniMaxSetupResult>()("verifyMiniMaxKey", APP_DATA_CHANNELS.verifyMiniMaxKey),
  invokeEndpoint<[], MiniMaxSetupResult>()("refreshVoices", APP_DATA_CHANNELS.refreshVoices),
  invokeEndpoint<[language: DetectedLanguage, voiceId: string], AppSettings>()(
    "setPreferredVoice",
    APP_DATA_CHANNELS.setPreferredVoice
  ),
  invokeEndpoint<[], number>()("getErrorLogCount", APP_DATA_CHANNELS.getErrorLogCount),
  invokeEndpoint<[], void>()("clearErrorLog", APP_DATA_CHANNELS.clearErrorLog),
  invokeEndpoint<[], number>()("getReadingHistoryCount", APP_DATA_CHANNELS.getReadingHistoryCount),
  invokeEndpoint<[historyRetention: HistoryRetention], HistoryRetentionImpact>()(
    "previewReadingHistoryRetention",
    APP_DATA_CHANNELS.previewReadingHistoryRetention
  ),
  invokeEndpoint<
    [historyRetention: HistoryRetention, expectedDeleteCount: number],
    HistoryRetentionChangeResult
  >()("applyReadingHistoryRetention", APP_DATA_CHANNELS.applyReadingHistoryRetention),
  invokeEndpoint<[], ReadingHistoryRecord[]>()(
    "listReadingHistory",
    APP_DATA_CHANNELS.listReadingHistory
  ),
  invokeEndpoint<[id: string], string | undefined>()(
    "deleteReadingHistoryRecord",
    APP_DATA_CHANNELS.deleteReadingHistoryRecord
  ),
  invokeEndpoint<[undoToken: string], boolean>()(
    "undoReadingHistoryDeletion",
    APP_DATA_CHANNELS.undoReadingHistoryDeletion
  ),
  invokeEndpoint<[], number>()("clearReadingHistory", APP_DATA_CHANNELS.clearReadingHistory),
  invokeEndpoint<[id: string], FavoriteRecord | undefined>()(
    "createFavoriteFromHistoryRecord",
    APP_DATA_CHANNELS.createFavoriteFromHistoryRecord
  ),
  invokeEndpoint<[], FavoriteRecord[]>()("listFavorites", APP_DATA_CHANNELS.listFavorites),
  invokeEndpoint<[id: string], string | undefined>()(
    "deleteFavoriteRecord",
    APP_DATA_CHANNELS.deleteFavoriteRecord
  ),
  invokeEndpoint<[undoToken: string], boolean>()(
    "undoFavoriteDeletion",
    APP_DATA_CHANNELS.undoFavoriteDeletion
  )
] as const;

const playbackControlEndpoints = [
  invokeEndpoint<[], PlaybackStartResult>()(
    "playReadingTarget",
    PLAYBACK_CONTROL_CHANNELS.playReadingTarget
  ),
  invokeEndpoint<[id: string], PlaybackStartResult>()(
    "playHistoryRecord",
    PLAYBACK_CONTROL_CHANNELS.playHistoryRecord
  ),
  invokeEndpoint<[id: string], PlaybackStartResult>()(
    "playFavoriteRecord",
    PLAYBACK_CONTROL_CHANNELS.playFavoriteRecord
  ),
  invokeEndpoint<[], void>()("stopPlayback", PLAYBACK_CONTROL_CHANNELS.stop)
] as const;

const clipboardEndpoints = [
  invokeEndpoint<[text: string], void>()("copyText", CLIPBOARD_CHANNELS.writeText)
] as const;

const playbackFeedbackEndpoints = [
  eventEndpoint<[payload: SessionPayload]>()(
    "onPlaybackFinish",
    "emitPlaybackFinish",
    PLAYBACK_FEEDBACK_CHANNELS.finishSession
  ),
  eventEndpoint<[payload: SessionPayload]>()(
    "onPlaybackFail",
    "emitPlaybackFail",
    PLAYBACK_FEEDBACK_CHANNELS.failSession
  ),
  eventEndpoint<[payload: SessionPayload]>()(
    "onPlaybackStop",
    "emitPlaybackStop",
    PLAYBACK_FEEDBACK_CHANNELS.stopSession
  )
] as const;

export const appShellRoleContract = defineRoleBridgeContract("reader-window", appShellEndpoints);
export const appDataRoleContract = defineRoleBridgeContract("reader-window", appDataEndpoints);
export const playbackControlRoleContract = defineRoleBridgeContract(
  "reader-window",
  playbackControlEndpoints
);
export const clipboardRoleContract = defineRoleBridgeContract("reader-window", clipboardEndpoints);
export const playbackFeedbackRoleContract = defineRoleBridgeContract(
  "reader-window",
  playbackFeedbackEndpoints
);

export const readerWindowRoleContract = defineRoleBridgeContract("reader-window", [
  ...appShellEndpoints,
  ...appDataEndpoints,
  ...playbackControlEndpoints,
  ...clipboardEndpoints,
  ...playbackFeedbackEndpoints
] as const);

export const playbackRendererRoleContract = defineRoleBridgeContract("playback-renderer", [
  eventEndpoint<[session: PlaybackAudioSession]>()(
    "onPlaybackStart",
    "emitPlaybackStart",
    RENDERER_AUDIO_CHANNELS.startSession
  ),
  eventEndpoint<[payload: AudioChunkPayload]>()(
    "onAudioChunk",
    "emitAudioChunk",
    RENDERER_AUDIO_CHANNELS.audioChunk
  ),
  eventEndpoint<[payload: SessionPayload]>()(
    "onSegmentEnd",
    "emitSegmentEnd",
    RENDERER_AUDIO_CHANNELS.endSegment
  ),
  eventEndpoint<[payload: SessionPayload]>()(
    "onAudioInputEnd",
    "emitAudioInputEnd",
    RENDERER_AUDIO_CHANNELS.endSessionAudio
  ),
  eventEndpoint<[payload: SessionPayload]>()(
    "onPlaybackFail",
    "emitPlaybackFail",
    RENDERER_AUDIO_CHANNELS.failSession
  ),
  eventEndpoint<[payload: SessionPayload]>()(
    "onPlaybackStop",
    "emitPlaybackStop",
    RENDERER_AUDIO_CHANNELS.stopSession
  ),
  invokeEndpoint<[outcome: PlaybackAudioOutcome], void>()(
    "reportAudioOutcome",
    PLAYBACK_CONTROL_CHANNELS.rendererOutcome
  ),
  invokeEndpoint<[metric: SessionOverlayMetric], void>()(
    "sendOverlayMetric",
    PLAYBACK_OVERLAY_COMMAND_CHANNELS.metric
  )
] as const);

export const playbackOverlayRoleContract = defineRoleBridgeContract("playback-overlay", [
  eventEndpoint<[]>()("onOverlayShow", "emitOverlayShow", PLAYBACK_OVERLAY_EVENT_CHANNELS.show),
  eventEndpoint<[metric: OverlayMetric]>()(
    "onOverlayMetric",
    "emitOverlayMetric",
    PLAYBACK_OVERLAY_EVENT_CHANNELS.metric
  ),
  eventEndpoint<[]>()("onOverlayFinish", "emitOverlayFinish", PLAYBACK_OVERLAY_EVENT_CHANNELS.finish),
  eventEndpoint<[]>()("onOverlayFail", "emitOverlayFail", PLAYBACK_OVERLAY_EVENT_CHANNELS.fail),
  eventEndpoint<[]>()("onOverlayStop", "emitOverlayStop", PLAYBACK_OVERLAY_EVENT_CHANNELS.stop),
  invokeEndpoint<[], void>()("notifyOverlayReady", PLAYBACK_OVERLAY_COMMAND_CHANNELS.ready)
] as const);

export const voiceReaderRoleBridgeRegistry = defineRoleBridgeRegistry([
  readerWindowRoleContract,
  playbackRendererRoleContract,
  playbackOverlayRoleContract
] as const);

export type ReaderWindowRoleBridge = BridgeFromContract<typeof readerWindowRoleContract>;
export type PlaybackRendererRoleBridge = BridgeFromContract<typeof playbackRendererRoleContract>;
export type PlaybackOverlayRoleBridge = BridgeFromContract<typeof playbackOverlayRoleContract>;
