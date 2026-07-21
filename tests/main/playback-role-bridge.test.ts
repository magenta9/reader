import { describe, expect, it, vi } from "vitest";

import {
  createPlaybackOverlayImplementation,
  type PlaybackOverlayImplementationDependencies
} from "../../src/main/app-bridge-handlers/playback-overlay.js";
import {
  createPlaybackRendererImplementation,
  type PlaybackRendererImplementationDependencies
} from "../../src/main/app-bridge-handlers/playback-renderer.js";
import {
  playbackOverlayRoleContract,
  playbackRendererRoleContract
} from "../../src/shared/role-bridge-contracts.js";
import { InMemoryRoleBridgeLoopback } from "../../src/shared/role-bridge-loopback.js";
import { createRoleBridge, registerRoleHandlers } from "../../src/shared/role-bridge-registry.js";

describe("Playback role bridge implementations", () => {
  it("routes renderer outcome, metric, and overlay ready commands to their owners", async () => {
    const loopback = new InMemoryRoleBridgeLoopback();
    const handleAudioOutcome = vi.fn();
    const sendMetric = vi.fn();
    const markReady = vi.fn();
    const rendererDependencies = {
      playbackCommands: { handleAudioOutcome },
      overlayController: { sendMetric }
    } satisfies PlaybackRendererImplementationDependencies;
    const overlayDependencies = {
      overlayController: { markReady }
    } satisfies PlaybackOverlayImplementationDependencies;
    registerRoleHandlers(
      playbackRendererRoleContract,
      createPlaybackRendererImplementation(rendererDependencies),
      loopback
    );
    registerRoleHandlers(
      playbackOverlayRoleContract,
      createPlaybackOverlayImplementation(overlayDependencies),
      loopback
    );
    const renderer = createRoleBridge(playbackRendererRoleContract, loopback);
    const overlay = createRoleBridge(playbackOverlayRoleContract, loopback);
    const outcome = { sessionId: 9, status: "completed" as const };
    const metric = { sessionId: 9, amplitude: 0.5, progress: 0.75 };

    await renderer.reportAudioOutcome(outcome);
    await renderer.sendOverlayMetric(metric);
    await overlay.notifyOverlayReady();

    expect(handleAudioOutcome).toHaveBeenCalledWith(outcome);
    expect(sendMetric).toHaveBeenCalledWith(metric);
    expect(markReady).toHaveBeenCalledOnce();
  });

  it("preserves renderer command failures as rejected promises", async () => {
    const loopback = new InMemoryRoleBridgeLoopback();
    const dependencies = {
      playbackCommands: {
        handleAudioOutcome: () => {
          throw new Error("stale playback session");
        }
      },
      overlayController: { sendMetric: vi.fn() }
    } satisfies PlaybackRendererImplementationDependencies;
    registerRoleHandlers(
      playbackRendererRoleContract,
      createPlaybackRendererImplementation(dependencies),
      loopback
    );

    const renderer = createRoleBridge(playbackRendererRoleContract, loopback);
    await expect(
      renderer.reportAudioOutcome({ sessionId: 10, status: "failed" })
    ).rejects.toThrow("stale playback session");
  });
});
