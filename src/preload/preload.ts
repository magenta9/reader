import { contextBridge, ipcRenderer } from "electron";
import type {
  AudioChunkPayload,
  AppRoute,
  AppSettings,
  BootstrapState,
  MiniMaxSetupResult,
  PlaybackSessionInfo,
  PlaybackStartResult,
  OverlayMetric,
  ShortcutUpdateResult,
  SessionPayload,
  VoiceReaderBridge
} from "../renderer/bridge.js";
import type { DetectedLanguage } from "../shared/types.js";

const bridge: VoiceReaderBridge = {
  getBootstrapState: () => ipcRenderer.invoke("app-shell:get-bootstrap-state") as Promise<BootstrapState>,
  setOnboardingComplete: (complete: boolean) =>
    ipcRenderer.invoke("app-shell:set-onboarding-complete", complete) as Promise<void>,
  setRoute: (route: AppRoute) => ipcRenderer.invoke("app-shell:set-route", route) as Promise<void>,
  getSettings: () => ipcRenderer.invoke("app-data:get-settings") as Promise<AppSettings>,
  updateSettings: (patch: Partial<AppSettings>) =>
    ipcRenderer.invoke("app-data:update-settings", patch) as Promise<AppSettings>,
  setLaunchAtLogin: (launchAtLogin: boolean) =>
    ipcRenderer.invoke("app-data:set-launch-at-login", launchAtLogin) as Promise<AppSettings>,
  setActivationShortcut: (shortcut: string) =>
    ipcRenderer.invoke("app-data:set-activation-shortcut", shortcut) as Promise<ShortcutUpdateResult>,
  setMiniMaxApiKey: (apiKey: string) =>
    ipcRenderer.invoke("app-data:set-minimax-api-key", apiKey) as Promise<void>,
  clearMiniMaxApiKey: () => ipcRenderer.invoke("app-data:clear-minimax-api-key") as Promise<void>,
  hasMiniMaxApiKey: () => ipcRenderer.invoke("app-data:has-minimax-api-key") as Promise<boolean>,
  verifyMiniMaxKey: () =>
    ipcRenderer.invoke("app-data:verify-minimax-key") as Promise<MiniMaxSetupResult>,
  refreshVoices: () => ipcRenderer.invoke("app-data:refresh-voices") as Promise<MiniMaxSetupResult>,
  setPreferredVoice: (language: DetectedLanguage, voiceId: string) =>
    ipcRenderer.invoke("app-data:set-preferred-voice", language, voiceId) as Promise<AppSettings>,
  getErrorLogCount: () => ipcRenderer.invoke("app-data:get-error-log-count") as Promise<number>,
  clearErrorLog: () => ipcRenderer.invoke("app-data:clear-error-log") as Promise<void>,
  getReadingHistoryCount: () =>
    ipcRenderer.invoke("app-data:get-reading-history-count") as Promise<number>,
  listReadingHistory: () =>
    ipcRenderer.invoke("app-data:list-reading-history") as Promise<import("../renderer/bridge.js").ReadingHistoryRecord[]>,
  deleteReadingHistoryRecord: (id: string) =>
    ipcRenderer.invoke("app-data:delete-reading-history-record", id) as Promise<void>,
  clearReadingHistory: () => ipcRenderer.invoke("app-data:clear-reading-history") as Promise<void>,
  playClipboard: () => ipcRenderer.invoke("playback:play-clipboard") as Promise<PlaybackStartResult>,
  playHistoryRecord: (id: string) =>
    ipcRenderer.invoke("playback:play-history-record", id) as Promise<PlaybackStartResult>,
  stopPlayback: () => ipcRenderer.invoke("playback:stop") as Promise<void>,
  notifyPlaybackIdle: (sessionId: number) =>
    ipcRenderer.invoke("playback:renderer-idle", sessionId) as Promise<void>,
  copyText: (text: string) => ipcRenderer.invoke("clipboard:write-text", text) as Promise<void>,
  onNavigate: (listener: (route: AppRoute) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, route: AppRoute) => listener(route);
    ipcRenderer.on("app-shell:navigate", handler);
    return () => ipcRenderer.off("app-shell:navigate", handler);
  },
  onPlaybackStart: (listener: (session: PlaybackSessionInfo) => void) =>
    subscribe("playback:start-session", listener),
  onAudioChunk: (listener: (payload: AudioChunkPayload) => void) =>
    subscribe("playback:audio-chunk", listener),
  onSegmentEnd: (listener: (payload: SessionPayload) => void) =>
    subscribe("playback:end-segment", listener),
  onPlaybackFinish: (listener: (payload: SessionPayload) => void) =>
    subscribe("playback:finish-session", listener),
  onPlaybackFail: (listener: (payload: SessionPayload) => void) =>
    subscribe("playback:fail-session", listener),
  onPlaybackStop: (listener: (payload: SessionPayload) => void) =>
    subscribe("playback:stop-session", listener),
  sendOverlayMetric: (metric: OverlayMetric) =>
    ipcRenderer.invoke("overlay:metric", metric) as Promise<void>,
  finishOverlayPlayback: () => ipcRenderer.invoke("overlay:finish-playback") as Promise<void>,
  onOverlayShow: (listener: () => void) => subscribeVoid("overlay:show", listener),
  onOverlayMetric: (listener: (metric: OverlayMetric) => void) =>
    subscribe("overlay:metric", listener),
  onOverlayFinish: (listener: () => void) => subscribeVoid("overlay:finish", listener),
  onOverlayFail: (listener: () => void) => subscribeVoid("overlay:fail", listener),
  onOverlayStop: (listener: () => void) => subscribeVoid("overlay:stop", listener)
};

contextBridge.exposeInMainWorld("voiceReader", bridge);

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
}

function subscribeVoid(channel: string, listener: () => void): () => void {
  const handler = () => listener();
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
}
