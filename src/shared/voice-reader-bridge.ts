import type {
  PlaybackOverlayBridge,
  PlaybackRendererBridge,
  ReaderWindowRuntimeBridge
} from "./bridge-contracts.js";

declare global {
  interface Window {
    voiceReader: unknown;
  }
}

export function getReaderWindowBridge(): ReaderWindowRuntimeBridge {
  return getBridge<ReaderWindowRuntimeBridge>();
}

export function getPlaybackRendererBridge(): PlaybackRendererBridge {
  return getBridge<PlaybackRendererBridge>();
}

export function getPlaybackOverlayBridge(): PlaybackOverlayBridge {
  return getBridge<PlaybackOverlayBridge>();
}

function getBridge<T>(): T {
  return window.voiceReader as T;
}
