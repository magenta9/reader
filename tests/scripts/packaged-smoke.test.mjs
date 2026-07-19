import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const smokeScript = resolve("scripts/packaged-smoke.mjs");
const temporaryRoots = [];
const fixtureTimeoutMs = "2000";

function createFakeApplication(script) {
  const root = mkdtempSync(join(tmpdir(), "voicereader-smoke-verifier-"));
  temporaryRoots.push(root);
  const application = join(root, "Fake.app");
  const executable = join(application, "Contents/MacOS/VoiceReader");
  mkdirSync(join(application, "Contents/MacOS"), { recursive: true });
  writeFileSync(executable, `#!/bin/sh\n${script}\n`);
  chmodSync(executable, 0o755);
  return { root, application };
}

function createFakeMigratingApplication() {
  const root = mkdtempSync(join(tmpdir(), "voicereader-smoke-verifier-"));
  temporaryRoots.push(root);
  const application = join(root, "Fake.app");
  const executable = join(application, "Contents/MacOS/VoiceReader");
  mkdirSync(join(application, "Contents/MacOS"), { recursive: true });
  const schemaSql = `
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reading_history (
      id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, text TEXT NOT NULL,
      preview TEXT NOT NULL, duration_estimate_seconds INTEGER NOT NULL,
      language_summary TEXT NOT NULL, source TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reading_history_created_at ON reading_history (created_at DESC);
    CREATE TABLE IF NOT EXISTS favorite_records (
      id TEXT PRIMARY KEY, favorited_at INTEGER NOT NULL, source_created_at INTEGER NOT NULL,
      text TEXT NOT NULL, preview TEXT NOT NULL, duration_estimate_seconds INTEGER NOT NULL,
      language_summary TEXT NOT NULL, source TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_favorite_records_favorited_at ON favorite_records (favorited_at DESC);
    CREATE TABLE IF NOT EXISTS error_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, created_at INTEGER NOT NULL,
      category TEXT NOT NULL, message TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_error_log_created_at ON error_log (created_at DESC);
  `;
  writeFileSync(
    executable,
    `#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
const userData = process.env.VOICEREADER_PACKAGED_SMOKE_USER_DATA;
const databasePath = userData + "/voicereader.sqlite";
const database = new DatabaseSync(databasePath);
const version = database.prepare("PRAGMA user_version").get().user_version;
if (version > 1) {
  database.close();
  process.stderr.write("schema is newer than supported version\\n");
  process.exit(7);
}
database.exec(${JSON.stringify(schemaSql)});
database.prepare("DELETE FROM settings WHERE key = ?").run("minimax.apiKey.encrypted");
const row = database.prepare("SELECT value FROM settings WHERE key = ?").get("app.settings");
if (row) {
  const settings = JSON.parse(row.value);
  if (settings.activationShortcut === "Command+Shift+R") {
    settings.activationShortcut = "Control+Command+R";
    database.prepare("UPDATE settings SET value = ? WHERE key = ?").run(JSON.stringify(settings), "app.settings");
  }
}
database.exec("PRAGMA user_version = 1");
database.close();
if (process.env.SMOKE_PATH_CAPTURE) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(process.env.SMOKE_PATH_CAPTURE, userData);
}
process.on("SIGTERM", () => process.exit(0));
process.stdout.write("VOICEREADER_SMOKE_READY " + JSON.stringify({
  packaged: true,
  userData,
  databasePath,
  migratedTables: 4,
  schemaVersion: 1,
  scenario: process.env.VOICEREADER_PACKAGED_SMOKE_SCENARIO,
  addonExports: ["copySelection", "readSelectedText"]
}) + "\\n");
setInterval(() => {}, 1000);
`
  );
  chmodSync(executable, 0o755);
  return { root, application };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("packaged VoiceReader smoke command", () => {
  it("publishes an isolated final-app smoke plan", () => {
    const result = spawnSync(process.execPath, [smokeScript, "plan"], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      application: "release/mac/VoiceReader.app",
      packagedOnly: true,
      isolatedUserData: true,
      readinessPrefix: "VOICEREADER_SMOKE_READY ",
      scenarios: ["fresh", "legacy", "current", "future"],
      timeoutMs: 15000,
      removesTemporaryData: true
    });
  });

  it("accepts readiness only after isolated storage and addon loading are proven", () => {
    const { root, application } = createFakeMigratingApplication();
    const capture = join(root, "captured-user-data");
    const result = spawnSync(process.execPath, [smokeScript, "--application", application, "--scenario", "legacy"], {
      encoding: "utf8",
      env: { ...process.env, SMOKE_PATH_CAPTURE: capture }
    });

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).scenarios[0]).toMatchObject({
      scenario: "legacy",
      schemaVersion: 1,
      preserved: true,
      expectedFailure: false
    });
    expect(existsSync(readFileSync(capture, "utf8"))).toBe(false);
  });

  it("accepts a future-version failure only when the database stays unchanged", () => {
    const { application } = createFakeMigratingApplication();
    const result = spawnSync(
      process.execPath,
      [smokeScript, "--application", application, "--scenario", "future", "--timeout-ms", fixtureTimeoutMs],
      { encoding: "utf8" }
    );

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).scenarios[0]).toMatchObject({
      scenario: "future",
      schemaVersion: 2,
      preserved: true,
      expectedFailure: true
    });
  });

  it("reports an early exit with captured diagnostics", () => {
    const { application } = createFakeApplication('echo "startup exploded" >&2\nexit 7');
    const result = spawnSync(
      process.execPath,
      [smokeScript, "--application", application, "--scenario", "fresh", "--timeout-ms", fixtureTimeoutMs],
      { encoding: "utf8" }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("exited before readiness");
    expect(result.stderr).toContain("startup exploded");
  });

  it("times out, terminates the process, and removes isolated data", () => {
    const { root, application } = createFakeApplication(
      'printf "%s" "$VOICEREADER_PACKAGED_SMOKE_USER_DATA" > "$SMOKE_PATH_CAPTURE"\n' +
        'trap "exit 0" TERM\nwhile :; do sleep 1; done'
    );
    const capture = join(root, "captured-user-data");
    const result = spawnSync(
      process.execPath,
      [smokeScript, "--application", application, "--scenario", "fresh", "--timeout-ms", fixtureTimeoutMs],
      { encoding: "utf8", env: { ...process.env, SMOKE_PATH_CAPTURE: capture } }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`timed out after ${fixtureTimeoutMs}ms`);
    expect(existsSync(readFileSync(capture, "utf8"))).toBe(false);
  });

  it("preserves invalid-readiness diagnostics before cleanup", () => {
    const { root, application } = createFakeApplication(
      'printf "%s" "$VOICEREADER_PACKAGED_SMOKE_USER_DATA" > "$SMOKE_PATH_CAPTURE"\n' +
        'trap "exit 0" TERM\necho "VOICEREADER_SMOKE_READY not-json"\nwhile :; do sleep 1; done'
    );
    const capture = join(root, "captured-invalid-data");
    const result = spawnSync(
      process.execPath,
      [smokeScript, "--application", application, "--scenario", "fresh", "--timeout-ms", fixtureTimeoutMs],
      { encoding: "utf8", env: { ...process.env, SMOKE_PATH_CAPTURE: capture } }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Invalid packaged smoke readiness payload");
    expect(existsSync(readFileSync(capture, "utf8"))).toBe(false);
  });
});
