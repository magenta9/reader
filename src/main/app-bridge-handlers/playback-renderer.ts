import { playbackRendererRoleContract } from "../../shared/role-bridge-contracts.js";
import type { ImplementationFromContract } from "../../shared/role-bridge-registry.js";
import type { AppBridgeHandlerDependencies } from "./dependencies.js";

export interface PlaybackRendererImplementationDependencies {
  overlayController: Pick<AppBridgeHandlerDependencies["overlayController"], "sendMetric">;
  playbackCommands: Pick<AppBridgeHandlerDependencies["playbackCommands"], "handleAudioOutcome">;
}

export function createPlaybackRendererImplementation({
  overlayController,
  playbackCommands
}: PlaybackRendererImplementationDependencies): ImplementationFromContract<
  typeof playbackRendererRoleContract
> {
  return {
    reportAudioOutcome: (outcome) => playbackCommands.handleAudioOutcome(outcome),
    sendOverlayMetric: (metric) => overlayController.sendMetric(metric)
  };
}
