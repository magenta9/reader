import { existsSync, renameSync, rmSync } from "node:fs";

export async function safelyReplaceApplication({
  source,
  destination,
  swap,
  copyApplication,
  verifyStaged,
  verifyInstalled,
  beforeSwap = async () => {},
  beforeCommit = async () => {},
  renameApplication = renameSync,
  removeApplication = (path) => rmSync(path, { recursive: true, force: true })
}) {
  if (!swap) throw new Error("Safe application replacement requires a transaction-owned swap capability");
  const { staging, backup, failed } = swap.paths;
  const removeOwned = (role) => swap.remove(role, removeApplication);
  const preserveOwned = (role) => swap.preserve(role);
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
    for (const role of ["staging", ...(preserveFailed ? [] : ["failed"])]) {
      try {
        await removeOwned(role);
      } catch (cleanupError) {
        rollbackErrors.push(cleanupError);
      }
    }

    if (existsSync(backup)) await preserveOwned("backup");
    if (existsSync(failed)) await preserveOwned("failed");

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
      await removeOwned("backup");
    } catch (error) {
      await preserveOwned("backup");
      throw new Error(
        `The new application is installed and verified, but the previous backup could not be removed. ` +
          `The verified application remains at ${destination}; inspect and remove the residual backup at ${backup} manually. ` +
          `Cleanup error: ${error}`
      );
    }
  }
}
