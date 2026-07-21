import type {
  PlaybackOverlayRoleBridge,
  PlaybackRendererRoleBridge,
  ReaderWindowRoleBridge
} from "./role-bridge-contracts.js";

declare global {
  interface Window {
    voiceReader: unknown;
  }
}

export function getReaderWindowBridge(): ReaderWindowRoleBridge {
  return getBridge<ReaderWindowRoleBridge>();
}

export function getPlaybackRendererBridge(): PlaybackRendererRoleBridge {
  return getBridge<PlaybackRendererRoleBridge>();
}

export function getPlaybackOverlayBridge(): PlaybackOverlayRoleBridge {
  return getBridge<PlaybackOverlayRoleBridge>();
}

function getBridge<T>(): T {
  return window.voiceReader as T;
}
