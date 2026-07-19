import {
  PLAYBACK_AUDIO_OUTCOMES,
  usesPlaybackOverlayFeedback,
  type PlaybackAudioOutcomeStatus,
  type PlaybackAudioSession
} from "../shared/app-contracts.js";
import type { PlaybackRendererRoleBridge } from "../shared/role-bridge-contracts.js";

const OVERLAY_LEVEL_COUNT = 13;
const OVERLAY_METRIC_INTERVAL_MS = 64;

export function mountPlaybackAudio(bridge: PlaybackRendererRoleBridge): () => void {
  const queue = new PlaybackAudioQueue(bridge);
  const subscriptions = [
    bridge.onPlaybackStart((session) => queue.startSession(session)),
    bridge.onAudioChunk((payload) => queue.pushChunk(payload.sessionId, payload.bytes)),
    bridge.onSegmentEnd((payload) => queue.endSegment(payload.sessionId)),
    bridge.onAudioInputEnd((payload) => queue.endAudioInput(payload.sessionId)),
    bridge.onPlaybackFail((payload) => queue.stopSession(payload.sessionId)),
    bridge.onPlaybackStop((payload) => queue.stopSession(payload.sessionId))
  ];
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    for (const unsubscribe of subscriptions) unsubscribe();
    queue.stop();
  };
}

class PlaybackAudioQueue {
  private sessionId = 0;
  private chunks: Uint8Array[] = [];
  private playbackTail: Promise<PlaybackAudioOutcomeStatus> = Promise.resolve(
    PLAYBACK_AUDIO_OUTCOMES.completed
  );
  private currentAudio: HTMLAudioElement | undefined;
  private objectUrls: string[] = [];
  private speechRate = 1;
  private overlayMetricsEnabled = false;
  private audioContext: AudioContext | undefined;
  private animationFrame = 0;
  private lastMetricAt = 0;
  private segmentWeights: number[] = [];
  private totalSegmentWeight = 1;
  private completedSegmentWeight = 0;
  private nextSegmentIndex = 0;

  constructor(private readonly bridge: PlaybackRendererRoleBridge) {}

  startSession(session: PlaybackAudioSession): void {
    this.stop();
    this.sessionId = session.sessionId;
    this.speechRate = session.speechRate;
    this.overlayMetricsEnabled = usesPlaybackOverlayFeedback(session.feedbackSurface);
    this.segmentWeights = normalizeSegmentWeights(session.segmentWeights);
    this.totalSegmentWeight = this.segmentWeights.reduce((total, weight) => total + weight, 0) || 1;
    this.completedSegmentWeight = 0;
    this.nextSegmentIndex = 0;
  }

  pushChunk(sessionId: number, bytes: Uint8Array): void {
    if (sessionId !== this.sessionId) return;
    this.chunks.push(bytes);
  }

  endSegment(sessionId: number): void {
    if (sessionId !== this.sessionId) return;
    this.flush();
  }

  endAudioInput(sessionId: number): void {
    if (sessionId !== this.sessionId) return;
    this.flush();
    const shouldSendFinalOverlayMetric = this.overlayMetricsEnabled;
    void this.playbackTail.then((status) => {
      if (sessionId !== this.sessionId) return;
      if (status === PLAYBACK_AUDIO_OUTCOMES.completed && shouldSendFinalOverlayMetric) {
        void this.bridge.sendOverlayMetric({
          sessionId,
          amplitude: 0,
          levels: Array.from({ length: OVERLAY_LEVEL_COUNT }, () => 0),
          progress: 1
        });
      }
      void this.bridge.reportAudioOutcome({ sessionId, status });
      this.stop();
    });
  }

  stopSession(sessionId: number): void {
    if (sessionId === this.sessionId) this.stop();
  }

  stop(): void {
    this.sessionId = 0;
    this.chunks = [];
    this.stopAnalyser();
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.src = "";
      this.currentAudio = undefined;
    }
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls = [];
    this.playbackTail = Promise.resolve(PLAYBACK_AUDIO_OUTCOMES.completed);
    this.segmentWeights = [];
    this.totalSegmentWeight = 1;
    this.completedSegmentWeight = 0;
    this.nextSegmentIndex = 0;
  }

  private flush(): void {
    if (!this.chunks.length) return;
    const blobParts = this.chunks.splice(0).map((chunk) => chunk.buffer.slice(0) as ArrayBuffer);
    const blob = new Blob(blobParts, { type: "audio/mpeg" });
    const sessionId = this.sessionId;
    const segmentWeight = this.segmentWeights[this.nextSegmentIndex] ?? 1;
    this.nextSegmentIndex += 1;
    this.playbackTail = this.playbackTail.then(async (status) => {
      if (status === PLAYBACK_AUDIO_OUTCOMES.failed) return status;
      try {
        await this.playBlob(sessionId, blob, segmentWeight);
        return PLAYBACK_AUDIO_OUTCOMES.completed;
      } catch {
        return PLAYBACK_AUDIO_OUTCOMES.failed;
      }
    });
  }

  private async playBlob(sessionId: number, blob: Blob, segmentWeight: number): Promise<void> {
    if (sessionId !== this.sessionId) return;
    const url = URL.createObjectURL(blob);
    this.objectUrls.push(url);
    const audio = new Audio(url);
    this.currentAudio = audio;
    audio.playbackRate = this.speechRate;
    if (this.overlayMetricsEnabled) this.startAnalyser(audio, segmentWeight);

    try {
      await new Promise<void>((resolve, reject) => {
        audio.addEventListener("ended", () => resolve(), { once: true });
        audio.addEventListener("error", () => reject(new Error("Audio playback failed.")), {
          once: true
        });
        audio.play().catch(reject);
      });
      if (sessionId === this.sessionId) {
        this.completedSegmentWeight = Math.min(this.totalSegmentWeight, this.completedSegmentWeight + segmentWeight);
      }
    } finally {
      if (this.currentAudio === audio) this.currentAudio = undefined;
      URL.revokeObjectURL(url);
      this.objectUrls = this.objectUrls.filter((candidate) => candidate !== url);
    }
  }

  private startAnalyser(audio: HTMLAudioElement, segmentWeight: number): void {
    this.stopAnalyser();
    const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextCtor) return;

    const context = new AudioContextCtor();
    const source = context.createMediaElementSource(audio);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.76;
    source.connect(analyser);
    analyser.connect(context.destination);
    const timeData = new Uint8Array(analyser.frequencyBinCount);
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);

    const tick = (): void => {
      if (this.currentAudio !== audio || !this.overlayMetricsEnabled) return;
      analyser.getByteTimeDomainData(timeData);
      analyser.getByteFrequencyData(frequencyData);
      let sum = 0;
      for (const sample of timeData) {
        const centered = (sample - 128) / 128;
        sum += centered * centered;
      }
      const amplitude = Math.min(1, Math.sqrt(sum / timeData.length) * 2.4);
      const levels = createVoiceLevels(frequencyData, amplitude);
      const audioProgress =
        Number.isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration : 0;
      const progress = this.getSessionProgress(audioProgress, segmentWeight);
      const now = performance.now();
      if (now - this.lastMetricAt >= OVERLAY_METRIC_INTERVAL_MS) {
        this.lastMetricAt = now;
        void this.bridge.sendOverlayMetric({
          sessionId: this.sessionId,
          amplitude,
          levels,
          progress
        });
      }
      this.animationFrame = window.requestAnimationFrame(tick);
    };

    this.audioContext = context;
    this.lastMetricAt = 0;
    this.animationFrame = window.requestAnimationFrame(tick);
  }

  private getSessionProgress(audioProgress: number, segmentWeight: number): number {
    const weightedProgress =
      this.completedSegmentWeight + Math.max(0, Math.min(1, audioProgress)) * segmentWeight;
    return Math.max(0, Math.min(1, weightedProgress / this.totalSegmentWeight));
  }

  private stopAnalyser(): void {
    if (this.animationFrame) window.cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    void this.audioContext?.close().catch(() => undefined);
    this.audioContext = undefined;
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

function normalizeSegmentWeights(weights: number[]): number[] {
  const normalized = weights.filter((weight) => Number.isFinite(weight) && weight > 0);
  return normalized.length ? normalized : [1];
}

function createVoiceLevels(frequencyData: Uint8Array, amplitude: number): number[] {
  const centerIndex = (OVERLAY_LEVEL_COUNT - 1) / 2;
  const usableBins = Math.max(2, Math.min(frequencyData.length, 48));
  return Array.from({ length: OVERLAY_LEVEL_COUNT }, (_, index) => {
    const distance = Math.abs(index - centerIndex);
    const bandStart = Math.min(usableBins - 1, Math.max(1, Math.round(1.48 ** distance)));
    const bandEnd = Math.min(usableBins, Math.max(bandStart + 1, Math.round(1.48 ** (distance + 1))));
    let sum = 0;
    for (let bin = bandStart; bin < bandEnd; bin += 1) sum += frequencyData[bin] ?? 0;
    const spectralEnergy = sum / Math.max(1, bandEnd - bandStart) / 255;
    const centerProfile = 1 - (distance / centerIndex) * 0.16;
    return clamp01((Math.pow(spectralEnergy, 0.72) * 0.88 + amplitude * 0.24) * centerProfile);
  });
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
