import { execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildAdrCatalog,
  checkAdrCatalog,
  writeAdrCatalog
} from "../../scripts/adr-catalog.mjs";

const temporaryRoots = [];
const execFileAsync = promisify(execFile);

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("ADR Catalog", () => {
  it("builds a deterministic catalog from ADR frontmatter", async () => {
    const adrDirectory = createAdrDirectory();
    writeAdr(adrDirectory, "0002-second.md", {
      status: "accepted",
      title: "Second decision"
    });
    writeAdr(adrDirectory, "0001-first.md", {
      status: "accepted",
      title: "First decision",
      body: "refined-by: ADR-0002"
    });

    const catalog = await buildAdrCatalog({ adrDirectory });

    expect(catalog.records).toEqual([
      {
        id: "ADR-0001",
        fileName: "0001-first.md",
        title: "First decision",
        status: "accepted",
        relations: [{ type: "refined-by", target: "ADR-0002" }]
      },
      {
        id: "ADR-0002",
        fileName: "0002-second.md",
        title: "Second decision",
        status: "accepted",
        relations: []
      }
    ]);
    expect(catalog.markdown).toBe(`# Architecture Decision Record Catalog

> Generated from ADR frontmatter. Do not edit manually.

| ADR | Title | Status | Relations |
| --- | --- | --- | --- |
| [ADR-0001](0001-first.md) | First decision | accepted | refined-by: ADR-0002 |
| [ADR-0002](0002-second.md) | Second decision | accepted | — |
`);
  });

  it("normalizes every supported status and relation into deterministic target order", async () => {
    const adrDirectory = createAdrDirectory();
    writeAdr(adrDirectory, "0001-proposed.md", { status: "proposed", title: "Proposed" });
    writeAdr(adrDirectory, "0002-accepted.md", {
      status: "accepted",
      title: "Accepted",
      body: "refined-by: ADR-0005, ADR-0004\npartially-superseded-by: ADR-0003"
    });
    writeAdr(adrDirectory, "0003-partial.md", {
      status: "partially-superseded",
      title: "Partial",
      body: "partially-superseded-by: ADR-0005"
    });
    writeAdr(adrDirectory, "0004-superseded.md", {
      status: "superseded",
      title: "Superseded",
      body: "superseded-by: ADR-0005"
    });
    writeAdr(adrDirectory, "0005-historical.md", { status: "historical", title: "Historical" });

    const catalog = await buildAdrCatalog({ adrDirectory });

    expect(catalog.records.map(({ status }) => status)).toEqual([
      "proposed",
      "accepted",
      "partially-superseded",
      "superseded",
      "historical"
    ]);
    expect(catalog.records[1].relations).toEqual([
      { type: "partially-superseded-by", target: "ADR-0003" },
      { type: "refined-by", target: "ADR-0004" },
      { type: "refined-by", target: "ADR-0005" }
    ]);
    expect(catalog.markdown).toContain(
      "partially-superseded-by: ADR-0003; refined-by: ADR-0004, ADR-0005"
    );
  });

  it.each([
    ["missing frontmatter", "# ADR-0001: Missing\n", "must declare frontmatter"],
    ["malformed frontmatter", "---\nstatus accepted\n---\n# ADR-0001: Malformed\n", "malformed frontmatter"],
    ["unknown field", "---\nstatus: accepted\nowner: team\n---\n# ADR-0001: Unknown\n", "unknown frontmatter field 'owner'"],
    ["prototype field", "---\nstatus: accepted\n__proto__: hidden\n---\n# ADR-0001: Prototype\n", "unknown frontmatter field '__proto__'"],
    ["unknown status", "---\nstatus: active\n---\n# ADR-0001: Unknown\n", "unknown status 'active'"],
    ["dangling relation", "---\nstatus: accepted\nrefined-by: ADR-9999\n---\n# ADR-0001: Dangling\n", "references missing ADR-9999"],
    ["self relation", "---\nstatus: accepted\nrefined-by: ADR-0001\n---\n# ADR-0001: Self\n", "must not reference itself"],
    ["contradictory full replacement", "---\nstatus: accepted\nsuperseded-by: ADR-0002\n---\n# ADR-0001: Contradiction\n", "must use status 'superseded'"],
    ["missing full replacement", "---\nstatus: superseded\n---\n# ADR-0001: Missing relation\n", "must declare superseded-by"]
  ])("fails closed for %s", async (_name, source, diagnostic) => {
    const adrDirectory = createAdrDirectory();
    writeFileSync(join(adrDirectory, "0001-case.md"), source);
    writeAdr(adrDirectory, "0002-target.md", { status: "accepted", title: "Target" });

    await expect(buildAdrCatalog({ adrDirectory })).rejects.toThrow(diagnostic);
  });

  it("writes only when explicitly requested and rejects a stale catalog without modifying it", async () => {
    const adrDirectory = createAdrDirectory();
    const catalogPath = join(adrDirectory, "CATALOG.md");
    writeAdr(adrDirectory, "0001-first.md", { status: "accepted", title: "First" });

    const written = await writeAdrCatalog({ adrDirectory });
    expect(readFileSync(catalogPath, "utf8")).toBe(written.markdown);
    await expect(checkAdrCatalog({ adrDirectory })).resolves.toEqual(written);

    writeAdr(adrDirectory, "0002-second.md", { status: "accepted", title: "Second" });
    const beforeCheck = readFileSync(catalogPath, "utf8");
    await expect(checkAdrCatalog({ adrDirectory })).rejects.toThrow("ADR catalog is stale");
    expect(readFileSync(catalogPath, "utf8")).toBe(beforeCheck);
  });

  it("preserves non-missing filesystem failures from the read boundary", async () => {
    const adrDirectory = createAdrDirectory();
    const catalogPath = join(adrDirectory, "catalog-directory");
    mkdirSync(catalogPath);
    writeAdr(adrDirectory, "0001-first.md", { status: "accepted", title: "First" });

    await expect(checkAdrCatalog({ adrDirectory, catalogPath })).rejects.toMatchObject({
      code: "EISDIR"
    });
  });

  it("exposes write and check through the real CLI", async () => {
    const adrDirectory = createAdrDirectory();
    const catalogPath = join(adrDirectory, "CATALOG.md");
    writeAdr(adrDirectory, "0001-first.md", { status: "accepted", title: "First" });
    const scriptPath = join(process.cwd(), "scripts/adr-catalog.mjs");

    await execFileAsync(process.execPath, [
      scriptPath,
      "write",
      "--adr-directory",
      adrDirectory,
      "--catalog",
      catalogPath
    ]);
    expect(readFileSync(catalogPath, "utf8")).toContain("[ADR-0001](0001-first.md)");
    await expect(
      execFileAsync(process.execPath, [
        scriptPath,
        "check",
        "--adr-directory",
        adrDirectory,
        "--catalog",
        catalogPath
      ])
    ).resolves.toMatchObject({ stderr: "" });
  });
});

function createAdrDirectory() {
  const root = mkdtempSync(join(tmpdir(), "voicereader-adr-catalog-"));
  temporaryRoots.push(root);
  const adrDirectory = join(root, "docs/adr");
  mkdirSync(adrDirectory, { recursive: true });
  return adrDirectory;
}

function writeAdr(adrDirectory, fileName, { status, title, body = "" }) {
  writeFileSync(
    join(adrDirectory, fileName),
    `---\nstatus: ${status}\n${body ? `${body}\n` : ""}---\n\n# ${title}\n`
  );
}
