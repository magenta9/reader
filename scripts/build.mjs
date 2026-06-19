import { cp, mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build as bundle } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await run("node_modules/typescript/bin/tsc", ["-p", "tsconfig.build.json"], root);

await bundle({
  entryPoints: [resolve(root, "src/main/main.ts")],
  outfile: resolve(dist, "main/main.js"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  external: ["electron"],
  sourcemap: true,
  logLevel: "silent"
});

await bundle({
  entryPoints: [resolve(root, "src/preload/preload.ts")],
  outfile: resolve(dist, "preload/preload.cjs"),
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "es2022",
  external: ["electron"],
  sourcemap: true,
  logLevel: "silent"
});
await rm(resolve(dist, "preload/preload.js"), { force: true });
await rm(resolve(dist, "preload/preload.js.map"), { force: true });

await bundle({
  entryPoints: [resolve(root, "src/renderer/main.tsx")],
  outfile: resolve(dist, "renderer/renderer.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
  logLevel: "silent"
});

await cp(resolve(root, "src/renderer/index.html"), resolve(dist, "renderer/index.html"));

await bundle({
  entryPoints: [resolve(root, "src/overlay/main.tsx")],
  outfile: resolve(dist, "overlay/overlay.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
  logLevel: "silent"
});

await cp(resolve(root, "src/overlay/index.html"), resolve(dist, "overlay/index.html"));

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [command, ...args], {
      cwd,
      stdio: "inherit"
    });
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}
