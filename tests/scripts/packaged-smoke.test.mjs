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
      timeoutMs: 15000,
      removesTemporaryData: true
    });
  });

  it("accepts readiness only after isolated storage and addon loading are proven", () => {
    const { root, application } = createFakeApplication(
      'db="$VOICEREADER_PACKAGED_SMOKE_USER_DATA/voicereader.sqlite"\n' +
        'touch "$db"\n' +
        'printf "%s" "$VOICEREADER_PACKAGED_SMOKE_USER_DATA" > "$SMOKE_PATH_CAPTURE"\n' +
        'trap "exit 0" TERM\n' +
        'echo "VOICEREADER_SMOKE_READY {\\"packaged\\":true,\\"userData\\":\\"$VOICEREADER_PACKAGED_SMOKE_USER_DATA\\",\\"databasePath\\":\\"$db\\",\\"migratedTables\\":4,\\"addonExports\\":[\\"copySelection\\",\\"readSelectedText\\"]}"\n' +
        "while :; do sleep 1; done"
    );
    const capture = join(root, "captured-user-data");
    const result = spawnSync(process.execPath, [smokeScript, "--application", application], {
      encoding: "utf8",
      env: { ...process.env, SMOKE_PATH_CAPTURE: capture }
    });

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ packaged: true, migratedTables: 4 });
    expect(existsSync(readFileSync(capture, "utf8"))).toBe(false);
  });

  it("reports an early exit with captured diagnostics", () => {
    const { application } = createFakeApplication('echo "startup exploded" >&2\nexit 7');
    const result = spawnSync(
      process.execPath,
      [smokeScript, "--application", application, "--timeout-ms", fixtureTimeoutMs],
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
      [smokeScript, "--application", application, "--timeout-ms", fixtureTimeoutMs],
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
      [smokeScript, "--application", application, "--timeout-ms", fixtureTimeoutMs],
      { encoding: "utf8", env: { ...process.env, SMOKE_PATH_CAPTURE: capture } }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Invalid packaged smoke readiness payload");
    expect(existsSync(readFileSync(capture, "utf8"))).toBe(false);
  });
});
