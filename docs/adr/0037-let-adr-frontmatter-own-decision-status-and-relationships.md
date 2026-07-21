---
status: accepted
---

# Let ADR Frontmatter Own Decision Status and Relationships

Every numbered VoiceReader Architecture Decision Record declares its canonical status and decision relationships in a deliberately small flat frontmatter block. That frontmatter is the only machine-readable authority for currentness. `docs/adr/CATALOG.md` is a deterministic committed projection for navigation and review; it must be regenerated from the ADRs rather than edited as a second source of truth.

The supported statuses are `proposed`, `accepted`, `partially-superseded`, `superseded`, and `historical`. Status evaluates the ADR's core decision: `proposed` is under review and does not yet govern implementation, `accepted` guides current work, `historical` records a retired product surface without claiming a current replacement, `superseded` has an explicit complete replacement, and `partially-superseded` means part of the core decision no longer applies. An accepted ADR may still point to a partial replacement when only a subordinate clause is retired and its existing scope note explains that boundary; this preserves the accepted core of ADR-0021, ADR-0030, and ADR-0031 after ADR-0036.

The supported relationships are `superseded-by`, `partially-superseded-by`, and `refined-by`. `superseded-by` names a complete replacement, `partially-superseded-by` names a decision that invalidates only an explicitly scoped part, and `refined-by` names a later decision that deepens implementation or ownership without invalidating the earlier core. Values are ADR identifiers, with multiple targets stored as a deterministic comma-separated list. Relationship targets must exist and cannot refer to the declaring ADR. A complete replacement requires both `status: superseded` and `superseded-by`; nuanced replacement scope remains in the ADR body because flat metadata must not pretend to encode an architectural clause.

We retain `partially-superseded` as a first-class status instead of a binary accepted/superseded model because a binary label would either present a materially narrowed core as wholly current or discard constraints that still govern the product. The explicit state makes that review signal queryable, while the required prose scope note carries the nuance that flat metadata cannot safely encode.

The repository-owned dependency-free ADR Catalog module parses, validates, renders, explicitly writes, and non-mutatingly checks the projection. `bun run docs:adr` is the explicit contributor write command; `bun run check:adr` is the read-only check and the complete `make verify` gate invokes it before build and test work. Verification fails closed for missing or malformed metadata, unsupported vocabulary, contradictory complete replacement, self-reference, dangling targets, or stale generated output. The explicit write operation is never an implicit side effect of a check.

ADR lifecycle language is engineering governance, not VoiceReader product domain language, so it belongs in this decision, the generated catalog, and agent/contributor documentation rather than `CONTEXT.md`. This change does not alter Electron behavior, IPC, SQLite, Settings, packaging, configuration, or user data. Rollback removes the freshness gate first, then the generated catalog and reading-entry links, and finally the frontmatter/module; no data migration is required.
