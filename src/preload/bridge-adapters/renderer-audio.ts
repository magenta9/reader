import type {
  AudioChunkPayload,
  PlaybackAudioSession,
  SessionOverlayMetric,
  SessionPayload
} from "../../shared/app-contracts.js";
import {
  PLAYBACK_CONTROL_CHANNELS,
  PLAYBACK_OVERLAY_COMMAND_CHANNELS,
  RENDERER_AUDIO_CHANNELS,
  type PlaybackFeedbackBridge,
  type PlaybackRendererBridge
} from "../../shared/bridge-contracts.js";
import { invoke, subscribe, type PreloadIpc } from "./ipc.js";

export function createPlaybackFeedbackBridge(ipc: PreloadIpc): PlaybackFeedbackBridge {
  return {
    onPlaybackFinish: (listener: (payload: SessionPayload) => void) =>
      subscribe(ipc, RENDERER_AUDIO_CHANNELS.finishSession, listener),
    onPlaybackFail: (listener: (payload: SessionPayload) => void) =>
      subscribe(ipc, RENDERER_AUDIO_CHANNELS.failSession, listener),
    onPlaybackStop: (listener: (payload: SessionPayload) => void) =>
      subscribe(ipc, RENDERER_AUDIO_CHANNELS.stopSession, listener)
  };
}

export function createPlaybackRendererBridge(ipc: PreloadIpc): PlaybackRendererBridge {
  return {
    ...createPlaybackFeedbackBridge(ipc),
    notifyPlaybackIdle: (sessionId: number) =>
      invoke<void>(ipc, PLAYBACK_CONTROL_CHANNELS.rendererIdle, sessionId),
    onPlaybackStart: (listener: (session: PlaybackAudioSession) => void) =>
      subscribe(ipc, RENDERER_AUDIO_CHANNELS.startSession, listener),
    onAudioChunk: (listener: (payload: AudioChunkPayload) => void) =>
      subscribe(ipc, RENDERER_AUDIO_CHANNELS.audioChunk, listener),
    onSegmentEnd: (listener: (payload: SessionPayload) => void) =>
      subscribe(ipc, RENDERER_AUDIO_CHANNELS.endSegment, listener),
    sendOverlayMetric: (metric: SessionOverlayMetric) =>
      invoke<void>(ipc, PLAYBACK_OVERLAY_COMMAND_CHANNELS.metric, metric),
    finishOverlayPlayback: (sessionId: number) =>
      invoke<void>(ipc, PLAYBACK_OVERLAY_COMMAND_CHANNELS.finishPlayback, sessionId)
  };
}
