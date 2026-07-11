import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { cleanGeneratedArtifacts } from "../../scripts/clean.mjs";

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("removes generated output and incremental state without deleting dependencies or the Bun lockfile", async () => {
  const root = mkdtempSync(join(tmpdir(), "voicereader-clean-"));
  temporaryRoots.push(root);
  for (const directory of ["dist/main", "release/mac", ".tmp/probe", "nested/cache", "node_modules/pkg"]) {
    mkdirSync(join(root, directory), { recursive: true });
  }
  for (const file of [
    "dist/main/main.js",
    "release/mac/VoiceReader",
    ".tmp/probe/result",
    "tsconfig.tsbuildinfo",
    "nested/cache/renderer.tsbuildinfo",
    "node_modules/pkg/index.js",
    "bun.lock"
  ]) {
    writeFileSync(join(root, file), "fixture");
  }

  await cleanGeneratedArtifacts(root);

  expect(existsSync(join(root, "dist"))).toBe(false);
  expect(existsSync(join(root, "release"))).toBe(false);
  expect(existsSync(join(root, ".tmp"))).toBe(false);
  expect(existsSync(join(root, "tsconfig.tsbuildinfo"))).toBe(false);
  expect(existsSync(join(root, "nested/cache/renderer.tsbuildinfo"))).toBe(false);
  expect(existsSync(join(root, "node_modules/pkg/index.js"))).toBe(true);
  expect(existsSync(join(root, "bun.lock"))).toBe(true);
});
