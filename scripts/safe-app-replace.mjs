import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

export async function safelyReplaceApplication({
  source,
  destination,
  copyApplication,
  verifyStaged,
  verifyInstalled,
  beforeSwap = async () => {},
  beforeCommit = async () => {},
  renameApplication = renameSync,
  removeApplication = (path) => rmSync(path, { recursive: true, force: true })
}) {
  const parent = dirname(destination);
  const name = basename(destination);
  const suffix = `${process.pid}-${randomUUID()}`;
  const staging = resolve(parent, `.${name}.staging-${suffix}`);
  const backup = resolve(parent, `.${name}.backup-${suffix}`);
  const failed = resolve(parent, `.${name}.failed-${suffix}`);
  let previousMoved = false;
  let replacementInstalled = false;
  let preserveFailed = false;

  try {
    await copyApplication(source, staging);
    await verifyStaged(staging);
    await beforeSwap();

    if (existsSync(destination)) {
      renameApplication(destination, backup);
      previousMoved = true;
    }
    renameApplication(staging, destination);
    replacementInstalled = true;
    await verifyInstalled(destination);
    try {
      await beforeCommit();
    } catch (error) {
      preserveFailed = true;
      throw error;
    }
  } catch (error) {
    const rollbackErrors = [];
    if (replacementInstalled && existsSync(destination)) {
      try {
        renameApplication(destination, failed);
        replacementInstalled = false;
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    try {
      if (previousMoved && !existsSync(destination) && existsSync(backup)) {
        renameApplication(backup, destination);
        previousMoved = false;
      }
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
    for (const path of [staging, ...(preserveFailed ? [] : [failed])]) {
      try {
        removeApplication(path);
      } catch (cleanupError) {
        rollbackErrors.push(cleanupError);
      }
    }

    const recovery = [
      ...(rollbackErrors.length > 0 ? [`Rollback cleanup also failed: ${rollbackErrors.join("; ")}.`] : []),
      ...(existsSync(backup) ? [`Previous application remains preserved at ${backup}.`] : []),
      ...(existsSync(failed) ? [`Failed replacement remains preserved at ${failed}.`] : [])
    ];
    if (recovery.length === 0) throw error;
    throw new Error(`${error instanceof Error ? error.message : error}\n${recovery.join("\n")}`);
  }

  if (previousMoved) {
    try {
      removeApplication(backup);
    } catch (error) {
      throw new Error(
        `The new application is installed and verified, but the previous backup could not be removed. ` +
          `The verified application remains at ${destination}; inspect and remove the residual backup at ${backup} manually. ` +
          `Cleanup error: ${error}`
      );
    }
  }

  try {
    for (const entry of readdirSync(parent)) {
      if (entry.startsWith(`.${name}.staging-`) || entry.startsWith(`.${name}.backup-`)) {
        removeApplication(resolve(parent, entry));
      }
    }
  } catch (error) {
    throw new Error(
      `The new application is installed and verified, but stale deployment artifacts could not be removed. ` +
        `The verified application remains at ${destination}. Cleanup error: ${error}`
    );
  }
}
