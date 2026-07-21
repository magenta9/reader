import { afterEach, describe, expect, it, vi } from "vitest";

import {
  describeMiniMaxApiKeyProblem,
  getMiniMaxBaseUrlOrder,
  streamMiniMaxSpeechAudio
} from "../../src/shared/minimax.js";

const encoder = new TextEncoder();

describe("MiniMax TTS adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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

  it("streams validated audio bytes through the production adapter seam", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
        miniMaxResponse(
          [
            'data: {"data":{"audio":"00aF","status":1}}',
            'data: {"data":{"audio":"10ff","status":1}}',
            'data: {"data":{"audio":"00aF10ff","status":2}}'
          ].join("\n\n"),
          "text/event-stream"
        )
    );
    vi.stubGlobal("fetch", fetchMock);
    const chunks: number[][] = [];

    await streamMiniMaxSpeechAudio({
      ...speechRequest(),
      onAudioChunk: async (bytes) => {
        chunks.push(Array.from(bytes));
      }
    });

    expect(chunks).toEqual([
      [0, 175],
      [16, 255]
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.minimax.io/v1/t2a_v2");
    expect(init).toMatchObject({ method: "POST", signal: expect.any(AbortSignal) });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "speech-2.8-turbo",
      text: "adapter contract",
      stream: true,
      output_format: "hex",
      language_boost: "auto",
      voice_setting: { voice_id: "voice-a", speed: 1, vol: 1, pitch: 0 },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 }
    });
  });

  it("supports final-only SSE and JSON success at the same byte-stream seam", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        miniMaxResponse('data: {"data":{"audio":"abcd","status":2}}\n', "text/event-stream")
      )
      .mockResolvedValueOnce(miniMaxResponse('{"data":{"audio":"0102"}}', "application/json"));
    vi.stubGlobal("fetch", fetchMock);
    const chunks: number[][] = [];

    for (let index = 0; index < 2; index += 1) {
      await streamMiniMaxSpeechAudio({
        ...speechRequest(),
        onAudioChunk: (bytes) => {
          chunks.push(Array.from(bytes));
        }
      });
    }

    expect(chunks).toEqual([
      [171, 205],
      [1, 2]
    ]);
  });

  it("parses an SSE event split across network chunks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        miniMaxStreamResponse([
          'data: {"data":{"au',
          'dio":"abcd","status":',
          "2}}\n"
        ])
      )
    );
    const chunks: number[][] = [];

    await streamMiniMaxSpeechAudio({
      ...speechRequest(),
      onAudioChunk: (bytes) => {
        chunks.push(Array.from(bytes));
      }
    });

    expect(chunks).toEqual([[171, 205]]);
  });

  it.each([
    ["empty SSE", "", "text/event-stream"],
    ["SSE without audio", 'data: {"data":{"status":2}}\n', "text/event-stream"],
    ["JSON without audio", '{"data":{"status":2}}', "application/json"]
  ])("rejects %s instead of resolving an empty audio stream", async (_name, body, contentType) => {
    vi.stubGlobal("fetch", vi.fn(async () => miniMaxResponse(body, contentType)));

    await expect(
      streamMiniMaxSpeechAudio({ ...speechRequest(), onAudioChunk: vi.fn() })
    ).rejects.toThrow("MiniMax TTS returned no audio.");
  });

  it.each(["abc", "gg", "0x01", "12 34"])(
    "rejects malformed audio hex without emitting bytes: %s",
    async (audioHex) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          miniMaxResponse(
            `data: ${JSON.stringify({ data: { audio: audioHex, status: 2 } })}\n`,
            "text/event-stream"
          )
        )
      );
      const onAudioChunk = vi.fn();

      await expect(
        streamMiniMaxSpeechAudio({ ...speechRequest(), onAudioChunk })
      ).rejects.toThrow("MiniMax TTS returned malformed audio hex.");
      expect(onAudioChunk).not.toHaveBeenCalled();
    }
  );

  it("validates a final aggregate even after incremental audio was emitted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        miniMaxResponse(
          'data: {"data":{"audio":"0102","status":1}}\n\ndata: {"data":{"audio":"abc","status":2}}\n',
          "text/event-stream"
        )
      )
    );
    const chunks: number[][] = [];

    await expect(
      streamMiniMaxSpeechAudio({
        ...speechRequest(),
        onAudioChunk: (bytes) => {
          chunks.push(Array.from(bytes));
        }
      })
    ).rejects.toThrow("MiniMax TTS returned malformed audio hex.");
    expect(chunks).toEqual([[1, 2]]);
  });

  it("maps untrusted provider and parser errors to stable non-content messages", async () => {
    const sensitive = "api-key=sk-private reading-target=private-text";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        miniMaxResponse(
          JSON.stringify({
            base_resp: { status_code: 1004, status_msg: `invalid api key ${sensitive}` }
          }),
          "application/json",
          401
        )
      )
      .mockResolvedValueOnce(
        miniMaxResponse(
          JSON.stringify({
            base_resp: { status_code: 1004, status_msg: `invalid api key ${sensitive}` }
          }),
          "application/json",
          401
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const authorizationError = await streamMiniMaxSpeechAudio({
      ...speechRequest(),
      onAudioChunk: vi.fn()
    }).catch((error: unknown) => error);
    expect(authorizationError).toMatchObject({ message: "MiniMax TTS authorization failed." });
    expect(String(authorizationError)).not.toContain(sensitive);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        miniMaxResponse(
          `data: {"data":{"audio":"abcd"},"leak":"${sensitive}"\n`,
          "text/event-stream"
        )
      )
    );
    const parseError = await streamMiniMaxSpeechAudio({
      ...speechRequest(),
      onAudioChunk: vi.fn()
    }).catch((error: unknown) => error);
    expect(parseError).toMatchObject({ message: "MiniMax TTS returned malformed streaming data." });
    expect(String(parseError)).not.toContain(sensitive);
  });

  it("preserves endpoint fallback and callback backpressure", async () => {
    let releaseFirstChunk: (() => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        miniMaxResponse(
          JSON.stringify({ base_resp: { status_code: 1004, status_msg: "credential rejected" } }),
          "application/json",
          401
        )
      )
      .mockResolvedValueOnce(
        miniMaxResponse(
          'data: {"data":{"audio":"0102","status":1}}\n\ndata: {"data":{"audio":"0304","status":1}}\n',
          "text/event-stream"
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    const chunks: number[][] = [];
    const streaming = streamMiniMaxSpeechAudio({
      ...speechRequest(),
      onAudioChunk: async (bytes) => {
        chunks.push(Array.from(bytes));
        if (chunks.length === 1) {
          await new Promise<void>((resolve) => {
            releaseFirstChunk = resolve;
          });
        }
      }
    });

    await vi.waitFor(() => expect(chunks).toEqual([[1, 2]]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    releaseFirstChunk?.();
    await streaming;
    expect(chunks).toEqual([
      [1, 2],
      [3, 4]
    ]);
  });

  it("preserves AbortError identity without trying the fallback endpoint", async () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError");
    const fetchMock = vi.fn(async () => {
      throw abortError;
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      streamMiniMaxSpeechAudio({ ...speechRequest(), onAudioChunk: vi.fn() })
    ).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

function speechRequest() {
  return {
    apiKey: "sk-test",
    model: "speech-2.8-turbo",
    voiceId: "voice-a",
    text: "adapter contract",
    signal: new AbortController().signal
  };
}

function miniMaxResponse(body: string, contentType: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": contentType } });
}

function miniMaxStreamResponse(chunks: string[]): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      }
    }),
    { headers: { "content-type": "text/event-stream" } }
  );
}
