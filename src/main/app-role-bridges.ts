import type { WebContents } from "electron";

import {
  playbackOverlayRoleContract,
  playbackRendererRoleContract,
  readerWindowRoleContract
} from "../shared/role-bridge-contracts.js";
import {
  createRoleEventEmitter,
  registerRoleHandlers,
  type BeforeInvokeFromContract,
  type EventEmitterFromContract,
  type ImplementationFromContract
} from "../shared/role-bridge-registry.js";
import {
  createAppDataImplementation,
  type AppDataImplementationDependencies
} from "./app-bridge-handlers/app-data.js";
import {
  createAppShellImplementation,
  type AppShellImplementationDependencies
} from "./app-bridge-handlers/app-shell.js";
import {
  createClipboardImplementation,
  type ClipboardImplementationDependencies
} from "./app-bridge-handlers/clipboard.js";
import type { AppBridgeHandlerDependencies } from "./app-bridge-handlers/dependencies.js";
import {
  createPlaybackControlImplementation,
  type PlaybackControlImplementationDependencies
} from "./app-bridge-handlers/playback-control.js";
import { createPlaybackOverlayImplementation } from "./app-bridge-handlers/playback-overlay.js";
import { createPlaybackRendererImplementation } from "./app-bridge-handlers/playback-renderer.js";
import {
  createElectronMainRoleEventTransport,
  createElectronMainRoleHandlerTransport
} from "./electron-main-role-transport.js";

export function registerAppRoleBridges(dependencies: AppBridgeHandlerDependencies): void {
  const transport = createElectronMainRoleHandlerTransport(dependencies.ipcMain);
  registerRoleHandlers(
    readerWindowRoleContract,
    createReaderWindowImplementation(dependencies),
    transport,
    createReaderWindowBeforeInvoke(dependencies)
  );
  registerRoleHandlers(
    playbackRendererRoleContract,
    createPlaybackRendererImplementation(dependencies),
    transport
  );
  registerRoleHandlers(
    playbackOverlayRoleContract,
    createPlaybackOverlayImplementation(dependencies),
    transport
  );
}

export function createReaderWindowEvents(
  webContents: Pick<WebContents, "send">
): EventEmitterFromContract<typeof readerWindowRoleContract> {
  return createRoleEventEmitter(
    readerWindowRoleContract,
    createElectronMainRoleEventTransport(webContents)
  );
}

export function createReaderWindowImplementation(
  dependencies: ReaderWindowImplementationDependencies
): ImplementationFromContract<typeof readerWindowRoleContract> {
  return {
    ...createAppShellImplementation(dependencies),
    ...createAppDataImplementation(dependencies),
    ...createPlaybackControlImplementation(dependencies),
    ...createClipboardImplementation(dependencies)
  };
}

export type ReaderWindowImplementationDependencies = AppShellImplementationDependencies &
  AppDataImplementationDependencies &
  PlaybackControlImplementationDependencies &
  ClipboardImplementationDependencies;

export interface ReaderWindowInvocationDependencies {
  readingTargetAcquirer: Pick<
    AppBridgeHandlerDependencies["readingTargetAcquirer"],
    "revealPreviousAppBeforeCapture"
  >;
  shouldRevealPreviousAppBeforeSelectionCapture: AppBridgeHandlerDependencies["shouldRevealPreviousAppBeforeSelectionCapture"];
}

export function createReaderWindowBeforeInvoke({
  readingTargetAcquirer,
  shouldRevealPreviousAppBeforeSelectionCapture
}: ReaderWindowInvocationDependencies): BeforeInvokeFromContract<
  typeof readerWindowRoleContract
> {
  return {
    playReadingTarget: async ({ senderId }) => {
      if (
        senderId !== undefined &&
        shouldRevealPreviousAppBeforeSelectionCapture(senderId)
      ) {
        await readingTargetAcquirer.revealPreviousAppBeforeCapture();
      }
    }
  };
}
