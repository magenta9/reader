import { contextBridge, ipcRenderer } from "electron";
import { createAppDataBridge } from "./bridge-adapters/app-data.js";
import { createAppShellBridge } from "./bridge-adapters/app-shell.js";
import { createClipboardBridge } from "./bridge-adapters/clipboard.js";
import { createPlaybackControlBridge } from "./bridge-adapters/playback-control.js";
import { createPlaybackOverlayBridge } from "./bridge-adapters/playback-overlay.js";
import {
  createPlaybackFeedbackBridge,
  createPlaybackRendererBridge
} from "./bridge-adapters/renderer-audio.js";
import type {
  PlaybackOverlayBridge,
  PlaybackRendererBridge,
  ReaderWindowRuntimeBridge
} from "../shared/bridge-contracts.js";

const readerWindowBridge: ReaderWindowRuntimeBridge = {
  ...createAppShellBridge(ipcRenderer),
  ...createAppDataBridge(ipcRenderer),
  ...createPlaybackControlBridge(ipcRenderer),
  ...createClipboardBridge(ipcRenderer),
  ...createPlaybackFeedbackBridge(ipcRenderer)
};

const playbackRendererBridge: PlaybackRendererBridge = createPlaybackRendererBridge(ipcRenderer);

const playbackOverlayBridge: PlaybackOverlayBridge = createPlaybackOverlayBridge(ipcRenderer);

contextBridge.exposeInMainWorld("voiceReader", createRuntimeBridge());

function createRuntimeBridge(): ReaderWindowRuntimeBridge | PlaybackRendererBridge | PlaybackOverlayBridge {
  if (isPlaybackOverlayRuntime()) return playbackOverlayBridge;
  if (isPlaybackRendererRuntime()) return playbackRendererBridge;
  return readerWindowBridge;
}

function isPlaybackOverlayRuntime(): boolean {
  return window.location.pathname.includes("/overlay/");
}

function isPlaybackRendererRuntime(): boolean {
  return window.location.pathname.includes("/playback-renderer/");
}
