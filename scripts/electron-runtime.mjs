import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const defaultAddonPath = resolve(projectRoot, "dist/native/selection-copy-macos.node");
const probeScript = resolve(scriptDirectory, "electron-runtime-probe.cjs");

export async function runElectronRuntimeProbe({
  addonPath = defaultAddonPath,
  electronExecutable = require("electron")
} = {}) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "voicereader-electron-runtime-"));
  const databasePath = join(temporaryRoot, "runtime-probe.sqlite");
  try {
    const result = await spawnCaptured(electronExecutable, [probeScript, addonPath, databasePath], {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1"
    });
    if (result.code !== 0 || result.signal) {
      throw new Error(
        `Electron runtime probe failed (code=${result.code}, signal=${result.signal ?? "none"}).\n` +
          `stdout:\n${result.stdout.trim() || "<empty>"}\n` +
          `stderr:\n${result.stderr.trim() || "<empty>"}`
      );
    }
    const line = result.stdout
      .trim()
      .split("\n")
      .findLast((candidate) => candidate.trim().startsWith("{"));
    if (!line) throw new Error(`Electron runtime probe returned no JSON payload.\n${result.stdout}`);
    return JSON.parse(line);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function spawnCaptured(command, args, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += String(chunk)));
    child.stderr.on("data", (chunk) => (stderr += String(chunk)));
    child.once("error", reject);
    child.once("close", (code, signal) => resolvePromise({ code, signal, stdout, stderr }));
  });
}

function spawnInherited(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0 && !signal) resolvePromise();
      else reject(new Error(`Electron exited (code=${code}, signal=${signal ?? "none"})`));
    });
  });
}

export async function main(argv = process.argv.slice(2)) {
  const launch = argv.length === 1 && argv[0] === "--launch";
  if (argv.length > (launch ? 1 : 0)) {
    throw new Error("Usage: electron-runtime.mjs [--launch]");
  }
  const result = await runElectronRuntimeProbe();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (launch) await spawnInherited(require("electron"), ["."]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
