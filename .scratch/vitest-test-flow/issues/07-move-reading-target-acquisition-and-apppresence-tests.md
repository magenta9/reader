# Move Reading Target acquisition and AppPresence tests

Status: completed

## Parent

`.scratch/vitest-test-flow/PRD.md`

## What to build

Move Reading Target acquisition and AppPresenceController behavior into Vitest. The slice should protect Selected Text priority, Clipboard Text fallback, selection-capture failure handling, clipboard restoration, Dock visibility, Dock icon, and selection-capture hiding behavior.

## Acceptance criteria

- [x] Vitest covers Selected Text being preferred when available.
- [x] Vitest covers Clipboard Text fallback when Selected Text is unavailable or empty.
- [x] Vitest covers empty and non-text clipboard skip behavior at the Reading Target acquisition seam.
- [x] Vitest covers clipboard preservation/restoration around selection copy attempts.
- [x] Vitest covers safe logging when Selected Text capture fails.
- [x] Vitest covers AppPresence macOS hide plus Dock restore behavior.
- [x] Vitest covers AppPresence non-macOS reader window hide behavior.
- [x] Vitest covers AppPresence missing Dock no-op behavior and non-empty Dock icon setting.
- [x] Equivalent duplicate Reading Target and AppPresence business assertions are removed from the dist contract command.
- [x] `pnpm test`, `pnpm build`, and `pnpm test:dist -- --no-build` pass.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm build && pnpm test:dist -- --no-build`

## Blocked by

- `.scratch/vitest-test-flow/issues/01-bootstrap-vitest-command-flow.md`
- `.scratch/vitest-test-flow/issues/02-create-dist-contract-test-command.md`
