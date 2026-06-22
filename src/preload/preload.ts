import { contextBridge, ipcRenderer } from "electron";
import { createAppDataBridge } from "./bridge-adapters/app-data.js";
import { createAppShellBridge } from "./bridge-adapters/app-shell.js";
import { createClipboardBridge } from "./bridge-adapters/clipboard.js";
import { createPlaybackControlBridge } from "./bridge-adapters/playback-control.js";
import { createPlaybackOverlayBridge } from "./bridge-adapters/playback-overlay.js";
import { createRendererAudioBridge } from "./bridge-adapters/renderer-audio.js";
import type { PlaybackOverlayBridge, ReaderWindowBridge, RendererAudioBridge } from "../shared/bridge-contracts.js";

type ReaderRuntimeBridge = ReaderWindowBridge & RendererAudioBridge;

const readerWindowBridge: ReaderWindowBridge = {
  ...createAppShellBridge(ipcRenderer),
  ...createAppDataBridge(ipcRenderer),
  ...createPlaybackControlBridge(ipcRenderer),
  ...createClipboardBridge(ipcRenderer)
};

const rendererAudioBridge: RendererAudioBridge = createRendererAudioBridge(ipcRenderer);

const playbackOverlayBridge: PlaybackOverlayBridge = createPlaybackOverlayBridge(ipcRenderer);

contextBridge.exposeInMainWorld("voiceReader", createRuntimeBridge());

function createRuntimeBridge(): ReaderRuntimeBridge | PlaybackOverlayBridge {
  return isPlaybackOverlayRuntime()
    ? playbackOverlayBridge
    : { ...readerWindowBridge, ...rendererAudioBridge };
}

function isPlaybackOverlayRuntime(): boolean {
  return window.location.pathname.includes("/overlay/");
}
