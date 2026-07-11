import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertRepositoryPolicy,
  assertRuntimeVersions,
  assertTrustedInstall
} from "../../scripts/toolchain-preflight.mjs";

const temporaryRoots = [];

function createPolicyFixture() {
  const root = mkdtempSync(join(tmpdir(), "voicereader-toolchain-policy-"));
  temporaryRoots.push(root);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      packageManager: "bun@1.3.14",
      engines: { node: ">=24 <25" },
      trustedDependencies: ["electron", "esbuild"],
      scripts: {
        build: "bun run check:toolchain && node scripts/build.mjs",
        test: "bun run check:toolchain && vitest run"
      },
      devDependencies: {
        "@types/node": "^24.0.0",
        electron: "41.10.1"
      }
    })
  );
  writeFileSync(join(root, "bunfig.toml"), '[install]\nlinker = "isolated"\n');
  writeFileSync(join(root, "bun.lock"), '{"lockfileVersion": 1}\n');
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("VoiceReader toolchain preflight", () => {
  it("accepts the supported Node and Bun versions", () => {
    expect(() => assertRuntimeVersions({ nodeVersion: "24.18.0", bunVersion: "1.3.14" })).not.toThrow();
  });

  it("rejects hosts outside the pinned Node and Bun lines", () => {
    expect(() => assertRuntimeVersions({ nodeVersion: "26.0.0", bunVersion: "1.3.14" })).toThrow(
      "Node 24.x is required; received 26.0.0"
    );
    expect(() => assertRuntimeVersions({ nodeVersion: "24.18.0", bunVersion: "1.3.4" })).toThrow(
      "Bun 1.3.14 is required; received 1.3.4"
    );
  });

  it("accepts the single-package Bun Isolated repository contract", () => {
    expect(() => assertRepositoryPolicy(createPolicyFixture())).not.toThrow();
  });

  it("rejects pnpm metadata or a synthetic workspace returning after cutover", () => {
    const pnpmRoot = createPolicyFixture();
    writeFileSync(join(pnpmRoot, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    expect(() => assertRepositoryPolicy(pnpmRoot)).toThrow(
      "pnpm-lock.yaml is not supported after the Bun cutover"
    );

    const workspaceRoot = createPolicyFixture();
    const manifest = JSON.parse(requireText(join(workspaceRoot, "package.json")));
    manifest.workspaces = ["packages/*"];
    writeFileSync(join(workspaceRoot, "package.json"), JSON.stringify(manifest));
    expect(() => assertRepositoryPolicy(workspaceRoot)).toThrow(
      "workspaces must be omitted in this single-package repository"
    );
  });

  it("rejects toolchain, lifecycle, and supported-script drift", () => {
    const root = createPolicyFixture();
    const manifest = JSON.parse(requireText(join(root, "package.json")));
    manifest.devDependencies.electron = "^41.10.1";
    writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
    expect(() => assertRepositoryPolicy(root)).toThrow("electron must be pinned to 41.10.1");

    manifest.devDependencies.electron = "41.10.1";
    manifest.trustedDependencies.push("unknown-installer");
    writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
    expect(() => assertRepositoryPolicy(root)).toThrow(
      "trustedDependencies must contain only electron, esbuild"
    );

    manifest.trustedDependencies = ["electron", "esbuild"];
    manifest.scripts.build = "pnpm exec node scripts/build.mjs";
    writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
    expect(() => assertRepositoryPolicy(root)).toThrow("supported scripts must not invoke pnpm or npm run");
  });

  it("requires no blocked dependency lifecycle scripts", () => {
    expect(() => assertTrustedInstall("Found 0 untrusted scripts\n")).not.toThrow();
    expect(() =>
      assertTrustedInstall("./node_modules/unexpected-installer @1.0.0\n » [install]: node install.js\n")
    ).toThrow("Unexpected blocked dependency lifecycle scripts");
  });
});

function requireText(path) {
  return readFileSync(path, "utf8");
}
