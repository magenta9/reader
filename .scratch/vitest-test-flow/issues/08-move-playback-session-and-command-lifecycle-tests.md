# Move Playback Session and command lifecycle tests

Status: completed

## Parent

`.scratch/vitest-test-flow/PRD.md`

## What to build

Move Playback Session orchestration and playback command lifecycle tests into Vitest. The tests should use fake sinks, fake shortcuts, and fake streams to verify user-visible playback outcomes without live MiniMax calls.

## Acceptance criteria

- [x] Vitest covers successful current Reading Target playback.
- [x] Vitest covers silent readiness skips for unverified API key and missing Voice.
- [x] Vitest covers runtime MiniMax failure Error Log behavior.
- [x] Vitest covers new Play replacement, previous stream abort, and previous session stop events.
- [x] Vitest covers Stop Shortcut registration and cleanup around active Playback Sessions.
- [x] Vitest covers Activation Shortcut start behavior and duplicate pending start coalescing.
- [x] Vitest covers History Replay using saved full text without creating or updating Reading History.
- [x] Vitest covers Favorite Replay using saved full text without creating history or updating Favorite Record timestamps.
- [x] Vitest covers feedback surface routing for current Reading Target playback, History Replay, and Favorite Replay.
- [x] Equivalent duplicate playback service and command lifecycle assertions are removed from the dist contract command.
- [x] `pnpm test`, `pnpm build`, and `pnpm test:dist -- --no-build` pass.

## Verification

- `pnpm typecheck`
- `pnpm test`
- `pnpm build && pnpm test:dist -- --no-build`

## Blocked by

- `.scratch/vitest-test-flow/issues/03-move-shared-text-language-voice-and-minimax-helper-tests.md`
- `.scratch/vitest-test-flow/issues/05-move-sqlite-app-data-store-tests.md`
- `.scratch/vitest-test-flow/issues/06-move-minimax-account-setup-tests.md`
- `.scratch/vitest-test-flow/issues/07-move-reading-target-acquisition-and-apppresence-tests.md`
