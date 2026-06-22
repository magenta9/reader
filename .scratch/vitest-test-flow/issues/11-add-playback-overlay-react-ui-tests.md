# Add Playback Overlay React UI tests

Status: completed

## Parent

`.scratch/vitest-test-flow/PRD.md`

## What to build

Add jsdom React UI tests for the Playback Overlay through fake overlay bridge events. Runtime entrypoints should keep real bridge lookup and root rendering, while tests should import a pure component seam and verify visible lifecycle behavior.

## Acceptance criteria

- [x] Playback Overlay runtime bridge lookup and root rendering remain in the runtime entrypoint only.
- [x] A testable Playback Overlay component seam accepts a fake overlay bridge.
- [x] React UI tests cover overlay show events making the overlay visible.
- [x] React UI tests cover overlay metric events updating amplitude/progress behavior.
- [x] React UI tests cover progress not moving backward after lower progress metrics.
- [x] React UI tests cover finish, fail, and stop events entering the leaving state and then hiding.
- [x] React UI tests avoid real Electron windows and real audio output.
- [x] `pnpm test`, `pnpm build`, and `pnpm test:dist -- --no-build` pass.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm build && pnpm test:dist -- --no-build`

## Blocked by

- `.scratch/vitest-test-flow/issues/01-bootstrap-vitest-command-flow.md`
