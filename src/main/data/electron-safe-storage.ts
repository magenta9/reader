import { safeStorage } from "electron";
import type { SecretCipher } from "./app-data-store.js";

export const electronSafeStorageCipher: SecretCipher = {
  encryptString(value: string): Uint8Array {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Electron safeStorage encryption is not available.");
    }
    return safeStorage.encryptString(value);
  },
  decryptString(value: Uint8Array): string {
    return safeStorage.decryptString(Buffer.from(value));
  }
};
