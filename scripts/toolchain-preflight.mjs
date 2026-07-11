import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REQUIRED_BUN_VERSION = "1.3.14";
export const REQUIRED_NODE_MAJOR = 24;
export const RECOMMENDED_NODE_VERSION = "24.18.0";
export const REQUIRED_ELECTRON_VERSION = "41.10.1";
export const TRUSTED_DEPENDENCIES = ["electron", "esbuild"];

const REQUIRED_NODE_RANGE = `>=${REQUIRED_NODE_MAJOR} <${REQUIRED_NODE_MAJOR + 1}`;
const FORBIDDEN_FILES = ["pnpm-lock.yaml", "pnpm-workspace.yaml", "bun.lockb"];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(message);
}

function assertStringArray(actual, expected, message) {
  if (
    !Array.isArray(actual) ||
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(message);
  }
}

export function assertRuntimeVersions({ nodeVersion, bunVersion }) {
  const nodeMajor = Number.parseInt(String(nodeVersion).split(".")[0] ?? "", 10);
  if (nodeMajor !== REQUIRED_NODE_MAJOR) {
    throw new Error(`Node ${REQUIRED_NODE_MAJOR}.x is required; received ${nodeVersion}`);
  }
  if (bunVersion !== REQUIRED_BUN_VERSION) {
    throw new Error(`Bun ${REQUIRED_BUN_VERSION} is required; received ${bunVersion}`);
  }
}

export function assertRepositoryPolicy(root) {
  for (const filename of FORBIDDEN_FILES) {
    if (existsSync(join(root, filename))) {
      const detail = filename === "bun.lockb" ? "obsolete; commit only bun.lock" : "not supported after the Bun cutover";
      throw new Error(`${filename} is ${detail}`);
    }
  }

  const manifest = readJson(join(root, "package.json"));
  const bunfig = readFileSync(join(root, "bunfig.toml"), "utf8");

  assertEqual(
    manifest.packageManager,
    `bun@${REQUIRED_BUN_VERSION}`,
    `packageManager must be bun@${REQUIRED_BUN_VERSION}`
  );
  assertEqual(manifest.engines?.node, REQUIRED_NODE_RANGE, `engines.node must be ${REQUIRED_NODE_RANGE}`);
  if (Object.hasOwn(manifest, "workspaces")) {
    throw new Error("workspaces must be omitted in this single-package repository");
  }
  assertStringArray(
    manifest.trustedDependencies,
    TRUSTED_DEPENDENCIES,
    `trustedDependencies must contain only ${TRUSTED_DEPENDENCIES.join(", ")}`
  );
  assertEqual(
    manifest.devDependencies?.electron,
    REQUIRED_ELECTRON_VERSION,
    `electron must be pinned to ${REQUIRED_ELECTRON_VERSION}`
  );
  if (!String(manifest.devDependencies?.["@types/node"] ?? "").startsWith("^24.")) {
    throw new Error("@types/node must target the Node 24 release line");
  }
  const supportedScripts = Object.values(manifest.scripts ?? {}).join("\n");
  if (/\bpnpm\b|\bnpm\s+run\b/.test(supportedScripts)) {
    throw new Error("supported scripts must not invoke pnpm or npm run");
  }
  if (!/^\s*\[install\]\s*$[\s\S]*^\s*linker\s*=\s*["']isolated["']\s*$/m.test(bunfig)) {
    throw new Error('bunfig.toml must configure install.linker as "isolated"');
  }
}

export function assertTrustedInstall(output) {
  const blockedPackages = [...String(output).matchAll(/^\.\/node_modules\/(.+?)\s+@[^\s]+/gm)].map(
    (match) => match[1]
  );
  if (blockedPackages.length > 0) {
    throw new Error(`Unexpected blocked dependency lifecycle scripts:\n${String(output).trim()}`);
  }
}

function readBunVersion() {
  const result = spawnSync("bun", ["--version"], { encoding: "utf8" });
  if (result.error) throw new Error(`Unable to run Bun: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`Unable to read Bun version: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout.trim();
}

function verifyInstalledDependencies(root) {
  if (!existsSync(join(root, "bun.lock"))) {
    throw new Error("bun.lock is required for frozen installs");
  }
  const result = spawnSync("bun", ["pm", "untrusted"], { cwd: root, encoding: "utf8" });
  if (result.error) throw new Error(`Unable to audit untrusted dependencies: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`Unable to audit untrusted dependencies: ${(result.stderr || result.stdout).trim()}`);
  }
  assertTrustedInstall(`${result.stdout}\n${result.stderr}`);
}

export function main(argv = process.argv.slice(2)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  assertRuntimeVersions({ nodeVersion: process.versions.node, bunVersion: readBunVersion() });
  assertRepositoryPolicy(root);
  if (argv.includes("--verify-install")) verifyInstalledDependencies(root);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
