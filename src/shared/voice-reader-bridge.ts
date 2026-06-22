import type { PlaybackOverlayBridge, ReaderWindowBridge, RendererAudioBridge } from "./bridge-contracts.js";

declare global {
  interface Window {
    voiceReader: unknown;
  }
}

export function getReaderWindowBridge(): ReaderWindowBridge {
  return getBridge<ReaderWindowBridge>();
}

export function getRendererAudioBridge(): RendererAudioBridge {
  return getBridge<RendererAudioBridge>();
}

export function getPlaybackOverlayBridge(): PlaybackOverlayBridge {
  return getBridge<PlaybackOverlayBridge>();
}

function getBridge<T>(): T {
  return window.voiceReader as T;
}
