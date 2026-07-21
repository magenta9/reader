import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadMacReleaseIdentity } from "./release-identity.mjs";
import { verifyMacApplicationStructure } from "./verify-mac-app.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const releaseIdentity = await loadMacReleaseIdentity({ root: projectRoot });
const defaultApplication = releaseIdentity.paths.application;
const CURRENT_SCHEMA_VERSION = 1;
const CURRENT_ACTIVATION_SHORTCUT = "Control+Command+R";
const LEGACY_ACTIVATION_SHORTCUT = "Command+Shift+R";
const POSITIVE_SCENARIOS = ["fresh", "legacy", "current"];
const ALL_SCENARIOS = [...POSITIVE_SCENARIOS, "future"];

const LEGACY_SCHEMA_SQL = [
  "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  `CREATE TABLE reading_history (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    text TEXT NOT NULL,
    preview TEXT NOT NULL,
    duration_estimate_seconds INTEGER NOT NULL,
    language_summary TEXT NOT NULL,
    source TEXT NOT NULL
  )`,
  "CREATE INDEX idx_reading_history_created_at ON reading_history (created_at DESC)",
  `CREATE TABLE error_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    category TEXT NOT NULL,
    message TEXT NOT NULL
  )`,
  "CREATE INDEX idx_error_log_created_at ON error_log (created_at DESC)"
];
const FAVORITES_SCHEMA_SQL = [
  `CREATE TABLE favorite_records (
    id TEXT PRIMARY KEY,
    favorited_at INTEGER NOT NULL,
    source_created_at INTEGER NOT NULL,
    text TEXT NOT NULL,
    preview TEXT NOT NULL,
    duration_estimate_seconds INTEGER NOT NULL,
    language_summary TEXT NOT NULL,
    source TEXT NOT NULL
  )`,
  "CREATE INDEX idx_favorite_records_favorited_at ON favorite_records (favorited_at DESC)"
];
const CURRENT_SCHEMA_SQL = [...LEGACY_SCHEMA_SQL, ...FAVORITES_SCHEMA_SQL];

export const SMOKE_PLAN = {
  application: releaseIdentity.packagingPlan.app,
  packagedOnly: true,
  isolatedUserData: true,
  readinessPrefix: "VOICEREADER_SMOKE_READY ",
  scenarios: ALL_SCENARIOS,
  timeoutMs: 15_000,
  removesTemporaryData: true
};

export async function runPackagedSmoke(
  application,
  {
    timeoutMs = SMOKE_PLAN.timeoutMs,
    scenarios = SMOKE_PLAN.scenarios,
    identity = releaseIdentity,
    verifyApplication = verifyMacApplicationStructure
  } = {}
) {
  await verifyApplication(application, { identity });
  const executable = resolve(application, identity.applicationPaths.executable);
  if (!existsSync(executable)) {
    throw new Error(`Packaged application is missing: ${application}. Run bun run package:mac first.`);
  }
  const results = [];
  for (const scenario of scenarios) {
    assertScenario(scenario);
    results.push(await runPackagedSmokeScenario(executable, scenario, timeoutMs));
  }
  return { packaged: true, application: resolve(application), scenarios: results };
}

export function preparePackagedSmokeScenario(userData, scenario) {
  assertScenario(scenario);
  const databasePath = join(userData, "voicereader.sqlite");
  if (scenario === "fresh") return databasePath;

  const database = new DatabaseSync(databasePath);
  try {
    for (const sql of LEGACY_SCHEMA_SQL) database.exec(sql);
    seedCommonData(database);
    if (scenario === "current" || scenario === "future") {
      for (const sql of FAVORITES_SCHEMA_SQL) database.exec(sql);
      database.exec(`
        INSERT INTO favorite_records (
          id, favorited_at, source_created_at, text, preview,
          duration_estimate_seconds, language_summary, source
        ) VALUES (
          'favorite-smoke', 1700000001000, 1700000000000,
          'favorite smoke sentinel', 'favorite smoke', 11, '英文', 'clipboard'
        )
      `);
    }
    if (scenario === "future") database.exec("PRAGMA user_version = 2");
  } finally {
    database.close();
  }
  return databasePath;
}

export function verifyPackagedSmokeScenario(databasePath, scenario) {
  assertScenario(scenario);
  const database = new DatabaseSync(databasePath);
  try {
    const version = readUserVersion(database);
    if (scenario === "future") {
      if (version !== 2) throw new Error(`Future smoke changed schema version to ${version}`);
      assertExactSchema(database, CURRENT_SCHEMA_SQL);
      assertSetting(database, "minimax.apiKey", "direct-smoke-key");
      assertSetting(database, "minimax.apiKey.encrypted", "encrypted-smoke-key");
      assertLegacyShortcut(database);
      assertSentinels(database, true);
      return { scenario, expectedFailure: true, schemaVersion: version, preserved: true };
    }

    if (version !== CURRENT_SCHEMA_VERSION) {
      throw new Error(`Packaged smoke schema version is ${version}, expected ${CURRENT_SCHEMA_VERSION}`);
    }
    assertExactSchema(database, CURRENT_SCHEMA_SQL);
    if (scenario !== "fresh") {
      assertSetting(database, "minimax.apiKey", "direct-smoke-key");
      if (readSetting(database, "minimax.apiKey.encrypted") !== undefined) {
        throw new Error("Packaged smoke did not remove the legacy encrypted MiniMax key");
      }
      assertCurrentShortcut(database);
      assertSentinels(database, scenario === "current");
    }
    return { scenario, expectedFailure: false, schemaVersion: version, preserved: true };
  } finally {
    database.close();
  }
}

async function runPackagedSmokeScenario(executable, scenario, timeoutMs) {
  const userData = mkdtempSync(join(tmpdir(), `voicereader-packaged-smoke-${scenario}-`));
  const databasePath = preparePackagedSmokeScenario(userData, scenario);
  try {
    const outcome = await launchPackagedApplication(executable, userData, scenario, timeoutMs);
    if (scenario === "future") {
      if (outcome.readiness) throw new Error("Future-version packaged smoke unexpectedly reached readiness");
      if (outcome.code === 0) throw new Error("Future-version packaged smoke exited successfully");
      if (!outcome.diagnostics.includes("newer than supported version")) {
        throw new Error(`Future-version packaged smoke failed for the wrong reason.\n${outcome.diagnostics}`);
      }
    } else {
      if (!outcome.readiness) throw new Error("Packaged smoke did not report readiness");
      if (outcome.code !== 0 || outcome.signal) {
        throw new Error(`Packaged app did not stop cleanly (code=${outcome.code}, signal=${outcome.signal}).`);
      }
      if (!isValidReadiness(outcome.readiness, userData, scenario)) {
        throw new Error(
          "Packaged smoke readiness did not prove isolated versioned storage, addon loading, and hidden Overlay loading."
        );
      }
    }
    return { ...verifyPackagedSmokeScenario(databasePath, scenario), readiness: outcome.readiness };
  } catch (error) {
    throw new Error(`${scenario} packaged smoke failed: ${error instanceof Error ? error.message : error}`);
  } finally {
    rmSync(userData, { recursive: true, force: true });
    if (existsSync(userData)) throw new Error(`Unable to remove packaged smoke data: ${userData}`);
  }
}

function launchPackagedApplication(executable, userData, scenario, timeoutMs) {
  const stdout = [];
  const stderr = [];
  let lineBuffer = "";
  let readiness = null;
  let protocolError = null;
  let spawnError = null;
  const child = spawn(executable, [], {
    env: {
      ...process.env,
      VOICEREADER_PACKAGED_SMOKE: "1",
      VOICEREADER_PACKAGED_SMOKE_USER_DATA: userData,
      VOICEREADER_PACKAGED_SMOKE_SCENARIO: scenario
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  return new Promise((resolveCompletion, reject) => {
    let timedOut = false;
    let killTimeout = null;
    const requestTermination = () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill("SIGTERM");
      if (!killTimeout) {
        killTimeout = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
        }, 2_000);
        killTimeout.unref();
      }
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      requestTermination();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout.push(text);
      lineBuffer += text;
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith(SMOKE_PLAN.readinessPrefix)) continue;
        try {
          readiness = JSON.parse(line.slice(SMOKE_PLAN.readinessPrefix.length));
        } catch (error) {
          protocolError = new Error(`Invalid packaged smoke readiness payload: ${error}`);
        }
        clearTimeout(timeout);
        requestTermination();
      }
    });
    child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
    child.once("error", (error) => {
      spawnError = error;
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      if (killTimeout) clearTimeout(killTimeout);
      const diagnostics = diagnosticsFor(stdout, stderr);
      if (timedOut) reject(new Error(`Packaged smoke timed out after ${timeoutMs}ms.\n${diagnostics}`));
      else if (spawnError) reject(new Error(`Unable to launch packaged app: ${spawnError.message}.\n${diagnostics}`));
      else if (protocolError) reject(new Error(`${protocolError.message}\n${diagnostics}`));
      else if (!readiness && scenario !== "future") {
        reject(new Error(`Packaged app exited before readiness (code=${code}, signal=${signal}).\n${diagnostics}`));
      } else resolveCompletion({ code, signal, readiness, diagnostics });
    });
  });
}

function isValidReadiness(readiness, userData, scenario) {
  return (
    readiness.packaged === true &&
    readiness.userData === userData &&
    readiness.databasePath === join(userData, "voicereader.sqlite") &&
    existsSync(readiness.databasePath) &&
    readiness.schemaVersion === CURRENT_SCHEMA_VERSION &&
    readiness.migratedTables === 4 &&
    readiness.overlayLoaded === true &&
    Array.isArray(readiness.addonExports) &&
    readiness.addonExports.includes("copySelection") &&
    readiness.addonExports.includes("readSelectedText") &&
    readiness.scenario === scenario
  );
}

function seedCommonData(database) {
  database.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
    "app.settings",
    JSON.stringify({ activationShortcut: LEGACY_ACTIVATION_SHORTCUT, historyRetention: "forever" })
  );
  database.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("minimax.apiKey", "direct-smoke-key");
  database
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
    .run("minimax.apiKey.encrypted", "encrypted-smoke-key");
  database.exec(`
    INSERT INTO reading_history (
      id, created_at, text, preview, duration_estimate_seconds, language_summary, source
    ) VALUES (
      'history-smoke', 1700000000000, 'history smoke sentinel',
      'history smoke', 12, '英文', 'selected_text'
    );
    INSERT INTO error_log (created_at, category, message)
    VALUES (1700000002000, 'playback_runtime', 'error smoke sentinel');
  `);
}

function assertExactSchema(database, expectedSql) {
  const actual = (database
    .prepare(
      "SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY type, name"
    )
    .all()).map(({ type, name, sql }) => `${type}:${name}:${normalizeSchemaSql(sql)}`);
  const expected = expectedSql
    .map((sql) => {
      const match = /^CREATE (TABLE|INDEX) ([^ (]+)/.exec(sql.trim());
      if (!match) throw new Error(`Invalid smoke schema SQL: ${sql}`);
      return `${match[1].toLowerCase()}:${match[2]}:${normalizeSchemaSql(sql)}`;
    })
    .sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Packaged smoke schema contract mismatch: ${actual.join(", ") || "<none>"}`);
  }
}

function assertSentinels(database, expectFavorite) {
  const history = database.prepare("SELECT text FROM reading_history WHERE id = ?").get("history-smoke");
  if (history?.text !== "history smoke sentinel") throw new Error("Packaged smoke lost Reading History data");
  const error = database.prepare("SELECT message FROM error_log").get();
  if (error?.message !== "error smoke sentinel") throw new Error("Packaged smoke lost Error Log data");
  const favorite = database.prepare("SELECT text FROM favorite_records WHERE id = ?").get("favorite-smoke");
  if (expectFavorite && favorite?.text !== "favorite smoke sentinel") {
    throw new Error("Packaged smoke lost Favorite data");
  }
  if (!expectFavorite && favorite !== undefined) throw new Error("Legacy smoke unexpectedly created Favorite data");
}

function assertSetting(database, key, expected) {
  const actual = readSetting(database, key);
  if (actual !== expected) throw new Error(`Packaged smoke setting ${key} was not preserved`);
}

function assertLegacyShortcut(database) {
  const settings = JSON.parse(readSetting(database, "app.settings") ?? "{}");
  if (settings.activationShortcut !== LEGACY_ACTIVATION_SHORTCUT) {
    throw new Error("Future smoke modified Settings before failing closed");
  }
}

function assertCurrentShortcut(database) {
  const settings = JSON.parse(readSetting(database, "app.settings") ?? "{}");
  if (settings.activationShortcut !== CURRENT_ACTIVATION_SHORTCUT) {
    throw new Error("Packaged smoke did not migrate the legacy activation shortcut");
  }
}

function readSetting(database, key) {
  return database.prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value;
}

function readUserVersion(database) {
  return database.prepare("PRAGMA user_version").get().user_version;
}

function normalizeSchemaSql(sql) {
  return sql.replaceAll(/\s+/g, "").replace(/;$/, "").toUpperCase();
}

function diagnosticsFor(stdout, stderr) {
  return `stdout:\n${stdout.join("").trim() || "<empty>"}\nstderr:\n${stderr.join("").trim() || "<empty>"}`;
}

function assertScenario(scenario) {
  if (!ALL_SCENARIOS.includes(scenario)) throw new Error(`Unknown packaged smoke scenario: ${scenario}`);
}

export async function main(argv = process.argv.slice(2)) {
  if (argv[0] === "plan") {
    process.stdout.write(`${JSON.stringify(SMOKE_PLAN)}\n`);
    return;
  }
  let application = defaultApplication;
  let timeoutMs = SMOKE_PLAN.timeoutMs;
  let scenarios = SMOKE_PLAN.scenarios;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--application" && value) {
      application = resolve(value);
      index += 1;
    } else if (flag === "--timeout-ms" && value && Number(value) > 0) {
      timeoutMs = Number(value);
      index += 1;
    } else if (flag === "--scenario" && value) {
      assertScenario(value);
      scenarios = [value];
      index += 1;
    } else {
      throw new Error(
        "Usage: packaged-smoke.mjs [plan|--application <app> --timeout-ms <ms> --scenario <fresh|legacy|current|future>]"
      );
    }
  }
  const result = await runPackagedSmoke(application, { timeoutMs, scenarios });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
