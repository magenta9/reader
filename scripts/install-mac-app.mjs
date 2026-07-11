import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { safelyReplaceApplication } from "./safe-app-replace.mjs";
import { assertCommand, spawnCommand } from "./spawn-command.mjs";
import { verifyMacApplicationStructure } from "./verify-mac-app.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const candidate = resolve(projectRoot, "release/mac/VoiceReader.app");
export const installedApplication = "/Applications/VoiceReader.app";

export function findApplicationProcesses(application, processList) {
  const marker = `${application}/Contents/`;
  return processList
    .split("\n")
    .map((line) => line.match(/^\s*(\d+)\s+(.+)$/))
    .filter((match) => match && match[2].startsWith(marker))
    .map((match) => ({ pid: Number(match[1]), command: match[2] }));
}

export function assertApplicationNotRunning(application = installedApplication) {
  const result = spawnSync("/bin/ps", ["-axo", "pid=,command="], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Unable to inspect running processes: ${(result.stderr || result.stdout).trim()}`);
  }
  const processes = findApplicationProcesses(application, result.stdout);
  if (processes.length > 0) {
    throw new Error(
      `VoiceReader is running from ${application} (PID ${processes.map((item) => item.pid).join(", ")}). ` +
        "Quit VoiceReader normally and rerun make deploy; deployment will not terminate it."
    );
  }
}

export async function installMacApplication() {
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    throw new Error(`Local installation supports darwin arm64 only; received ${process.platform} ${process.arch}`);
  }
  if (!existsSync(candidate)) throw new Error(`Verified candidate is missing: ${candidate}`);
  assertApplicationNotRunning();

  await safelyReplaceApplication({
    source: candidate,
    destination: installedApplication,
    copyApplication: async (source, destination) => {
      assertCommand(await spawnCommand("/usr/bin/ditto", [source, destination]), "Staging application copy");
    },
    verifyStaged: verifyMacApplicationStructure,
    beforeSwap: async () => assertApplicationNotRunning(),
    verifyInstalled: async (application) => {
      await verifyMacApplicationStructure(application);
      assertCommand(
        await spawnCommand(process.execPath, [resolve(scriptDirectory, "packaged-smoke.mjs"), "--application", application]),
        "Installed application smoke"
      );
    },
    beforeCommit: async () => assertApplicationNotRunning()
  });

  return { installed: installedApplication, userDataModified: false };
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.length > 0) throw new Error("Usage: install-mac-app.mjs");
  process.stdout.write(`${JSON.stringify(await installMacApplication())}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
