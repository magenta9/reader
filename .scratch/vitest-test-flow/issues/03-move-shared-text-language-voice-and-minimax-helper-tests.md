# Move shared text, language, Voice, and MiniMax helper tests

Status: completed

Implementation status: completed

## Parent

`.scratch/vitest-test-flow/PRD.md`

## What to build

Move the pure source-level behavior tests for text normalization, Detected Language, Reading Segment creation, Voice selection, and MiniMax helper behavior into Vitest. After equivalent Vitest coverage exists, remove the duplicate business assertions from the dist contract command.

## Acceptance criteria

- [x] Vitest covers Detected Language classification for supported language groups and unknown text.
- [x] Vitest covers Reading Segment normalization and splitting for short text, long punctuated text, and hard-split text.
- [x] Vitest covers Voice normalization, Voice merging, language grouping, Preferred Voice, Default Voice, and custom Voice ID selection.
- [x] Vitest covers MiniMax TTS request body construction.
- [x] Vitest covers MiniMax stream parsing for incremental audio, final aggregate audio, and final-only audio.
- [x] Vitest covers MiniMax API key problem classification and base URL ordering.
- [x] Equivalent duplicate shared/MiniMax business assertions are removed from the dist contract command.
- [x] `pnpm test`, `pnpm build`, and `pnpm test:dist -- --no-build` pass.

## Blocked by

- `.scratch/vitest-test-flow/issues/01-bootstrap-vitest-command-flow.md`
- `.scratch/vitest-test-flow/issues/02-create-dist-contract-test-command.md`

## Verification

- `pnpm test` passed with shared language, segment, Voice, and MiniMax helper tests.
- `pnpm build` passed.
- `pnpm test:dist -- --no-build` passed after duplicate shared/MiniMax business assertions were removed from the dist contract command.
