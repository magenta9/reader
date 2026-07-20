# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- `CONTEXT.md` at the repo root.
- `docs/adr/CATALOG.md` to identify current, historical, superseded, and refined decisions.
- The specific ADRs linked from the catalog that touch the area being changed.

If any of these files do not exist, proceed silently. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions are resolved.

## Layout

This is a single-context repo:

```text
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

## Use the glossary's vocabulary

When output names a domain concept, use the term as defined in `CONTEXT.md`. Do not drift to synonyms the glossary explicitly avoids.

If a concept is missing from the glossary, either reconsider whether the concept belongs or note it for `/grill-with-docs`.

## Flag ADR conflicts

If output contradicts an existing ADR, surface it explicitly rather than silently overriding it.

ADR status and relationship terms are engineering governance vocabulary, not VoiceReader product
domain language. Keep their canonical machine state in ADR frontmatter and regenerate the catalog;
do not add them to `CONTEXT.md` or infer them from implementation existence.

After changing ADR frontmatter or adding an ADR, run `bun run docs:adr` explicitly and commit the
derived catalog. Use `bun run check:adr` for a non-mutating check; the complete `make verify` gate
runs the same check and rejects missing, invalid, or stale metadata/catalog state.
