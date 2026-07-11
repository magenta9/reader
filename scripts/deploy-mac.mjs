import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertApplicationNotRunning } from "./install-mac-app.mjs";
import { assertCommand, spawnCommand } from "./spawn-command.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");

export const DEPLOY_PLAN = {
  platform: "darwin",
  arch: "arm64",
  destination: "/Applications/VoiceReader.app",
  steps: ["verify", "package-mac", "smoke-candidate", "safe-replace", "verify-installed"],
  refusesRunningApplication: true,
  preservesUserData: true,
  remoteCi: false
};

export async function deployMac({
  assertNotRunning = assertApplicationNotRunning,
  runCommand = spawnCommand
} = {}) {
  if (process.platform !== DEPLOY_PLAN.platform || process.arch !== DEPLOY_PLAN.arch) {
    throw new Error(`Local deployment supports darwin arm64 only; received ${process.platform} ${process.arch}`);
  }
  assertNotRunning();
  assertCommand(await runCommand("/usr/bin/make", ["verify"], { cwd: projectRoot }), "Verification pipeline");
  assertCommand(await runCommand("/usr/bin/make", ["package-mac"], { cwd: projectRoot }), "Packaging pipeline");
  assertCommand(await runCommand("/usr/bin/make", ["smoke-packaged"], { cwd: projectRoot }), "Candidate smoke");
  assertCommand(
    await runCommand(process.execPath, [resolve(scriptDirectory, "install-mac-app.mjs")], { cwd: projectRoot }),
    "Safe application replacement"
  );
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
