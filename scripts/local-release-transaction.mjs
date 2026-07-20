import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

const TRANSACTION_STATE_DIRECTORY = join(".tmp", "local-release");

function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function assertTransactionId(id) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
    throw new Error(`Invalid local release transaction id: ${id}`);
  }
}

async function readOwner(ownerPath) {
  try {
    return JSON.parse(await readFile(ownerPath, "utf8"));
  } catch (error) {
    throw new Error(`Local release lock owner metadata is unreadable at ${ownerPath}: ${describeError(error)}`);
  }
}

function assertOwner(owner, expected, lockPath) {
  if (owner.id !== expected.id || owner.token !== expected.token) {
    throw new Error(
      `Local release transaction ownership changed at ${lockPath}; refusing to release the lock or clean resources.`
    );
  }
}

export async function beginLocalReleaseTransaction({
  root,
  id = randomUUID(),
  processId = process.pid
}) {
  assertTransactionId(id);
  const token = randomUUID();
  const stateRoot = resolve(root, TRANSACTION_STATE_DIRECTORY);
  const lockPath = join(stateRoot, "lock");
  const ownerPath = join(lockPath, "owner.json");
  const transactionsRoot = join(stateRoot, "transactions");
  const workspace = join(transactionsRoot, id);
  if (dirname(workspace) !== transactionsRoot) {
    throw new Error(`Invalid local release transaction workspace: ${workspace}`);
  }
  const owner = { id, token, processId, createdAt: new Date().toISOString(), root: resolve(root) };

  await mkdir(transactionsRoot, { recursive: true });
  try {
    await mkdir(lockPath);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(
        `Local release transaction is already active. Lock: ${lockPath}. ` +
          `If the owning process crashed, inspect ${ownerPath} and remove only ${lockPath} before retrying.`
      );
    }
    throw error;
  }

  try {
    await writeFile(ownerPath, `${JSON.stringify(owner, null, 2)}\n`, { flag: "wx" });
    await mkdir(workspace);
  } catch (error) {
    await rm(lockPath, { recursive: true, force: true });
    throw error;
  }

  let lifecycle = "active";
  let releasePromise;
  let applicationSwapCapability;
  const ownedResources = new Map();
  const resourceSuffix = `${id}-${token}`;

  async function assertCurrentOwner() {
    assertOwner(await readOwner(ownerPath), owner, lockPath);
  }

  function assertActive() {
    if (lifecycle !== "active") {
      throw new Error(`Local release transaction is ${lifecycle}`);
    }
  }

  async function removeOwnedResource(role, { duringRelease = false } = {}) {
    if (!duringRelease) assertActive();
    await assertCurrentOwner();
    const resource = ownedResources.get(role);
    if (!resource) throw new Error(`Unknown local release transaction resource: ${role}`);
    if (resource.preserved) {
      throw new Error(`Local release transaction resource is preserved and cannot be removed: ${role}`);
    }
    await rm(resource.path, { recursive: true, force: true });
    resource.removed = true;
  }

  return Object.freeze({
    id,
    workspace,
    candidatePath: join(workspace, "candidate", "VoiceReader.app"),
    applicationSwap(destination) {
      assertActive();
      if (applicationSwapCapability) {
        throw new Error("Local release transaction already owns an application swap");
      }
      const parent = dirname(destination);
      const name = basename(destination);
      const paths = Object.freeze({
        staging: join(parent, `.${name}.staging-${resourceSuffix}`),
        backup: join(parent, `.${name}.backup-${resourceSuffix}`),
        failed: join(parent, `.${name}.failed-${resourceSuffix}`)
      });
      for (const [role, path] of Object.entries(paths)) {
        ownedResources.set(role, { path, preserved: false, removed: false });
      }
      applicationSwapCapability = Object.freeze({
        paths,
        remove: removeOwnedResource,
        async preserve(role) {
          assertActive();
          await assertCurrentOwner();
          const resource = ownedResources.get(role);
          if (!resource) throw new Error(`Unknown local release transaction resource: ${role}`);
          resource.preserved = true;
        }
      });
      return applicationSwapCapability;
    },
    release() {
      if (releasePromise) return releasePromise;
      lifecycle = "releasing";
      releasePromise = (async () => {
        await assertCurrentOwner();
        for (const [role, resource] of ownedResources) {
          if (!resource.preserved && !resource.removed) {
            await removeOwnedResource(role, { duringRelease: true });
          }
        }
        await rm(workspace, { recursive: true, force: true });
        await assertCurrentOwner();
        await rm(lockPath, { recursive: true });
        lifecycle = "released";
      })();
      return releasePromise;
    }
  });
}

export async function withLocalReleaseTransaction(options, operation) {
  const transaction = await beginLocalReleaseTransaction(options);
  let operationError;
  try {
    return await operation(transaction);
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      await transaction.release();
    } catch (releaseError) {
      if (!operationError) throw releaseError;
      throw new Error(
        `${describeError(operationError)}\nLocal release transaction cleanup failed: ${describeError(releaseError)}`,
        { cause: operationError }
      );
    }
  }
}
