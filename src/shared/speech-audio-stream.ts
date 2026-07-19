export interface SpeechAudioStreamRequest {
  apiKey: string;
  model: string;
  voiceId: string;
  text: string;
  signal: AbortSignal;
  onAudioChunk: (bytes: Uint8Array) => Promise<void> | void;
}

export type SpeechAudioStreamPort = (request: SpeechAudioStreamRequest) => Promise<void>;
