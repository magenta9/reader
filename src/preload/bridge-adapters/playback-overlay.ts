import type { PlaybackOverlayBridge } from "../../shared/bridge-contracts.js";
import { playbackOverlayRoleContract } from "../../shared/role-bridge-contracts.js";
import { createRoleBridge } from "../../shared/role-bridge-registry.js";
import { createElectronRendererRoleTransport } from "../electron-renderer-role-transport.js";
import type { PreloadIpc } from "./ipc.js";

export function createPlaybackOverlayBridge(ipc: PreloadIpc): PlaybackOverlayBridge {
  return createRoleBridge(playbackOverlayRoleContract, createElectronRendererRoleTransport(ipc));
}
