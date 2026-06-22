# Finalize dist contract cleanup and docs

Status: completed

## Parent

`.scratch/vitest-test-flow/PRD.md`

## What to build

Finalize the ADR-0021 test workflow after the Vitest migration slices are complete. The dist contract command should only protect build-output and boundary contracts, developer documentation should describe the new command meanings, and the full acceptance command set should pass.

## Acceptance criteria

- [x] Dist contract tests focus on generated files, bundle contracts, preload bridge shape, HTML/CSS contracts, native addon output, asset copying, package-script assumptions, and cross-process boundary contracts.
- [x] Dist contract tests no longer duplicate source-level business behavior covered by Vitest.
- [x] Developer documentation describes `pnpm test` as the fast Vitest command.
- [x] Developer documentation describes `pnpm test:watch`.
- [x] Developer documentation describes `pnpm test:dist` and its build-output purpose.
- [x] Developer documentation describes `pnpm verify` as typecheck, Vitest, build, then dist contract checks.
- [x] The domain glossary is unchanged.
- [x] `pnpm typecheck` passes.
- [x] `pnpm test` passes.
- [x] `pnpm build` passes.
- [x] `pnpm test:dist -- --no-build` passes after build.
- [x] `pnpm test:dist` passes independently.
- [x] `pnpm verify` passes.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm test:dist -- --no-build`
- `pnpm test:dist`
- `pnpm verify`

## Blocked by

- `.scratch/vitest-test-flow/issues/03-move-shared-text-language-voice-and-minimax-helper-tests.md`
- `.scratch/vitest-test-flow/issues/04-move-reading-history-and-favorite-record-model-tests.md`
- `.scratch/vitest-test-flow/issues/05-move-sqlite-app-data-store-tests.md`
- `.scratch/vitest-test-flow/issues/06-move-minimax-account-setup-tests.md`
- `.scratch/vitest-test-flow/issues/07-move-reading-target-acquisition-and-apppresence-tests.md`
- `.scratch/vitest-test-flow/issues/08-move-playback-session-and-command-lifecycle-tests.md`
- `.scratch/vitest-test-flow/issues/09-move-renderer-audio-queue-tests.md`
- `.scratch/vitest-test-flow/issues/10-add-reader-window-react-ui-tests.md`
- `.scratch/vitest-test-flow/issues/11-add-playback-overlay-react-ui-tests.md`
