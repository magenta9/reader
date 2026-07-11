import { usesPlaybackOverlayFeedback, type PlaybackAudioSession } from "../shared/app-contracts.js";
import type { PlaybackRendererBridge } from "../shared/bridge-contracts.js";

export function mountPlaybackAudio(bridge: PlaybackRendererBridge): () => void {
  const queue = new PlaybackAudioQueue(bridge);
  const subscriptions = [
    bridge.onPlaybackStart((session) => queue.startSession(session)),
    bridge.onAudioChunk((payload) => queue.pushChunk(payload.sessionId, payload.bytes)),
    bridge.onSegmentEnd((payload) => queue.endSegment(payload.sessionId)),
    bridge.onPlaybackFinish((payload) => queue.finishSession(payload.sessionId)),
    bridge.onPlaybackFail((payload) => queue.failSession(payload.sessionId)),
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
  private playbackTail = Promise.resolve();
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

  constructor(private readonly bridge: PlaybackRendererBridge) {}

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

  finishSession(sessionId: number): void {
    if (sessionId !== this.sessionId) return;
    this.flush();
    const shouldFinishOverlay = this.overlayMetricsEnabled;
    void this.playbackTail.finally(() => {
      if (sessionId !== this.sessionId) return;
      if (shouldFinishOverlay) {
        void this.bridge.sendOverlayMetric({ amplitude: 0, progress: 1 });
        void this.bridge.finishOverlayPlayback();
      }
      void this.bridge.notifyPlaybackIdle(sessionId);
      this.stop();
    });
  }

  failSession(sessionId: number): void {
    this.stopAndNotifyIdle(sessionId);
  }

  stopSession(sessionId: number): void {
    this.stopAndNotifyIdle(sessionId);
  }

  private stopAndNotifyIdle(sessionId: number): void {
    if (sessionId === this.sessionId) {
      this.stop();
      void this.bridge.notifyPlaybackIdle(sessionId);
    }
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
    this.playbackTail = Promise.resolve();
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
    this.playbackTail = this.playbackTail.then(() => this.playBlob(sessionId, blob, segmentWeight));
  }

  private async playBlob(sessionId: number, blob: Blob, segmentWeight: number): Promise<void> {
    if (sessionId !== this.sessionId) return;
    const url = URL.createObjectURL(blob);
    this.objectUrls.push(url);
    const audio = new Audio(url);
    this.currentAudio = audio;
    audio.playbackRate = this.speechRate;
    if (this.overlayMetricsEnabled) this.startAnalyser(audio, segmentWeight);

    await new Promise<void>((resolve, reject) => {
      audio.addEventListener("ended", () => resolve(), { once: true });
      audio.addEventListener("error", () => reject(new Error("Audio playback failed.")), {
        once: true
      });
      audio.play().catch(reject);
    }).catch(() => undefined);

    if (this.currentAudio === audio) this.currentAudio = undefined;
    if (sessionId === this.sessionId) {
      this.completedSegmentWeight = Math.min(this.totalSegmentWeight, this.completedSegmentWeight + segmentWeight);
    }
    URL.revokeObjectURL(url);
    this.objectUrls = this.objectUrls.filter((candidate) => candidate !== url);
  }

  private startAnalyser(audio: HTMLAudioElement, segmentWeight: number): void {
    this.stopAnalyser();
    const AudioContextCtor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextCtor) return;

    const context = new AudioContextCtor();
    const source = context.createMediaElementSource(audio);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(context.destination);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = (): void => {
      if (this.currentAudio !== audio || !this.overlayMetricsEnabled) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const sample of data) {
        const centered = (sample - 128) / 128;
        sum += centered * centered;
      }
      const amplitude = Math.min(1, Math.sqrt(sum / data.length) * 2.4);
      const audioProgress =
        Number.isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration : 0;
      const progress = this.getSessionProgress(audioProgress, segmentWeight);
      const now = performance.now();
      if (now - this.lastMetricAt >= 80) {
        this.lastMetricAt = now;
        void this.bridge.sendOverlayMetric({ amplitude, progress });
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
