import { playbackOverlayRoleContract } from "../../shared/role-bridge-contracts.js";
import {
  registerRoleHandlers,
  type ImplementationFromContract
} from "../../shared/role-bridge-registry.js";
import { createElectronMainRoleHandlerTransport } from "../electron-main-role-transport.js";
import type { AppBridgeHandlerDependencies } from "./dependencies.js";

export interface PlaybackOverlayImplementationDependencies {
  overlayController: Pick<AppBridgeHandlerDependencies["overlayController"], "markReady">;
}

type PlaybackOverlayHandlerDependencies = PlaybackOverlayImplementationDependencies &
  Pick<AppBridgeHandlerDependencies, "ipcMain">;

export function registerPlaybackOverlayHandlers({
  ipcMain,
  overlayController
}: PlaybackOverlayHandlerDependencies): void {
  registerRoleHandlers(
    playbackOverlayRoleContract,
    createPlaybackOverlayImplementation({ overlayController }),
    createElectronMainRoleHandlerTransport(ipcMain)
  );
}

export function createPlaybackOverlayImplementation({
  overlayController
}: PlaybackOverlayImplementationDependencies): ImplementationFromContract<
  typeof playbackOverlayRoleContract
> {
  return { notifyOverlayReady: () => overlayController.markReady() };
}
