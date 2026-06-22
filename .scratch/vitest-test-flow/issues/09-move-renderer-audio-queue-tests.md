# Move renderer audio queue tests

Status: completed

## Parent

`.scratch/vitest-test-flow/PRD.md`

## What to build

Move renderer audio queue behavior into Vitest using browser fakes. The tests should verify audio session lifecycle and Playback Overlay metric behavior without real audio device output.

## Acceptance criteria

- [x] Vitest covers renderer audio queue session start.
- [x] Vitest covers chunk playback and segment end handling.
- [x] Vitest covers finish, fail, and stop handling.
- [x] Vitest covers renderer idle signaling.
- [x] Vitest covers progress metric emission for current Reading Target playback.
- [x] Vitest covers suppression of Playback Overlay metrics for History Replay and Favorite Replay.
- [x] Vitest covers replacement or stale-session behavior already protected by the existing test script.
- [x] Equivalent duplicate renderer audio queue business assertions are removed from the dist contract command.
- [x] `pnpm test`, `pnpm build`, and `pnpm test:dist -- --no-build` pass.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm build && pnpm test:dist -- --no-build`

## Blocked by

- `.scratch/vitest-test-flow/issues/08-move-playback-session-and-command-lifecycle-tests.md`
