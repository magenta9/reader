import { registerAppDataHandlers } from "./app-bridge-handlers/app-data.js";
import { registerAppShellHandlers } from "./app-bridge-handlers/app-shell.js";
import { registerClipboardHandlers } from "./app-bridge-handlers/clipboard.js";
import type { AppBridgeHandlerDependencies } from "./app-bridge-handlers/dependencies.js";
import { registerPlaybackControlHandlers } from "./app-bridge-handlers/playback-control.js";
import { registerPlaybackOverlayHandlers } from "./app-bridge-handlers/playback-overlay.js";
import { registerPlaybackRendererHandlers } from "./app-bridge-handlers/playback-renderer.js";

export function registerAppBridgeHandlers(dependencies: AppBridgeHandlerDependencies): void {
  registerAppShellHandlers(dependencies);
  registerAppDataHandlers(dependencies);
  registerPlaybackControlHandlers(dependencies);
  registerPlaybackRendererHandlers(dependencies);
  registerClipboardHandlers(dependencies);
  registerPlaybackOverlayHandlers(dependencies);
}
