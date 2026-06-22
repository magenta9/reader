import type { AppDataBridge } from "./bridge-contracts/app-data.js";
import type { AppShellBridge } from "./bridge-contracts/app-shell.js";
import type { ClipboardBridge } from "./bridge-contracts/clipboard.js";
import type { PlaybackControlBridge } from "./bridge-contracts/playback-control.js";
import type { PlaybackOverlayBridge } from "./bridge-contracts/playback-overlay.js";
import type { RendererAudioBridge } from "./bridge-contracts/renderer-audio.js";

export * from "./bridge-contracts/app-data.js";
export * from "./bridge-contracts/app-shell.js";
export * from "./bridge-contracts/clipboard.js";
export * from "./bridge-contracts/playback-control.js";
export * from "./bridge-contracts/playback-overlay.js";
export * from "./bridge-contracts/renderer-audio.js";

export type ReaderWindowBridge = AppShellBridge & AppDataBridge & PlaybackControlBridge & ClipboardBridge;
export type VoiceReaderBridge = ReaderWindowBridge & RendererAudioBridge & PlaybackOverlayBridge;
