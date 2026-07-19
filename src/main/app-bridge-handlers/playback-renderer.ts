import { playbackRendererRoleContract } from "../../shared/role-bridge-contracts.js";
import {
  registerRoleHandlers,
  type ImplementationFromContract
} from "../../shared/role-bridge-registry.js";
import { createElectronMainRoleHandlerTransport } from "../electron-main-role-transport.js";
import type { AppBridgeHandlerDependencies } from "./dependencies.js";

export interface PlaybackRendererImplementationDependencies {
  overlayController: Pick<AppBridgeHandlerDependencies["overlayController"], "sendMetric">;
  playbackCommands: Pick<AppBridgeHandlerDependencies["playbackCommands"], "handleAudioOutcome">;
}

type PlaybackRendererHandlerDependencies = PlaybackRendererImplementationDependencies &
  Pick<AppBridgeHandlerDependencies, "ipcMain">;

export function registerPlaybackRendererHandlers({
  ipcMain,
  overlayController,
  playbackCommands
}: PlaybackRendererHandlerDependencies): void {
  registerRoleHandlers(
    playbackRendererRoleContract,
    createPlaybackRendererImplementation({ overlayController, playbackCommands }),
    createElectronMainRoleHandlerTransport(ipcMain)
  );
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
