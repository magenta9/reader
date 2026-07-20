import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertApplicationNotRunning, installMacApplication } from "./install-mac-app.mjs";
import { withLocalReleaseTransaction } from "./local-release-transaction.mjs";
import { packageMacInTransaction } from "./package-mac.mjs";
import { runPackagedSmoke } from "./packaged-smoke.mjs";
import { loadMacReleaseIdentity } from "./release-identity.mjs";
import { assertCommand, spawnCommand } from "./spawn-command.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const releaseIdentity = await loadMacReleaseIdentity({ root: projectRoot });

export const DEPLOY_PLAN = {
  platform: releaseIdentity.platform,
  arch: releaseIdentity.architecture,
  destination: releaseIdentity.installedAppPath,
  steps: ["verify", "package-mac", "smoke-candidate", "safe-replace", "verify-installed"],
  refusesRunningApplication: true,
  preservesUserData: true,
  remoteCi: false
};

export async function deployMac({
  assertNotRunning = assertApplicationNotRunning,
  runCommand = spawnCommand,
  transactionRunner = withLocalReleaseTransaction,
  packageApplication = packageMacInTransaction,
  smokeCandidate = runPackagedSmoke,
  installApplication = installMacApplication
} = {}) {
  if (process.platform !== DEPLOY_PLAN.platform || process.arch !== DEPLOY_PLAN.arch) {
    throw new Error(
      `Local deployment supports ${releaseIdentity.platform} ${releaseIdentity.architecture} only; received ${process.platform} ${process.arch}`
    );
  }
  assertNotRunning(DEPLOY_PLAN.destination);
  await transactionRunner({ root: projectRoot }, async (transaction) => {
    assertCommand(await runCommand("/usr/bin/make", ["verify"], { cwd: projectRoot }), "Verification pipeline");
    const packaged = await packageApplication(transaction);
    await smokeCandidate(packaged.candidate, { identity: releaseIdentity });
    await packaged.publish();
    await installApplication({ transaction, candidate: packaged.candidate });
  });
}

export async function main(argv = process.argv.slice(2)) {
  if (argv[0] === "plan") {
    process.stdout.write(`${JSON.stringify(DEPLOY_PLAN)}\n`);
    return;
  }
  if (argv.length > 0) throw new Error("Usage: deploy-mac.mjs [plan]");
  await deployMac();
  process.stdout.write(`${JSON.stringify({ installed: DEPLOY_PLAN.destination, verified: true })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
