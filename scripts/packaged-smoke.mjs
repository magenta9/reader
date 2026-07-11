import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const defaultApplication = resolve(projectRoot, "release/mac/VoiceReader.app");

export const SMOKE_PLAN = {
  application: "release/mac/VoiceReader.app",
  packagedOnly: true,
  isolatedUserData: true,
  readinessPrefix: "VOICEREADER_SMOKE_READY ",
  timeoutMs: 15_000,
  removesTemporaryData: true
};

export function runPackagedSmoke(application, timeoutMs = SMOKE_PLAN.timeoutMs) {
  const executable = resolve(application, "Contents/MacOS/VoiceReader");
  if (!existsSync(executable)) {
    throw new Error(`Packaged application is missing: ${application}. Run bun run package:mac first.`);
  }

  const userData = mkdtempSync(join(tmpdir(), "voicereader-packaged-smoke-"));
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
      VOICEREADER_PACKAGED_SMOKE_USER_DATA: userData
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const completion = new Promise((resolveCompletion, reject) => {
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
          clearTimeout(timeout);
          requestTermination();
        } catch (error) {
          protocolError = new Error(`Invalid packaged smoke readiness payload: ${error}`);
          clearTimeout(timeout);
          requestTermination();
        }
      }
    });
    child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
    child.once("error", (error) => {
      spawnError = error;
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      if (killTimeout) clearTimeout(killTimeout);
      const diagnostics = `stdout:\n${stdout.join("").trim() || "<empty>"}\n` +
        `stderr:\n${stderr.join("").trim() || "<empty>"}`;
      if (timedOut) {
        reject(new Error(`Packaged smoke timed out after ${timeoutMs}ms.\n${diagnostics}`));
      } else if (spawnError) {
        reject(new Error(`Unable to launch packaged app: ${spawnError.message}.\n${diagnostics}`));
      } else if (protocolError) {
        reject(new Error(`${protocolError.message}\n${diagnostics}`));
      } else if (!readiness) {
        reject(new Error(`Packaged app exited before readiness (code=${code}, signal=${signal}).\n${diagnostics}`));
      } else if (code !== 0 || signal) {
        reject(new Error(`Packaged app did not stop cleanly (code=${code}, signal=${signal}).\n${diagnostics}`));
      } else if (!isValidReadiness(readiness, userData)) {
        reject(new Error(`Packaged smoke readiness did not prove isolated migrated storage and addon loading.\n${diagnostics}`));
      } else {
        resolveCompletion(readiness);
      }
    });
  });

  const cleanup = () => {
    rmSync(userData, { recursive: true, force: true });
    if (existsSync(userData)) throw new Error(`Unable to remove packaged smoke data: ${userData}`);
  };
  return completion.then(
    (result) => {
      cleanup();
      return result;
    },
    (error) => {
      try {
        cleanup();
      } catch (cleanupError) {
        throw new Error(`${error instanceof Error ? error.message : error}\nCleanup failed: ${cleanupError}`);
      }
      throw error;
    }
  );
}

function isValidReadiness(readiness, userData) {
  return (
    readiness.packaged === true &&
    readiness.userData === userData &&
    typeof readiness.databasePath === "string" &&
    readiness.databasePath.startsWith(`${userData}/`) &&
    existsSync(readiness.databasePath) &&
    Number.isInteger(readiness.migratedTables) &&
    readiness.migratedTables >= 4 &&
    Array.isArray(readiness.addonExports) &&
    readiness.addonExports.includes("copySelection") &&
    readiness.addonExports.includes("readSelectedText")
  );
}

export async function main(argv = process.argv.slice(2)) {
  if (argv[0] === "plan") {
    process.stdout.write(`${JSON.stringify(SMOKE_PLAN)}\n`);
    return;
  }
  let application = defaultApplication;
  let timeoutMs = SMOKE_PLAN.timeoutMs;
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--application" && value) application = resolve(value);
    else if (flag === "--timeout-ms" && value && Number(value) > 0) timeoutMs = Number(value);
    else throw new Error("Usage: packaged-smoke.mjs [plan|--application <app> --timeout-ms <ms>]");
  }
  const readiness = await runPackagedSmoke(application, timeoutMs);
  process.stdout.write(`${JSON.stringify(readiness)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
