# Move Reading History and Favorite Record model tests

Status: completed

Implementation status: completed

## Parent

`.scratch/vitest-test-flow/PRD.md`

## What to build

Move source-level model tests for Reading History Records, Favorite Records, and record view-model grouping into Vitest. This slice should cover record metadata and selection behavior without depending on built Electron output.

## Acceptance criteria

- [x] Vitest covers Reading History Record creation metadata, including source, preview, duration estimate, and language summary.
- [x] Vitest covers Reading History retention cutoff behavior.
- [x] Vitest covers the five-minute Reading History deduplication rule at the model or store seam already used by the codebase.
- [x] Vitest covers Favorite Record creation semantics where duplicate favorites are allowed.
- [x] Vitest covers Favorite Record independence from ordinary Reading History at the highest available source seam for this slice.
- [x] Vitest covers record grouping labels and adjacent selection behavior after deletion.
- [x] Equivalent duplicate model/view-model business assertions are removed from the dist contract command.
- [x] `pnpm test`, `pnpm build`, and `pnpm test:dist -- --no-build` pass.

## Blocked by

- `.scratch/vitest-test-flow/issues/01-bootstrap-vitest-command-flow.md`
- `.scratch/vitest-test-flow/issues/02-create-dist-contract-test-command.md`

## Verification

- `pnpm test` passed with Reading History Record, Favorite Record seam, and record view-model tests.
- `pnpm build` passed.
- `pnpm test:dist -- --no-build` passed after duplicate model/view-model assertions were removed from the dist contract command.
