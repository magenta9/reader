import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build as bundle } from "esbuild";
import { assertCommand, spawnCommand } from "./spawn-command.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const runtimeRoleSource = JSON.parse(
  await readFile(resolve(root, "src/shared/production-runtime-role-bindings.json"), "utf8")
);
const runtimeRoleBindings = runtimeRoleSource.roles.map((binding) => {
  assertContainedPath(root, binding.preloadSource, "preloadSource");
  assertContainedPath(dist, binding.preloadArtifact, "preloadArtifact");
  return binding;
});

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await mkdir(resolve(dist, "assets"), { recursive: true });
await mkdir(resolve(dist, "renderer/assets"), { recursive: true });
await mkdir(resolve(dist, "native"), { recursive: true });
await mkdir(resolve(dist, "runtime"), { recursive: true });
await runNodeScript("node_modules/typescript/bin/tsc", ["--noEmit", "-p", "tsconfig.json"], root);
await buildNativeSelectionCopyAddon();

await bundle({
  entryPoints: [resolve(root, "src/main/main.ts")],
  outfile: resolve(dist, "main/main.js"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  external: ["electron"],
  sourcemap: true,
  logLevel: "silent"
});

for (const binding of runtimeRoleBindings) {
  await bundle({
    entryPoints: [resolve(root, binding.preloadSource)],
    outfile: resolve(dist, binding.preloadArtifact),
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "es2022",
    external: ["electron"],
    sourcemap: true,
    logLevel: "silent"
  });
  const legacyPreloadArtifact = binding.preloadArtifact.replace(/\.cjs$/, ".js");
  await rm(resolve(dist, legacyPreloadArtifact), { force: true });
  await rm(resolve(dist, `${legacyPreloadArtifact}.map`), { force: true });
}

const runtimeRoleManifest = {
  schemaVersion: runtimeRoleSource.schemaVersion,
  roles: runtimeRoleBindings.map(({ preloadSource: _preloadSource, ...binding }) => binding)
};
await writeFile(
  resolve(dist, "runtime-role-bindings.json"),
  `${JSON.stringify(runtimeRoleManifest, null, 2)}\n`
);
await writeFile(
  resolve(dist, "runtime/production-runtime-role-bindings.cjs"),
  [
    '"use strict";',
    `const runtimeRoleManifest = ${JSON.stringify(runtimeRoleManifest)};`,
    "module.exports = Object.freeze({",
    "  getRuntimeRoleManifest() { return runtimeRoleManifest; }",
    "});",
    ""
  ].join("\n")
);

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

async function runNodeScript(command, args, cwd) {
  await runExecutable(process.execPath, [command, ...args], cwd);
}

async function runExecutable(command, args, cwd) {
  const result = await spawnCommand(command, args, { cwd });
  assertCommand(result, command);
}

async function buildNativeSelectionCopyAddon() {
  if (process.platform !== "darwin") return;
  try {
    await runExecutable("/usr/bin/xcrun", ["--find", "clang++"], root);
  } catch {
    throw new Error(
      "Xcode Command Line Tools are required to build the Selected Text addon; install them with xcode-select --install."
    );
  }
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

function assertContainedPath(rootPath, value, field) {
  if (typeof value !== "string" || !value || isAbsolute(value)) {
    throw new Error(`Production Runtime Role Binding has unsafe ${field}`);
  }
  const relativePath = relative(rootPath, resolve(rootPath, value));
  if (!relativePath || relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
    throw new Error(`Production Runtime Role Binding has unsafe ${field}`);
  }
}
