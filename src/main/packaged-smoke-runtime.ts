import type { App } from "electron";
import { isAbsolute } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AppDataStore } from "./data/app-data-store.js";
import {
  assertCurrentAppDataSchema,
  CURRENT_APP_DATA_SCHEMA_VERSION
} from "./data/app-data-schema.js";
import { loadDarwinSelectionCopyAddon } from "./reading-target/reading-target-acquirer.js";

export type PackagedSmokeConfiguration =
  | { enabled: false }
  | { enabled: true; userData: string; scenario: "fresh" | "legacy" | "current" | "future" };

export function readPackagedSmokeConfiguration(
  environment: NodeJS.ProcessEnv = process.env
): PackagedSmokeConfiguration {
  if (environment.VOICEREADER_PACKAGED_SMOKE !== "1") return { enabled: false };
  const userData = environment.VOICEREADER_PACKAGED_SMOKE_USER_DATA;
  if (!userData || !isAbsolute(userData)) {
    throw new Error("VOICEREADER_PACKAGED_SMOKE_USER_DATA must be an absolute path in packaged smoke mode.");
  }
  const scenario = environment.VOICEREADER_PACKAGED_SMOKE_SCENARIO;
  if (scenario !== "fresh" && scenario !== "legacy" && scenario !== "current" && scenario !== "future") {
    throw new Error("VOICEREADER_PACKAGED_SMOKE_SCENARIO must name a supported packaged smoke scenario.");
  }
  return { enabled: true, userData, scenario };
}

export function enterPackagedSmokeMode({
  app,
  appDataStore,
  databasePath,
  scenario
}: {
  app: App;
  appDataStore: AppDataStore;
  databasePath: string;
  scenario: "fresh" | "legacy" | "current" | "future";
}): void {
  if (!app.isPackaged) throw new Error("Packaged smoke mode requires the final packaged application.");
  const migratedTables = assertMigratedAppDataSchema(databasePath);
  appDataStore.getSettings();
  appDataStore.listReadingHistoryRecords();
  appDataStore.listFavoriteRecords();
  appDataStore.listErrorLogs();
  const addon = loadDarwinSelectionCopyAddon();

  let quitting = false;
  const quit = (): void => {
    if (quitting) return;
    quitting = true;
    appDataStore.close();
    app.quit();
  };
  process.once("SIGINT", quit);
  process.once("SIGTERM", quit);
  process.stdout.write(
    `VOICEREADER_SMOKE_READY ${JSON.stringify({
      packaged: app.isPackaged,
      userData: app.getPath("userData"),
      databasePath,
      migratedTables,
      schemaVersion: CURRENT_APP_DATA_SCHEMA_VERSION,
      scenario,
      addonExports: Object.keys(addon).sort()
    })}\n`
  );
}

export function assertMigratedAppDataSchema(databasePath: string): number {
  const database = new DatabaseSync(databasePath);
  try {
    assertCurrentAppDataSchema(database);
    const version = database.prepare("PRAGMA user_version").get() as unknown as { user_version: number };
    if (version.user_version !== CURRENT_APP_DATA_SCHEMA_VERSION) {
      throw new Error(
        `Packaged smoke schema version is ${version.user_version}, expected ${CURRENT_APP_DATA_SCHEMA_VERSION}`
      );
    }
    return 4;
  } finally {
    database.close();
  }
}
