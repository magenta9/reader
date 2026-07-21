import { normalizeMiniMaxVoices } from "./voices.js";
import type { MiniMaxVoice } from "./types.js";
import type { SpeechAudioStreamPort } from "./speech-audio-stream.js";

const GLOBAL_API_BASE_URL = "https://api.minimax.io";
const CN_API_BASE_URL = "https://api.minimaxi.com";

export async function getMiniMaxVoices(apiKey: string): Promise<MiniMaxVoice[]> {
  assertLikelyMiniMaxApiKey(apiKey);
  let lastError: unknown;

  for (const baseUrl of getMiniMaxBaseUrlOrder(apiKey)) {
    try {
      const response = await fetch(buildMiniMaxUrl(baseUrl, "/v1/get_voice"), {
        method: "POST",
        headers: getMiniMaxHeaders(apiKey),
        body: JSON.stringify({ voice_type: "all" })
      });

      const payload = await response.json().catch(() => ({}));
      assertMiniMaxBaseResponse(payload);
      if (!response.ok) {
        throw new Error(extractMiniMaxError(payload, `HTTP ${response.status}`));
      }

      const voices = normalizeMiniMaxVoices(payload);
      if (!voices.length) {
        throw new Error("MiniMax returned no voices for this key.");
      }
      return voices;
    } catch (error) {
      lastError = error;
      if (!shouldTryNextMiniMaxEndpoint(error)) break;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("MiniMax connection failed.");
}

export const streamMiniMaxSpeechAudio: SpeechAudioStreamPort = async (request) => {
  assertLikelyMiniMaxApiKey(request.apiKey);
  let lastError: unknown;

  for (const baseUrl of getMiniMaxBaseUrlOrder(request.apiKey)) {
    try {
      const response = await fetch(buildMiniMaxUrl(baseUrl, "/v1/t2a_v2"), {
        method: "POST",
        signal: request.signal,
        headers: getMiniMaxHeaders(request.apiKey),
        body: JSON.stringify(buildMiniMaxTtsBody(request.model, request.voiceId, request.text))
      });

      const contentType = response.headers.get("content-type") ?? "";

      if (!response.ok || contentType.includes("application/json")) {
        const payload = await response.json().catch(() => {
          if (response.ok) throw new MiniMaxTtsAdapterError("MiniMax TTS returned malformed JSON.");
          return {};
        });
        if (!response.ok) {
          const shouldTryFallback = isMiniMaxAuthorizationFailure(response.status, payload);
          throw new MiniMaxTtsAdapterError(
            shouldTryFallback
              ? "MiniMax TTS authorization failed."
              : `MiniMax TTS failed with HTTP ${response.status}.`,
            shouldTryFallback
          );
        }
        assertMiniMaxTtsBaseResponse(payload);
        const emittedAudio = await emitAudioFromPayload(payload, request.onAudioChunk);
        if (!emittedAudio) throw new Error("MiniMax TTS returned no audio.");
        return;
      }

      if (!response.body) {
        throw new Error("MiniMax TTS returned no response body.");
      }

      const emittedAudio = await parseMiniMaxByteStream(response.body, request.onAudioChunk);
      if (!emittedAudio) throw new Error("MiniMax TTS returned no audio.");
      return;
    } catch (error) {
      lastError = error;
      if (!shouldTryNextMiniMaxTtsEndpoint(error)) break;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("MiniMax TTS failed.");
};

export function extractMiniMaxError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as Record<string, unknown>;
  const candidates = [
    record.message,
    record.error,
    record.error_msg,
    record.status_msg,
    typeof record.base_resp === "object" && record.base_resp
      ? (record.base_resp as Record<string, unknown>).status_msg
      : undefined
  ];
  return (
    candidates.find((value): value is string => typeof value === "string" && Boolean(value.trim())) ??
    fallback
  );
}

export function isJwtLikeToken(value: string): boolean {
  const parts = value.trim().split(".");
  if (parts.length !== 3) return false;
  return parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part) && part.length > 0);
}

export function describeMiniMaxApiKeyProblem(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "Enter a MiniMax API key first.";
  return undefined;
}

function assertLikelyMiniMaxApiKey(value: string): void {
  const problem = describeMiniMaxApiKeyProblem(value);
  if (problem) throw new Error(problem);
}

export function getMiniMaxBaseUrlOrder(apiKey: string): string[] {
  return isJwtLikeToken(apiKey) ? [CN_API_BASE_URL, GLOBAL_API_BASE_URL] : [GLOBAL_API_BASE_URL, CN_API_BASE_URL];
}

export function buildMiniMaxUrl(baseUrl: string, path: string): string {
  return `${baseUrl}${path}`;
}

function getMiniMaxHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

function shouldTryNextMiniMaxEndpoint(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /invalid api key|login fail|authorization/i.test(message);
}

function assertMiniMaxBaseResponse(payload: unknown): void {
  if (!payload || typeof payload !== "object") return;
  const baseResp = (payload as Record<string, unknown>).base_resp;
  if (!baseResp || typeof baseResp !== "object") return;
  const record = baseResp as Record<string, unknown>;
  const statusCode = record.status_code;
  if (typeof statusCode === "number" && statusCode !== 0) {
    throw new Error(extractMiniMaxError(payload, `MiniMax returned status ${statusCode}`));
  }
}

function buildMiniMaxTtsBody(model: string, voiceId: string, text: string): Record<string, unknown> {
  return {
    model,
    text,
    stream: true,
    output_format: "hex",
    language_boost: "auto",
    voice_setting: {
      voice_id: voiceId,
      speed: 1,
      vol: 1,
      pitch: 0
    },
    audio_setting: {
      sample_rate: 32000,
      bitrate: 128000,
      format: "mp3",
      channel: 1
    }
  };
}

async function parseMiniMaxByteStream(
  stream: ReadableStream<Uint8Array>,
  onAudioChunk: (bytes: Uint8Array) => Promise<void> | void
): Promise<boolean> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let emittedIncrementalAudio = false;
  let emittedFinalAudio = false;

  const handleLine = async (line: string): Promise<void> => {
    const result = parseMiniMaxLine(line);
    if (!result) return;

    if (result.kind === "final") {
      const bytes = decodeMiniMaxAudioHex(result.audioHex);
      if (!emittedIncrementalAudio && !emittedFinalAudio) {
        await onAudioChunk(bytes);
        emittedFinalAudio = true;
      }
      return;
    }

    if (!emittedFinalAudio) {
      await onAudioChunk(decodeMiniMaxAudioHex(result.audioHex));
      emittedIncrementalAudio = true;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      await handleLine(line);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    for (const line of buffer.split(/\r?\n/)) {
      await handleLine(line);
    }
  }
  return emittedIncrementalAudio || emittedFinalAudio;
}

type ParsedMiniMaxAudioLine = { kind: "incremental" | "final"; audioHex: string };

class MiniMaxTtsAdapterError extends Error {
  constructor(
    message: string,
    readonly shouldTryFallback = false
  ) {
    super(message);
    this.name = "MiniMaxTtsAdapterError";
  }
}

function parseMiniMaxLine(line: string): ParsedMiniMaxAudioLine | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed === "data: [DONE]") return undefined;
  const jsonText = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
  if (!jsonText || jsonText === "[DONE]") return undefined;

  let payload: unknown;
  try {
    payload = JSON.parse(jsonText) as unknown;
  } catch {
    throw new MiniMaxTtsAdapterError("MiniMax TTS returned malformed streaming data.");
  }
  assertMiniMaxTtsBaseResponse(payload);
  return findStreamingAudio(payload);
}

function assertMiniMaxTtsBaseResponse(payload: unknown): void {
  if (!payload || typeof payload !== "object") return;
  const baseResp = (payload as Record<string, unknown>).base_resp;
  if (!baseResp || typeof baseResp !== "object") return;
  const statusCode = (baseResp as Record<string, unknown>).status_code;
  if (typeof statusCode !== "number" || statusCode === 0) return;
  const shouldTryFallback = isMiniMaxAuthorizationFailure(undefined, payload);
  throw new MiniMaxTtsAdapterError(
    shouldTryFallback
      ? "MiniMax TTS authorization failed."
      : `MiniMax TTS returned status ${statusCode}.`,
    shouldTryFallback
  );
}

function isMiniMaxAuthorizationFailure(status: number | undefined, payload: unknown): boolean {
  return (
    status === 401 ||
    status === 403 ||
    /invalid api key|login fail|authorization/i.test(extractMiniMaxError(payload, ""))
  );
}

function shouldTryNextMiniMaxTtsEndpoint(error: unknown): boolean {
  return error instanceof MiniMaxTtsAdapterError && error.shouldTryFallback;
}

async function emitAudioFromPayload(
  payload: unknown,
  onAudioChunk: (bytes: Uint8Array) => Promise<void> | void
): Promise<boolean> {
  if (!payload || typeof payload !== "object") return false;
  const audio = findAudioHex(payload);
  if (!audio) return false;
  await onAudioChunk(decodeMiniMaxAudioHex(audio));
  return true;
}

function decodeMiniMaxAudioHex(audioHex: string): Uint8Array {
  const clean = audioHex.trim();
  if (!clean || clean.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(clean)) {
    throw new Error("MiniMax TTS returned malformed audio hex.");
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}


function findMiniMaxDataStatus(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const data = (value as Record<string, unknown>).data;
  if (!data || typeof data !== "object") return undefined;
  const status = (data as Record<string, unknown>).status;
  return typeof status === "number" ? status : undefined;
}

function findStreamingAudio(payload: unknown): ParsedMiniMaxAudioLine | undefined {
  const audioHex = findAudioHex(payload);
  if (!audioHex) return undefined;
  return {
    kind: findMiniMaxDataStatus(payload) === 2 ? "final" : "incremental",
    audioHex
  };
}

function findAudioHex(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.audio === "string" && record.audio.length > 0) return record.audio;
  for (const child of Object.values(record)) {
    const found = findAudioHex(child);
    if (found) return found;
  }
  return undefined;
}
