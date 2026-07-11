import type { App } from "electron";
import { isAbsolute } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AppDataStore } from "./data/app-data-store.js";
import { loadDarwinSelectionCopyAddon } from "./reading-target/reading-target-acquirer.js";

const REQUIRED_SCHEMA = {
  settings: ["key", "value"],
  reading_history: [
    "id",
    "created_at",
    "text",
    "preview",
    "duration_estimate_seconds",
    "language_summary",
    "source"
  ],
  favorite_records: [
    "id",
    "favorited_at",
    "source_created_at",
    "text",
    "preview",
    "duration_estimate_seconds",
    "language_summary",
    "source"
  ],
  error_log: ["id", "created_at", "category", "message"]
} as const;

export type PackagedSmokeConfiguration =
  | { enabled: false }
  | { enabled: true; userData: string };

export function readPackagedSmokeConfiguration(
  environment: NodeJS.ProcessEnv = process.env
): PackagedSmokeConfiguration {
  if (environment.VOICEREADER_PACKAGED_SMOKE !== "1") return { enabled: false };
  const userData = environment.VOICEREADER_PACKAGED_SMOKE_USER_DATA;
  if (!userData || !isAbsolute(userData)) {
    throw new Error("VOICEREADER_PACKAGED_SMOKE_USER_DATA must be an absolute path in packaged smoke mode.");
  }
  return { enabled: true, userData };
}

export function enterPackagedSmokeMode({
  app,
  appDataStore,
  databasePath
}: {
  app: App;
  appDataStore: AppDataStore;
  databasePath: string;
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
      addonExports: Object.keys(addon).sort()
    })}\n`
  );
}

export function assertMigratedAppDataSchema(databasePath: string): number {
  const database = new DatabaseSync(databasePath);
  try {
    for (const [table, expectedColumns] of Object.entries(REQUIRED_SCHEMA)) {
      const actualColumns = new Set(
        (database.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name: string }>).map(
          (column) => column.name
        )
      );
      for (const column of expectedColumns) {
        if (!actualColumns.has(column)) {
          throw new Error(`Packaged smoke schema is missing ${table}.${column}`);
        }
      }
    }
    return Object.keys(REQUIRED_SCHEMA).length;
  } finally {
    database.close();
  }
}
