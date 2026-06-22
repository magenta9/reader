import { describe, expect, it } from "vitest";

import {
  buildMiniMaxTtsBody,
  describeMiniMaxApiKeyProblem,
  getMiniMaxBaseUrlOrder,
  parseMiniMaxStream
} from "../../src/shared/minimax.js";

const encoder = new TextEncoder();

describe("MiniMax TTS helpers", () => {
  it("builds streaming TTS request bodies", () => {
    expect(buildMiniMaxTtsBody("speech-2.8-turbo", "voice-a", "hello")).toEqual({
      model: "speech-2.8-turbo",
      text: "hello",
      stream: true,
      output_format: "hex",
      language_boost: "auto",
      voice_setting: {
        voice_id: "voice-a",
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
    });
  });

  it("parses incremental streaming audio", async () => {
    const emitted: string[] = [];
    const stream = createMiniMaxStream('data: {"data":{"audio":"abcd"}}\n\ndata: {"data":{"audio":"ef01"}}\n');

    await parseMiniMaxStream(stream, (audioHex) => {
      emitted.push(audioHex);
    });

    expect(emitted).toEqual(["abcd", "ef01"]);
  });

  it("ignores final aggregate audio after incremental chunks", async () => {
    const emitted: string[] = [];
    const stream = createMiniMaxStream(
      [
        'data: {"data":{"audio":"aaaa","status":1}}',
        'data: {"data":{"audio":"bbbb","status":1}}',
        'data: {"data":{"audio":"aaaabbbb","status":2}}'
      ].join("\n\n")
    );

    await parseMiniMaxStream(stream, (audioHex) => {
      emitted.push(audioHex);
    });

    expect(emitted).toEqual(["aaaa", "bbbb"]);
  });

  it("emits final-only audio when no incremental chunks were emitted", async () => {
    const emitted: string[] = [];
    const stream = createMiniMaxStream('data: {"data":{"audio":"final","status":2}}\n');

    await parseMiniMaxStream(stream, (audioHex) => {
      emitted.push(audioHex);
    });

    expect(emitted).toEqual(["final"]);
  });

  it("accepts non-empty API keys and orders endpoints by key shape", () => {
    const loginPayload = btoa(
      JSON.stringify({
        TokenType: 4,
        UserName: "example",
        Phone: "123"
      })
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    expect(describeMiniMaxApiKeyProblem(`header.${loginPayload}.signature`)).toBeUndefined();
    expect(describeMiniMaxApiKeyProblem("sk-valid-looking-key")).toBeUndefined();
    expect(getMiniMaxBaseUrlOrder(`header.${loginPayload}.signature`)[0]).toBe("https://api.minimaxi.com");
    expect(getMiniMaxBaseUrlOrder("sk-valid-looking-key")[0]).toBe("https://api.minimax.io");
  });
});

function createMiniMaxStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    }
  });
}
