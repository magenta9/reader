import { playbackControlRoleContract } from "../../shared/role-bridge-contracts.js";
import type { ImplementationFromContract } from "../../shared/role-bridge-registry.js";
import type { AppBridgeHandlerDependencies } from "./dependencies.js";

export interface PlaybackControlImplementationDependencies {
  playbackCommands: Pick<
    AppBridgeHandlerDependencies["playbackCommands"],
    "startReadingTargetPlayback" | "startHistoryReplay" | "startFavoriteReplay" | "stopPlayback"
  >;
}

export function createPlaybackControlImplementation({
  playbackCommands
}: PlaybackControlImplementationDependencies): ImplementationFromContract<
  typeof playbackControlRoleContract
> {
  return {
    playReadingTarget: () => playbackCommands.startReadingTargetPlayback("reader_window"),
    playHistoryRecord: (id) => playbackCommands.startHistoryReplay(id),
    playFavoriteRecord: (id) => playbackCommands.startFavoriteReplay(id),
    stopPlayback: () => playbackCommands.stopPlayback()
  };
}
