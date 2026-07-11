import type { BrowserWindow } from "electron";
import { describe, expect, it, vi } from "vitest";

import { ElectronPlaybackOutput } from "../../../src/main/playback/electron-playback-output.js";
import {
  PLAYBACK_FEEDBACK_SURFACES,
  type PlaybackAudioSession
} from "../../../src/shared/app-contracts.js";
import { RENDERER_AUDIO_CHANNELS } from "../../../src/shared/bridge-contracts.js";

describe("ElectronPlaybackOutput", () => {
  it("becomes available only after its owned Playback Renderer is ready", async () => {
    const renderer = createWindow();
    const ready = deferred<void>();
    renderer.loadFile.mockReturnValueOnce(ready.promise);
    let created = false;

    const creating = createOutput({ playbackRenderer: renderer }).then((output) => {
      created = true;
      return output;
    });

    await Promise.resolve();
    expect(renderer.loadFile).toHaveBeenCalledWith("/app/playback-renderer/index.html");
    expect(created).toBe(false);

    ready.resolve();
    const output = await creating;

    expect(created).toBe(true);
    output.destroy();
  });

  it("delivers a complete Playback Session to its owned renderer without a Reader Window", async () => {
    const renderer = createWindow();
    const overlayActions: string[] = [];
    const output = await createOutput({ playbackRenderer: renderer, overlayActions });
    const session = createSession(101, PLAYBACK_FEEDBACK_SURFACES.playbackOverlay);

    output.startSession(session);
    output.audioChunk(101, new Uint8Array([1, 2, 3]));
    output.endSegment(101);
    output.finishSession(101);

    expect(renderer.messages).toEqual([
      [RENDERER_AUDIO_CHANNELS.startSession, session],
      [RENDERER_AUDIO_CHANNELS.audioChunk, { sessionId: 101, bytes: new Uint8Array([1, 2, 3]) }],
      [RENDERER_AUDIO_CHANNELS.endSegment, { sessionId: 101 }],
      [RENDERER_AUDIO_CHANNELS.finishSession, { sessionId: 101 }]
    ]);
    expect(overlayActions).toEqual(["show"]);
  });

  it.each([
    PLAYBACK_FEEDBACK_SURFACES.historyDetail,
    PLAYBACK_FEEDBACK_SURFACES.favoriteDetail
  ])("keeps the Playback Overlay hidden for the %s Feedback Surface", async (feedbackSurface) => {
    const renderer = createWindow();
    const overlayActions: string[] = [];
    const output = await createOutput({ playbackRenderer: renderer, overlayActions });

    output.startSession(createSession(202, feedbackSurface));
    output.finishSession(202);

    expect(overlayActions).toEqual([]);
    expect(renderer.messages.map(([channel]) => channel)).toEqual([
      RENDERER_AUDIO_CHANNELS.startSession,
      RENDERER_AUDIO_CHANNELS.finishSession
    ]);
  });

  it("sends terminal feedback to an optional Reader Window without routing audio through it", async () => {
    const renderer = createWindow();
    const reader = createWindow();
    const output = await createOutput({ playbackRenderer: renderer, readerWindow: reader });

    output.startSession(createSession(301, PLAYBACK_FEEDBACK_SURFACES.historyDetail));
    output.audioChunk(301, new Uint8Array([9]));
    output.endSegment(301);
    output.finishSession(301);
    output.startSession(createSession(302, PLAYBACK_FEEDBACK_SURFACES.favoriteDetail));
    output.failSession(302);
    output.startSession(createSession(303, PLAYBACK_FEEDBACK_SURFACES.playbackOverlay));
    output.stopSession(303);

    expect(reader.messages).toEqual([
      [RENDERER_AUDIO_CHANNELS.finishSession, { sessionId: 301 }],
      [RENDERER_AUDIO_CHANNELS.failSession, { sessionId: 302 }]
    ]);
    expect(renderer.messages.map(([channel]) => channel)).toEqual([
      RENDERER_AUDIO_CHANNELS.startSession,
      RENDERER_AUDIO_CHANNELS.audioChunk,
      RENDERER_AUDIO_CHANNELS.endSegment,
      RENDERER_AUDIO_CHANNELS.finishSession,
      RENDERER_AUDIO_CHANNELS.startSession,
      RENDERER_AUDIO_CHANNELS.failSession,
      RENDERER_AUDIO_CHANNELS.startSession,
      RENDERER_AUDIO_CHANNELS.stopSession
    ]);
  });

  it("keeps Playback Overlay ownership scoped to the active Playback Session", async () => {
    const renderer = createWindow();
    const overlayActions: string[] = [];
    const output = await createOutput({ playbackRenderer: renderer, overlayActions });

    output.startSession(createSession(401, PLAYBACK_FEEDBACK_SURFACES.playbackOverlay));
    output.handleRendererIdle(999);
    output.startSession(createSession(402, PLAYBACK_FEEDBACK_SURFACES.playbackOverlay));
    output.stopSession(401);
    output.handleRendererIdle(402);
    output.stopSession(402);

    expect(overlayActions).toEqual(["show", "stop", "show"]);
  });

  it("destroys its owned Playback Renderer exactly once", async () => {
    const renderer = createWindow();
    const output = await createOutput({ playbackRenderer: renderer });

    output.destroy();
    output.destroy();

    expect(renderer.destroy).toHaveBeenCalledTimes(1);
    expect(renderer.destroyed).toBe(true);
  });

  it("fails loudly instead of dropping a Playback Session after teardown", async () => {
    const renderer = createWindow();
    const output = await createOutput({ playbackRenderer: renderer });
    output.destroy();

    expect(() =>
      output.startSession(createSession(501, PLAYBACK_FEEDBACK_SURFACES.playbackOverlay))
    ).toThrow("Playback Renderer is unavailable.");
    expect(renderer.messages).toEqual([]);
  });
});

interface FakeWindow {
  browserWindow: BrowserWindow;
  destroy: ReturnType<typeof vi.fn>;
  destroyed: boolean;
  loadFile: ReturnType<typeof vi.fn>;
  messages: Array<[string, unknown]>;
}

function createWindow(): FakeWindow {
  const messages: Array<[string, unknown]> = [];
  const fake: Omit<FakeWindow, "browserWindow"> = {
    destroyed: false,
    destroy: vi.fn(() => {
      fake.destroyed = true;
    }),
    loadFile: vi.fn(() => Promise.resolve()),
    messages
  };
  const browserWindow = {
    destroy: fake.destroy,
    isDestroyed: () => fake.destroyed,
    loadFile: fake.loadFile,
    webContents: {
      send: (channel: string, payload: unknown) => {
        messages.push([channel, payload]);
      }
    }
  } as unknown as BrowserWindow;
  return {
    browserWindow,
    destroy: fake.destroy,
    get destroyed() {
      return fake.destroyed;
    },
    loadFile: fake.loadFile,
    messages
  };
}

async function createOutput({
  overlayActions = [],
  playbackRenderer,
  readerWindow
}: {
  overlayActions?: string[];
  playbackRenderer: FakeWindow;
  readerWindow?: FakeWindow;
}): Promise<ElectronPlaybackOutput> {
  return ElectronPlaybackOutput.create({
    createPlaybackRenderer: () => playbackRenderer.browserWindow,
    getReaderWindow: () => readerWindow?.browserWindow,
    overlay: {
      fail: () => overlayActions.push("fail"),
      show: () => overlayActions.push("show"),
      stop: () => overlayActions.push("stop")
    },
    playbackRendererEntry: "/app/playback-renderer/index.html"
  });
}

function createSession(
  sessionId: number,
  feedbackSurface: PlaybackAudioSession["feedbackSurface"]
): PlaybackAudioSession {
  return {
    sessionId,
    speechRate: 1,
    feedbackSurface,
    segmentWeights: [1]
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
