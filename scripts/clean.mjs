import { readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const GENERATED_DIRECTORIES = ["dist", "release", ".tmp"];
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules"]);

export async function cleanGeneratedArtifacts(root) {
  await Promise.all(
    GENERATED_DIRECTORIES.map((directory) => rm(join(root, directory), { recursive: true, force: true }))
  );
  await removeTypeScriptIncrementalState(root);
}

async function removeTypeScriptIncrementalState(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return;
    throw error;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) await removeTypeScriptIncrementalState(path);
        return;
      }
      if (entry.isFile() && entry.name.endsWith(".tsbuildinfo")) {
        await rm(path, { force: true });
      }
    })
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  await cleanGeneratedArtifacts(root);
}
