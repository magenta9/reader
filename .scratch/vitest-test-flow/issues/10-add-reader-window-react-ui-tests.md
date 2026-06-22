# Add Reader Window React UI tests

Status: completed

## Parent

`.scratch/vitest-test-flow/PRD.md`

## What to build

Add jsdom React UI tests for the Reader Window through fake Reader Window and renderer audio bridges. Runtime entrypoints should keep real bridge lookup and root rendering, while tests should import a pure component seam and assert user-visible behavior.

## Acceptance criteria

- [x] Reader Window runtime bridge lookup and root rendering remain in the runtime entrypoint only.
- [x] A testable Reader Window component seam accepts fake bridge dependencies.
- [x] React UI tests cover Home setup blocker behavior when no MiniMax API key is available.
- [x] React UI tests cover Home verified playback calling the fake bridge and showing successful playback feedback.
- [x] React UI tests cover language-scoped Voice preference selection through the visible select control.
- [x] React UI tests cover Reading History empty state.
- [x] React UI tests cover selecting a Reading History Record and showing detail actions.
- [x] Tests use user-visible roles, labels, text, and disabled states rather than component internals.
- [x] `pnpm test`, `pnpm build`, and `pnpm test:dist -- --no-build` pass.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm build && pnpm test:dist -- --no-build`

## Blocked by

- `.scratch/vitest-test-flow/issues/01-bootstrap-vitest-command-flow.md`
