# Bootstrap Vitest command flow

Status: completed

Implementation status: completed

## Parent

`.scratch/vitest-test-flow/PRD.md`

## What to build

Introduce the fast Vitest test runner for VoiceReader source-level tests without removing the existing build-first coverage yet. The normal test command should point at Vitest, a watch command should be available for local development, and full verification should be ready to include the new fast test layer while still preserving the current build-output protection path.

## Acceptance criteria

- [x] Vitest, jsdom, React Testing Library, user-event, and jest-dom are available as development test dependencies.
- [x] Vitest is configured to discover root-level tests and to support jsdom React UI tests.
- [x] Source-level tests are kept outside the production source tree and are typechecked.
- [x] `pnpm test` runs Vitest without building the Electron app first.
- [x] `pnpm test:watch` runs Vitest in watch mode.
- [x] Existing build-first test coverage is still runnable after this slice.
- [x] `pnpm typecheck` and `pnpm test` pass.

## Blocked by

None - can start immediately

## Verification

- `pnpm typecheck` passed.
- `pnpm test` passed, running Vitest without building `dist/`.
- `pnpm test:core` passed, proving the existing build-first coverage is still runnable.
