# Create dist contract test command

Status: completed

Implementation status: completed

## Parent

`.scratch/vitest-test-flow/PRD.md`

## What to build

Convert the existing build-first test path into a distinct dist contract command. It should remain independently runnable and should also support a no-build mode for full verification after a build has already completed.

## Acceptance criteria

- [x] The dist contract command runs the existing build-output checks as a named test script.
- [x] Running the dist contract command directly builds before checking generated output.
- [x] Running the dist contract command with no-build mode checks existing generated output without building again.
- [x] Full verification runs typecheck, Vitest, build, and dist contract checks without duplicate builds.
- [x] Existing checks for generated files, bundle contracts, preload bridge shape, HTML/CSS contracts, native addon output, assets, and packaging assumptions remain covered.
- [x] `pnpm test`, `pnpm build`, `pnpm test:dist`, `pnpm test:dist -- --no-build`, and `pnpm verify` pass.

## Blocked by

- `.scratch/vitest-test-flow/issues/01-bootstrap-vitest-command-flow.md`

## Verification

- `pnpm test` passed.
- `pnpm build` passed.
- `pnpm test:dist -- --no-build` passed against existing `dist/`.
- `pnpm test:dist` passed as an independently building dist contract command.
- `pnpm verify` passed, running typecheck, Vitest, build, then dist contract checks with `--no-build`.
