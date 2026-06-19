import type { PlaybackSessionInfo } from "./bridge.js";
import { usesPlaybackOverlayFeedback } from "../shared/app-contracts.js";

export class PlaybackAudioQueue {
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

  startSession(session: PlaybackSessionInfo): void {
    this.stop();
    this.sessionId = session.sessionId;
    this.speechRate = session.speechRate;
    this.overlayMetricsEnabled = usesPlaybackOverlayFeedback(session.feedbackSurface);
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
        void window.voiceReader.sendOverlayMetric({ amplitude: 0, progress: 1 });
        void window.voiceReader.finishOverlayPlayback();
      }
      void window.voiceReader.notifyPlaybackIdle(sessionId);
      this.stop();
    });
  }

  failSession(sessionId: number): void {
    if (sessionId === this.sessionId) {
      this.stop();
      void window.voiceReader.notifyPlaybackIdle(sessionId);
    }
  }

  stopSession(sessionId: number): void {
    if (sessionId === this.sessionId) {
      this.stop();
      void window.voiceReader.notifyPlaybackIdle(sessionId);
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
  }

  private flush(): void {
    if (!this.chunks.length) return;
    const blobParts = this.chunks.splice(0).map((chunk) => chunk.buffer.slice(0) as ArrayBuffer);
    const blob = new Blob(blobParts, { type: "audio/mpeg" });
    const sessionId = this.sessionId;
    this.playbackTail = this.playbackTail.then(() => this.playBlob(sessionId, blob));
  }

  private async playBlob(sessionId: number, blob: Blob): Promise<void> {
    if (sessionId !== this.sessionId) return;
    const url = URL.createObjectURL(blob);
    this.objectUrls.push(url);
    const audio = new Audio(url);
    this.currentAudio = audio;
    audio.playbackRate = this.speechRate;
    if (this.overlayMetricsEnabled) this.startAnalyser(audio);

    await new Promise<void>((resolve, reject) => {
      audio.addEventListener("ended", () => resolve(), { once: true });
      audio.addEventListener("error", () => reject(new Error("Audio playback failed.")), {
        once: true
      });
      audio.play().catch(reject);
    }).catch(() => undefined);

    if (this.currentAudio === audio) this.currentAudio = undefined;
    URL.revokeObjectURL(url);
    this.objectUrls = this.objectUrls.filter((candidate) => candidate !== url);
  }

  private startAnalyser(audio: HTMLAudioElement): void {
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
      const progress =
        Number.isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration : 0;
      const now = performance.now();
      if (now - this.lastMetricAt >= 80) {
        this.lastMetricAt = now;
        void window.voiceReader.sendOverlayMetric({ amplitude, progress });
      }
      this.animationFrame = window.requestAnimationFrame(tick);
    };

    this.audioContext = context;
    this.lastMetricAt = 0;
    this.animationFrame = window.requestAnimationFrame(tick);
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
