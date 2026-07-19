import { clipboardRoleContract } from "../../shared/role-bridge-contracts.js";
import type { ImplementationFromContract } from "../../shared/role-bridge-registry.js";
import type { AppBridgeHandlerDependencies } from "./dependencies.js";

export interface ClipboardImplementationDependencies {
  clipboard: Pick<AppBridgeHandlerDependencies["clipboard"], "writeText">;
}

export function createClipboardImplementation({
  clipboard
}: ClipboardImplementationDependencies): ImplementationFromContract<
  typeof clipboardRoleContract
> {
  return { copyText: (text) => clipboard.writeText(text) };
}
