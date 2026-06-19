import type { VoiceReaderBridge } from "../shared/app-contracts.js";

export type {
  AppRoute,
  AppSettings,
  AudioChunkPayload,
  BootstrapState,
  MiniMaxSetupResult,
  OverlayMetric,
  PlaybackSessionInfo,
  PlaybackStartResult,
  ReadingHistoryRecord,
  SessionPayload,
  ShortcutUpdateResult,
  VoiceReaderBridge
} from "../shared/app-contracts.js";

declare global {
  interface Window {
    voiceReader: VoiceReaderBridge;
  }
}
