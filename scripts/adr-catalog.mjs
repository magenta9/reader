import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ADR_FILE_PATTERN = /^(\d{4})-[a-z0-9-]+\.md$/;
const ADR_HEADING_PATTERN = /^# (.+)$/m;
const ADR_ID_PATTERN = /^ADR-\d{4}$/;
const STATUS_VALUES = new Set([
  "proposed",
  "accepted",
  "partially-superseded",
  "superseded",
  "historical"
]);
const RELATION_FIELDS = ["superseded-by", "partially-superseded-by", "refined-by"];
const FRONTMATTER_FIELDS = new Set(["status", ...RELATION_FIELDS]);
const defaultAdrDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/adr");

export async function buildAdrCatalog({ adrDirectory }) {
  const directory = resolve(adrDirectory);
  const fileNames = (await readdir(directory))
    .filter((fileName) => ADR_FILE_PATTERN.test(fileName))
    .sort();
  const records = await Promise.all(
    fileNames.map(async (fileName) => parseAdr(fileName, await readFile(join(directory, fileName), "utf8")))
  );
  validateRelationTargets(records);
  return {
    records,
    markdown: renderCatalog(records)
  };
}

export async function writeAdrCatalog({
  adrDirectory = defaultAdrDirectory,
  catalogPath
} = {}) {
  const paths = resolveCatalogPaths({ adrDirectory, catalogPath });
  const catalog = await buildAdrCatalog({ adrDirectory: paths.adrDirectory });
  await writeFile(paths.catalogPath, catalog.markdown);
  return catalog;
}

export async function checkAdrCatalog({
  adrDirectory = defaultAdrDirectory,
  catalogPath
} = {}) {
  const paths = resolveCatalogPaths({ adrDirectory, catalogPath });
  const catalog = await buildAdrCatalog({ adrDirectory: paths.adrDirectory });
  let current;
  try {
    current = await readFile(paths.catalogPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    throw new Error("ADR catalog is missing. Run the explicit write command.");
  }
  if (current !== catalog.markdown) {
    throw new Error("ADR catalog is stale. Run the explicit write command.");
  }
  return catalog;
}

function parseAdr(fileName, source) {
  const number = fileName.match(ADR_FILE_PATTERN)?.[1];
  const expectedId = `ADR-${number}`;
  const heading = source.match(ADR_HEADING_PATTERN);
  if (!heading) {
    throw new Error(`${expectedId} must have a level-one heading.`);
  }
  const metadata = parseFrontmatter(expectedId, source);
  const relations = validateMetadata(expectedId, metadata);
  validateStatusRelations(expectedId, metadata.status, relations);
  return {
    id: expectedId,
    fileName,
    title: heading[1].trim(),
    status: metadata.status,
    relations
  };
}

function parseFrontmatter(id, source) {
  const normalizedSource = source.replaceAll("\r\n", "\n");
  const match = normalizedSource.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) throw new Error(`${id} must declare frontmatter.`);
  const metadata = Object.create(null);
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 1) throw new Error(`${id} has malformed frontmatter.`);
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!key || !value) throw new Error(`${id} has malformed frontmatter.`);
    if (Object.hasOwn(metadata, key)) {
      throw new Error(`${id} repeats frontmatter field '${key}'.`);
    }
    metadata[key] = value;
  }
  return metadata;
}

function validateMetadata(id, metadata) {
  for (const field of Object.keys(metadata)) {
    if (!FRONTMATTER_FIELDS.has(field)) {
      throw new Error(`${id} has unknown frontmatter field '${field}'.`);
    }
  }
  if (!STATUS_VALUES.has(metadata.status)) {
    throw new Error(`${id} has unknown status '${metadata.status ?? "missing"}'.`);
  }
  return RELATION_FIELDS.flatMap((type) =>
    parseRelationTargets(id, type, metadata[type]).map((target) => ({ type, target }))
  );
}

function parseRelationTargets(id, type, value) {
  if (!value) return [];
  const targets = value
    .split(",")
    .map((target) => target.trim())
    .sort();
  if (targets.some((target) => !ADR_ID_PATTERN.test(target))) {
    throw new Error(`${id} has malformed ${type} relation.`);
  }
  if (new Set(targets).size !== targets.length) {
    throw new Error(`${id} repeats a ${type} relation target.`);
  }
  return targets;
}

function validateStatusRelations(id, status, relations) {
  const fullReplacement = relations.some(({ type }) => type === "superseded-by");
  if (fullReplacement && status !== "superseded") {
    throw new Error(`${id} with superseded-by must use status 'superseded'.`);
  }
  if (status === "superseded" && !fullReplacement) {
    throw new Error(`${id} with status 'superseded' must declare superseded-by.`);
  }
  const partialReplacement = relations.some(({ type }) => type === "partially-superseded-by");
  if (status === "partially-superseded" && !partialReplacement) {
    throw new Error(
      `${id} with status 'partially-superseded' must declare partially-superseded-by.`
    );
  }
}

function validateRelationTargets(records) {
  const ids = new Set(records.map(({ id }) => id));
  for (const record of records) {
    for (const relation of record.relations) {
      if (relation.target === record.id) {
        throw new Error(`${record.id} must not reference itself.`);
      }
      if (!ids.has(relation.target)) {
        throw new Error(`${record.id} references missing ${relation.target}.`);
      }
    }
  }
}

function renderCatalog(records) {
  const targetFiles = new Map(records.map(({ id, fileName }) => [id, fileName]));
  const rows = records.map(({ id, fileName, title, status, relations }) => {
    const groupedRelations = Map.groupBy(relations, ({ type }) => type);
    const renderedRelations = relations.length
      ? RELATION_FIELDS.filter((type) => groupedRelations.has(type))
          .map(
            (type) =>
              `${type}: ${groupedRelations
                .get(type)
                .map(({ target }) => `[${target}](${targetFiles.get(target)})`)
                .join(", ")}`
          )
          .join("; ")
      : "—";
    return `| [${id}](${fileName}) | ${escapeCell(title)} | ${status} | ${renderedRelations} |`;
  });
  return [
    "# Architecture Decision Record Catalog",
    "",
    "> Generated from ADR frontmatter. Do not edit manually.",
    "",
    "| ADR | Title | Status | Relations |",
    "| --- | --- | --- | --- |",
    ...rows,
    ""
  ].join("\n");
}

function escapeCell(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("|", "\\|");
}

function resolveCatalogPaths({ adrDirectory, catalogPath }) {
  const resolvedAdrDirectory = resolve(adrDirectory);
  return {
    adrDirectory: resolvedAdrDirectory,
    catalogPath: catalogPath ? resolve(catalogPath) : join(resolvedAdrDirectory, "CATALOG.md")
  };
}

export async function runAdrCatalogCli(argv) {
  const [operation, ...options] = argv;
  const parsed = parseCliOptions(options);
  if (operation === "write") return writeAdrCatalog(parsed);
  if (operation === "check") return checkAdrCatalog(parsed);
  throw new Error("Usage: adr-catalog.mjs <write|check> [--adr-directory PATH] [--catalog PATH]");
}

function parseCliOptions(options) {
  const parsed = {};
  for (let index = 0; index < options.length; index += 2) {
    const flag = options[index];
    const value = options[index + 1];
    if (!value) throw new Error(`Missing value for ${flag ?? "CLI option"}.`);
    if (flag === "--adr-directory") parsed.adrDirectory = value;
    else if (flag === "--catalog") parsed.catalogPath = value;
    else throw new Error(`Unknown CLI option '${flag}'.`);
  }
  return parsed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runAdrCatalogCli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
