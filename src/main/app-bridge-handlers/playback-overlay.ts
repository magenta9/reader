import { playbackOverlayRoleContract } from "../../shared/role-bridge-contracts.js";
import type { ImplementationFromContract } from "../../shared/role-bridge-registry.js";
import type { AppBridgeHandlerDependencies } from "./dependencies.js";

export interface PlaybackOverlayImplementationDependencies {
  overlayController: Pick<AppBridgeHandlerDependencies["overlayController"], "markReady">;
}

export function createPlaybackOverlayImplementation({
  overlayController
}: PlaybackOverlayImplementationDependencies): ImplementationFromContract<
  typeof playbackOverlayRoleContract
> {
  return { notifyOverlayReady: () => overlayController.markReady() };
}
