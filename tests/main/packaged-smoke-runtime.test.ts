import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertMigratedAppDataSchema,
  readPackagedSmokeConfiguration
} from "../../src/main/packaged-smoke-runtime.js";
import { AppDataStore } from "../../src/main/data/app-data-store.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("packaged smoke runtime", () => {
  it("requires an absolute isolated userData path", () => {
    expect(() =>
      readPackagedSmokeConfiguration({
        VOICEREADER_PACKAGED_SMOKE: "1",
        VOICEREADER_PACKAGED_SMOKE_USER_DATA: "relative-data"
      })
    ).toThrow("must be an absolute path");
  });

  it("proves every required App Data Store table and column was migrated", () => {
    const root = mkdtempSync(join(tmpdir(), "voicereader-smoke-schema-"));
    temporaryRoots.push(root);
    const databasePath = join(root, "voicereader.sqlite");
    const store = new AppDataStore(databasePath);
    store.close();

    expect(assertMigratedAppDataSchema(databasePath)).toBe(4);
  });

  it("rejects an existing table whose schema is incomplete", () => {
    const root = mkdtempSync(join(tmpdir(), "voicereader-smoke-schema-"));
    temporaryRoots.push(root);
    mkdirSync(root, { recursive: true });
    const databasePath = join(root, "voicereader.sqlite");
    const database = new DatabaseSync(databasePath);
    database.exec("CREATE TABLE settings (key TEXT PRIMARY KEY)");
    database.close();

    expect(() => assertMigratedAppDataSchema(databasePath)).toThrow(
      "Packaged smoke schema is missing settings.value"
    );
  });
});
