import type { PlaybackControlBridge } from "../../shared/bridge-contracts.js";
import { playbackControlRoleContract } from "../../shared/role-bridge-contracts.js";
import { createRoleBridge } from "../../shared/role-bridge-registry.js";
import { createElectronRendererRoleTransport } from "../electron-renderer-role-transport.js";
import type { PreloadIpc } from "./ipc.js";

export function createPlaybackControlBridge(ipc: PreloadIpc): PlaybackControlBridge {
  return createRoleBridge(playbackControlRoleContract, createElectronRendererRoleTransport(ipc));
}
