import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runPackagedSmoke } from "./packaged-smoke.mjs";
import { withLocalReleaseTransaction } from "./local-release-transaction.mjs";
import { loadMacReleaseIdentity } from "./release-identity.mjs";
import { safelyReplaceApplication } from "./safe-app-replace.mjs";
import { assertCommand, spawnCommand } from "./spawn-command.mjs";
import { verifyMacApplicationStructure } from "./verify-mac-app.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const releaseIdentity = await loadMacReleaseIdentity({ root: projectRoot });
const defaultCandidate = releaseIdentity.paths.application;
export const installedApplication = releaseIdentity.installedAppPath;

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

export async function installMacApplication({
  transaction,
  candidate = defaultCandidate,
  transactionRunner = withLocalReleaseTransaction
} = {}) {
  if (!transaction) {
    return transactionRunner({ root: projectRoot }, (ownedTransaction) =>
      installMacApplication({ transaction: ownedTransaction, candidate })
    );
  }
  if (process.platform !== releaseIdentity.platform || process.arch !== releaseIdentity.architecture) {
    throw new Error(
      `Local installation supports ${releaseIdentity.platform} ${releaseIdentity.architecture} only; received ${process.platform} ${process.arch}`
    );
  }
  if (!existsSync(candidate)) throw new Error(`Verified candidate is missing: ${candidate}`);
  assertApplicationNotRunning();
  const swap = transaction.applicationSwap(installedApplication);

  await safelyReplaceApplication({
    source: candidate,
    destination: installedApplication,
    swap,
    copyApplication: async (source, destination) => {
      assertCommand(await spawnCommand("/usr/bin/ditto", [source, destination]), "Staging application copy");
    },
    verifyStaged: async (application) => {
      await verifyMacApplicationStructure(application, { identity: releaseIdentity });
    },
    beforeSwap: async () => assertApplicationNotRunning(),
    verifyInstalled: async (application) => {
      await runPackagedSmoke(application, { identity: releaseIdentity });
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
