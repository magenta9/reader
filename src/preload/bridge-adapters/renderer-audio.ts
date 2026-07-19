import type { PlaybackFeedbackBridge, PlaybackRendererBridge } from "../../shared/bridge-contracts.js";
import {
  playbackFeedbackRoleContract,
  playbackRendererRoleContract
} from "../../shared/role-bridge-contracts.js";
import { createRoleBridge } from "../../shared/role-bridge-registry.js";
import { createElectronRendererRoleTransport } from "../electron-renderer-role-transport.js";
import type { PreloadIpc } from "./ipc.js";

export function createPlaybackFeedbackBridge(ipc: PreloadIpc): PlaybackFeedbackBridge {
  return createRoleBridge(playbackFeedbackRoleContract, createElectronRendererRoleTransport(ipc));
}

export function createPlaybackRendererBridge(ipc: PreloadIpc): PlaybackRendererBridge {
  return createRoleBridge(playbackRendererRoleContract, createElectronRendererRoleTransport(ipc));
}
