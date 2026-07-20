import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  beginLocalReleaseTransaction,
  withLocalReleaseTransaction
} from "../../scripts/local-release-transaction.mjs";
import { cleanGeneratedArtifacts } from "../../scripts/clean.mjs";

const temporaryRoots = [];

function createRoot() {
  const root = mkdtempSync(join(tmpdir(), "voicereader-local-release-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Local Release Transaction", () => {
  it("fails fast without touching the active transaction resources", async () => {
    const root = createRoot();
    const active = await beginLocalReleaseTransaction({ root, id: "active-release" });
    const swap = active.applicationSwap(join(root, "Applications", "VoiceReader.app"));
    mkdirSync(active.candidatePath, { recursive: true });
    mkdirSync(swap.paths.staging, { recursive: true });
    mkdirSync(swap.paths.backup, { recursive: true });
    writeFileSync(join(active.candidatePath, "marker"), "active");
    writeFileSync(join(swap.paths.staging, "marker"), "staging");
    writeFileSync(join(swap.paths.backup, "marker"), "backup");

    const lockPath = join(root, ".local-release", "lock");

    let conflict = "";
    try {
      await beginLocalReleaseTransaction({ root, id: "competing-release" });
    } catch (error) {
      conflict = error instanceof Error ? error.message : String(error);
    }
    expect(conflict).toContain(`Local release transaction is already active. Lock: ${lockPath}.`);
    expect(conflict).toContain(`inspect ${join(lockPath, "owner.json")}`);
    expect(conflict).toContain(`remove only ${lockPath} before retrying`);

    expect(readFileSync(join(active.candidatePath, "marker"), "utf8")).toBe("active");
    expect(readFileSync(join(swap.paths.staging, "marker"), "utf8")).toBe("staging");
    expect(readFileSync(join(swap.paths.backup, "marker"), "utf8")).toBe("backup");
    expect(existsSync(active.workspace)).toBe(true);
    await active.release();
  });

  it("derives and cleans only its registered application swap resources", async () => {
    const root = createRoot();
    const transaction = await beginLocalReleaseTransaction({ root, id: "release-123" });
    const applications = join(root, "Applications");
    const swap = transaction.applicationSwap(join(applications, "VoiceReader.app"));
    const foreignStaging = join(applications, ".VoiceReader.app.staging-foreign");
    mkdirSync(swap.paths.staging, { recursive: true });
    mkdirSync(swap.paths.backup, { recursive: true });
    mkdirSync(foreignStaging, { recursive: true });

    expect(transaction.candidatePath).toBe(join(transaction.workspace, "candidate", "VoiceReader.app"));
    expect(swap.paths.staging).toMatch(/\.VoiceReader\.app\.staging-release-123-[\da-f-]+$/);
    expect(swap.paths.backup).toMatch(/\.VoiceReader\.app\.backup-release-123-[\da-f-]+$/);
    expect(swap.paths.failed).toMatch(/\.VoiceReader\.app\.failed-release-123-[\da-f-]+$/);

    await transaction.release();
    expect(existsSync(swap.paths.staging)).toBe(false);
    expect(existsSync(swap.paths.backup)).toBe(false);
    expect(existsSync(foreignStaging)).toBe(true);
  });

  it("does not release or clean resources after the lock owner token changes", async () => {
    const root = createRoot();
    const transaction = await beginLocalReleaseTransaction({ root, id: "owned-release" });
    const swap = transaction.applicationSwap(join(root, "Applications", "VoiceReader.app"));
    mkdirSync(transaction.candidatePath, { recursive: true });
    mkdirSync(swap.paths.staging, { recursive: true });
    writeFileSync(join(transaction.candidatePath, "marker"), "preserve");
    const ownerPath = join(root, ".local-release", "lock", "owner.json");
    writeFileSync(ownerPath, JSON.stringify({ id: "other", token: "other-token" }));

    await expect(swap.remove("staging")).rejects.toThrow("ownership changed");
    await expect(transaction.release()).rejects.toThrow("ownership changed");
    expect(existsSync(join(root, ".local-release", "lock"))).toBe(true);
    expect(existsSync(swap.paths.staging)).toBe(true);
    expect(readFileSync(join(transaction.candidatePath, "marker"), "utf8")).toBe("preserve");
  });

  it("rejects transaction ids that can escape the transactions directory", async () => {
    const root = createRoot();
    await expect(beginLocalReleaseTransaction({ root, id: "." })).rejects.toThrow("Invalid");
    await expect(beginLocalReleaseTransaction({ root, id: ".." })).rejects.toThrow("Invalid");
    await expect(beginLocalReleaseTransaction({ root, id: "release/other" })).rejects.toThrow("Invalid");
  });

  it("does not create resource capabilities after releasing the transaction", async () => {
    const root = createRoot();
    const transaction = await beginLocalReleaseTransaction({ root, id: "released-transaction" });
    await transaction.release();

    expect(() => transaction.applicationSwap(join(root, "Applications", "VoiceReader.app"))).toThrow(
      "released"
    );
  });

  it("closes the capability lifecycle as soon as release begins and shares concurrent release work", async () => {
    const root = createRoot();
    const transaction = await beginLocalReleaseTransaction({ root, id: "releasing-transaction" });

    const firstRelease = transaction.release();
    const secondRelease = transaction.release();
    expect(secondRelease).toBe(firstRelease);
    expect(() => transaction.applicationSwap(join(root, "Applications", "VoiceReader.app"))).toThrow(
      "releasing"
    );

    await firstRelease;
  });

  it("cleans only its workspace after success and failure, then permits a new transaction", async () => {
    const root = createRoot();
    let successfulWorkspace;
    await withLocalReleaseTransaction({ root, id: "successful-release" }, async (transaction) => {
      successfulWorkspace = transaction.workspace;
      mkdirSync(transaction.candidatePath, { recursive: true });
    });
    expect(existsSync(successfulWorkspace)).toBe(false);

    let failedWorkspace;
    await expect(
      withLocalReleaseTransaction({ root, id: "failed-release" }, async (transaction) => {
        failedWorkspace = transaction.workspace;
        mkdirSync(transaction.candidatePath, { recursive: true });
        throw new Error("package failed");
      })
    ).rejects.toThrow("package failed");
    expect(existsSync(failedWorkspace)).toBe(false);

    const next = await beginLocalReleaseTransaction({ root, id: "next-release" });
    expect(existsSync(join(root, ".local-release", "lock"))).toBe(true);
    await next.release();
  });

  it("survives the repository clean gate while keeping competitors excluded", async () => {
    const root = createRoot();
    const transaction = await beginLocalReleaseTransaction({ root, id: "verify-owner" });
    mkdirSync(transaction.candidatePath, { recursive: true });
    writeFileSync(join(transaction.candidatePath, "marker"), "candidate");
    mkdirSync(join(root, ".tmp", "generated"), { recursive: true });

    await cleanGeneratedArtifacts(root);

    expect(existsSync(join(root, ".tmp"))).toBe(false);
    expect(readFileSync(join(transaction.candidatePath, "marker"), "utf8")).toBe("candidate");
    await expect(beginLocalReleaseTransaction({ root, id: "competitor" })).rejects.toThrow(
      "already active"
    );
    await transaction.release();
  });
});
