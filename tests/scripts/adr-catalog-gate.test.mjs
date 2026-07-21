import { execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { writeAdrCatalog } from "../../scripts/adr-catalog.mjs";

const execFileAsync = promisify(execFile);
const temporaryRoots = [];
const repositoryRoot = process.cwd();

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("ADR Catalog verification gate", () => {
  it("places the read-only ADR check in the complete verification plan", async () => {
    const { stdout } = await execFileAsync("/usr/bin/make", ["-n", "verify"], {
      cwd: repositoryRoot
    });

    expect(stdout).toContain("bun run check:adr");
    expect(stdout.indexOf("bun run check:adr")).toBeLessThan(stdout.indexOf("bun run clean"));
  });

  it("accepts a current catalog and rejects a stale catalog without rewriting it", async () => {
    const adrDirectory = createAdrDirectory();
    const catalogPath = join(adrDirectory, "CATALOG.md");
    writeAdr(adrDirectory, "0001-first.md", "accepted", "First");
    await writeAdrCatalog({ adrDirectory, catalogPath });

    await expect(runMakeGate(adrDirectory)).resolves.toContain("bun run check:adr");

    const staleCatalog = "stale catalog\n";
    writeFileSync(catalogPath, staleCatalog);
    await expect(runMakeGate(adrDirectory)).rejects.toThrow("ADR catalog is stale");
    expect(readFileSync(catalogPath, "utf8")).toBe(staleCatalog);
  });

  it("rejects malformed ADR metadata through the same Make target", async () => {
    const adrDirectory = createAdrDirectory();
    const catalogPath = join(adrDirectory, "CATALOG.md");
    writeFileSync(
      join(adrDirectory, "0001-invalid.md"),
      "---\nstatus: accepted\nowner: hidden\n---\n\n# Invalid\n"
    );
    writeFileSync(catalogPath, "catalog must remain untouched\n");

    await expect(runMakeGate(adrDirectory)).rejects.toThrow(
      "unknown frontmatter field 'owner'"
    );
    expect(readFileSync(catalogPath, "utf8")).toBe("catalog must remain untouched\n");
  });
});

function createAdrDirectory() {
  const root = mkdtempSync(join(tmpdir(), "voicereader-adr-gate-"));
  temporaryRoots.push(root);
  const adrDirectory = join(root, "docs/adr");
  mkdirSync(adrDirectory, { recursive: true });
  return adrDirectory;
}

function writeAdr(adrDirectory, fileName, status, title) {
  writeFileSync(join(adrDirectory, fileName), `---\nstatus: ${status}\n---\n\n# ${title}\n`);
}

async function runMakeGate(adrDirectory) {
  try {
    const { stdout, stderr } = await execFileAsync(
      "/usr/bin/make",
      ["check-adr", `ADR_CHECK_OPTIONS=-- --adr-directory "${adrDirectory}"`],
      { cwd: repositoryRoot }
    );
    return `${stdout}${stderr}`;
  } catch (error) {
    throw new Error(`${error.stdout ?? ""}${error.stderr ?? ""}`);
  }
}
