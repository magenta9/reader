import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyBuiltVoiceReader } from "./build-verifier.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shouldBuild = !process.argv.includes("--no-build");
if (shouldBuild) await run("scripts/build.mjs", []);

const report = await verifyBuiltVoiceReader(resolve(root, "dist"));
if (!report.ok) {
  const diagnostics = report.findings
    .map(({ category, artifact, reason }) => `[${category}] ${artifact}: ${reason}`)
    .join("\n");
  throw new Error(`Build verification failed:\n${diagnostics}`);
}

await import("./legacy-dist-contract-tests.mjs");
console.log("Dist contract tests passed.");

function run(script, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${script} exited with code ${code}`));
    });
  });
}
