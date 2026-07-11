import { cp, mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build as bundle } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await mkdir(resolve(dist, "assets"), { recursive: true });
await mkdir(resolve(dist, "renderer/assets"), { recursive: true });
await mkdir(resolve(dist, "native"), { recursive: true });
await runNodeScript("node_modules/typescript/bin/tsc", ["-p", "tsconfig.build.json"], root);
await buildNativeSelectionCopyAddon();

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
await cp(resolve(root, "assets/voicereader-icon.svg"), resolve(dist, "assets/voicereader-icon.svg"));
await cp(resolve(root, "assets/voicereader-template-icon.svg"), resolve(dist, "assets/voicereader-template-icon.svg"));
await cp(resolve(root, "assets/voicereader-icon.svg"), resolve(dist, "renderer/assets/voicereader-icon.svg"));

await bundle({
  entryPoints: [resolve(root, "src/playback-renderer/main.ts")],
  outfile: resolve(dist, "playback-renderer/playback-renderer.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
  logLevel: "silent"
});

await cp(resolve(root, "src/playback-renderer/index.html"), resolve(dist, "playback-renderer/index.html"));

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

function runNodeScript(command, args, cwd) {
  return spawnCommand(process.execPath, [command, ...args], cwd);
}

function runExecutable(command, args, cwd) {
  return spawnCommand(command, args, cwd);
}

function spawnCommand(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit"
    });
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function buildNativeSelectionCopyAddon() {
  if (process.platform !== "darwin") return;
  await runExecutable(
    "/usr/bin/xcrun",
    [
      "clang++",
      "-std=c++17",
      "-dynamiclib",
      "-undefined",
      "dynamic_lookup",
      "-I",
      process.execPath.replace(/\/bin\/node$/, "/include/node"),
      "-framework",
      "ApplicationServices",
      "-framework",
      "AppKit",
      "-o",
      resolve(dist, "native/selection-copy-macos.node"),
      resolve(root, "src/native/selection-copy-macos.mm")
    ],
    root
  );
}
