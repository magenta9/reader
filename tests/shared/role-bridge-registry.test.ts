import { describe, expect, it, vi } from "vitest";

import {
  createRoleBridge,
  createRoleEventEmitter,
  defineRoleBridgeContract,
  defineRoleBridgeRegistry,
  eventEndpoint,
  getRoleBridgeContract,
  invokeEndpoint,
  registerRoleHandlers,
  type BridgeFromContract,
  type ImplementationFromContract
} from "../../src/shared/role-bridge-registry.js";
import { InMemoryRoleBridgeLoopback } from "../../src/shared/role-bridge-loopback.js";
import {
  playbackOverlayRoleContract,
  playbackRendererRoleContract,
  readerWindowRoleContract,
  voiceReaderRoleBridgeRegistry
} from "../../src/shared/role-bridge-contracts.js";
import type {
  PlaybackAudioOutcome,
  PlaybackAudioSession,
  OverlayMetric,
  SessionOverlayMetric,
  SessionPayload
} from "../../src/shared/app-contracts.js";

const fixtureContract = defineRoleBridgeContract("fixture", [
  invokeEndpoint<[left: number, right: number], number>()("add", "test:add"),
  invokeEndpoint<[message: string], void>()("fail", "test:fail"),
  eventEndpoint<[value: string]>()("onValue", "emitValue", "test:value")
] as const);

type FixtureBridge = BridgeFromContract<typeof fixtureContract>;
type FixtureImplementation = ImplementationFromContract<typeof fixtureContract>;

describe("role bridge registry", () => {
  it("runs invoke endpoints through the loopback and preserves promise errors", async () => {
    const loopback = new InMemoryRoleBridgeLoopback();
    const implementation: FixtureImplementation = {
      add: (left, right) => left + right,
      fail: (message) => {
        throw new Error(message);
      }
    };
    registerRoleHandlers(fixtureContract, implementation, loopback);
    const bridge: FixtureBridge = createRoleBridge(fixtureContract, loopback);

    await expect(bridge.add(2, 5)).resolves.toBe(7);
    await expect(bridge.fail("expected failure")).rejects.toThrow("expected failure");
  });

  it("delivers typed events in order and removes the exact subscribed listener", () => {
    const loopback = new InMemoryRoleBridgeLoopback();
    const bridge = createRoleBridge(fixtureContract, loopback);
    const events = createRoleEventEmitter(fixtureContract, loopback);
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = bridge.onValue(first);
    bridge.onValue(second);

    events.emitValue("one");
    unsubscribeFirst();
    events.emitValue("two");

    expect(first.mock.calls).toEqual([["one"]]);
    expect(second.mock.calls).toEqual([["one"], ["two"]]);
  });

  it("rejects duplicate methods and channels before exposing a role", () => {
    expect(() =>
      defineRoleBridgeContract("duplicate-method", [
        invokeEndpoint<[], void>()("same", "duplicate:first"),
        invokeEndpoint<[], void>()("same", "duplicate:second")
      ] as const)
    ).toThrow("duplicate endpoint method same");

    const first = defineRoleBridgeContract("first", [
      invokeEndpoint<[], void>()("first", "duplicate:channel")
    ] as const);
    const second = defineRoleBridgeContract("second", [
      invokeEndpoint<[], void>()("second", "duplicate:channel")
    ] as const);
    expect(() => defineRoleBridgeRegistry([first, second] as const)).toThrow(
      "duplicate endpoint channel duplicate:channel"
    );

    const reverseDirection = defineRoleBridgeContract("reverse-direction", [
      eventEndpoint<[]>()("onReverse", "emitReverse", "duplicate:channel")
    ] as const);
    expect(() => defineRoleBridgeRegistry([first, reverseDirection] as const)).not.toThrow();
  });

  it("fails registration atomically when an invoke implementation is missing", async () => {
    const loopback = new InMemoryRoleBridgeLoopback();
    const incomplete = { add: (left: number, right: number) => left + right };

    expect(() =>
      registerRoleHandlers(fixtureContract, incomplete as FixtureImplementation, loopback)
    ).toThrow("fixture is missing implementation fail");
    await expect(loopback.invoke("test:add", [1, 2])).rejects.toThrow("No handler registered");
  });

  it("runs typed before-invoke hooks with transport context before the implementation", async () => {
    const order: string[] = [];
    let addHandler:
      | ((context: { senderId?: number }, args: readonly unknown[]) => unknown)
      | undefined;
    registerRoleHandlers(
      fixtureContract,
      {
        add: (left, right) => {
          order.push("implementation");
          return left + right;
        },
        fail: () => undefined
      },
      {
        handle: (channel, handler) => {
          if (channel === "test:add") addHandler = handler;
        }
      },
      {
        add: ({ senderId }) => {
          order.push(`before:${senderId}`);
        }
      }
    );

    await expect(addHandler?.({ senderId: 17 }, [2, 5])).resolves.toBe(7);
    expect(order).toEqual(["before:17", "implementation"]);
  });

  it("uses an explicit role allow-list and never infers roles from implementation objects", () => {
    const overlay = defineRoleBridgeContract("overlay", [
      eventEndpoint<[]>()("onShow", "emitShow", "overlay:show")
    ] as const);
    const registry = defineRoleBridgeRegistry([fixtureContract, overlay] as const);

    expect(getRoleBridgeContract(registry, "fixture")).toBe(fixtureContract);
    expect(() => getRoleBridgeContract(registry, "unknown")).toThrow("Unknown bridge role unknown");
    expect(Object.keys(createRoleBridge(overlay, new InMemoryRoleBridgeLoopback()))).toEqual(["onShow"]);
  });

  it("executes the real role contracts without exposing another role's capabilities", async () => {
    const readerLoopback = new InMemoryRoleBridgeLoopback();
    const readerBridge = createRoleBridge(readerWindowRoleContract, readerLoopback);
    registerRoleHandlers(
      readerWindowRoleContract,
      createReaderImplementation({ copyText: (text) => text.length }),
      readerLoopback
    );
    const readerEvents = createRoleEventEmitter(readerWindowRoleContract, readerLoopback);
    const feedback: SessionPayload[] = [];
    readerBridge.onPlaybackFinish((payload) => feedback.push(payload));

    await expect(readerBridge.copyText("reader")).resolves.toBeUndefined();
    readerEvents.emitPlaybackFinish({ sessionId: 41 });
    expect(feedback).toEqual([{ sessionId: 41 }]);
    expect("reportAudioOutcome" in readerBridge).toBe(false);
    expect("onOverlayShow" in readerBridge).toBe(false);

    const rendererLoopback = new InMemoryRoleBridgeLoopback();
    const rendererBridge = createRoleBridge(playbackRendererRoleContract, rendererLoopback);
    const outcomes: PlaybackAudioOutcome[] = [];
    const metrics: SessionOverlayMetric[] = [];
    registerRoleHandlers(
      playbackRendererRoleContract,
      {
        reportAudioOutcome: (outcome) => void outcomes.push(outcome),
        sendOverlayMetric: (metric) => void metrics.push(metric)
      },
      rendererLoopback
    );
    const rendererEvents = createRoleEventEmitter(playbackRendererRoleContract, rendererLoopback);
    const starts: PlaybackAudioSession[] = [];
    rendererBridge.onPlaybackStart((session) => starts.push(session));
    const session: PlaybackAudioSession = {
      sessionId: 42,
      speechRate: 1,
      feedbackSurface: "playback_overlay",
      segmentWeights: [1]
    };
    const metric: SessionOverlayMetric = { sessionId: 42, amplitude: 0.4, progress: 0.5 };

    rendererEvents.emitPlaybackStart(session);
    await rendererBridge.reportAudioOutcome({ sessionId: 42, status: "completed" });
    await rendererBridge.sendOverlayMetric(metric);
    expect(starts).toEqual([session]);
    expect(outcomes).toEqual([{ sessionId: 42, status: "completed" }]);
    expect(metrics).toEqual([metric]);
    expect("copyText" in rendererBridge).toBe(false);
    expect("onOverlayShow" in rendererBridge).toBe(false);

    const overlayLoopback = new InMemoryRoleBridgeLoopback();
    const overlayBridge = createRoleBridge(playbackOverlayRoleContract, overlayLoopback);
    registerRoleHandlers(
      playbackOverlayRoleContract,
      { notifyOverlayReady: () => undefined },
      overlayLoopback
    );
    const overlayEvents = createRoleEventEmitter(playbackOverlayRoleContract, overlayLoopback);
    const overlayMetrics: OverlayMetric[] = [];
    overlayBridge.onOverlayMetric((value) => overlayMetrics.push(value));

    const overlayMetric: OverlayMetric = { amplitude: 0.4, progress: 0.5 };
    overlayEvents.emitOverlayMetric(overlayMetric);
    await expect(overlayBridge.notifyOverlayReady()).resolves.toBeUndefined();
    expect(overlayMetrics).toEqual([overlayMetric]);
    expect("sendOverlayMetric" in overlayBridge).toBe(false);
    expect("onPlaybackStart" in overlayBridge).toBe(false);
  });

  it("keeps the production role allow-list and same-name reverse directions explicit", () => {
    expect(getRoleBridgeContract(voiceReaderRoleBridgeRegistry, "reader-window")).toBe(
      readerWindowRoleContract
    );
    expect(getRoleBridgeContract(voiceReaderRoleBridgeRegistry, "playback-renderer")).toBe(
      playbackRendererRoleContract
    );
    expect(getRoleBridgeContract(voiceReaderRoleBridgeRegistry, "playback-overlay")).toBe(
      playbackOverlayRoleContract
    );
    expect(() => getRoleBridgeContract(voiceReaderRoleBridgeRegistry, "untrusted-window")).toThrow(
      "Unknown bridge role untrusted-window"
    );

    const rendererMetric = playbackRendererRoleContract.endpoints.find(
      (endpoint) => endpoint.method === "sendOverlayMetric"
    );
    const overlayMetric = playbackOverlayRoleContract.endpoints.find(
      (endpoint) => endpoint.method === "onOverlayMetric"
    );
    expect(rendererMetric).toMatchObject({ kind: "invoke", channel: "overlay:metric" });
    expect(overlayMetric).toMatchObject({ kind: "event", channel: "overlay:metric" });
  });
});

function createReaderImplementation(overrides: { copyText: (text: string) => number }) {
  return new Proxy(
    { copyText: (text: string) => void overrides.copyText(text) },
    {
      get: (target, property) =>
        property in target ? Reflect.get(target, property) : () => undefined
    }
  ) as ImplementationFromContract<typeof readerWindowRoleContract>;
}
