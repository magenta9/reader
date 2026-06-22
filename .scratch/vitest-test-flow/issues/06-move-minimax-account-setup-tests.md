# Move MiniMax account setup tests

Status: completed

Implementation status: completed

## Parent

`.scratch/vitest-test-flow/PRD.md`

## What to build

Move MiniMax account setup tests into Vitest using injected API fakes. The tests should verify account setup behavior without live MiniMax credentials or network calls.

## Acceptance criteria

- [x] Vitest covers successful MiniMax API key verification and verified Settings updates.
- [x] Vitest covers Voice cache persistence after successful verification.
- [x] Vitest covers Voice refresh success and cached Voice fallback after refresh failure.
- [x] Vitest covers missing key and invalid key behavior.
- [x] Vitest covers Preferred Voice updates by language.
- [x] Vitest verifies setup blockers and refresh failures do not write Error Log entries.
- [x] Equivalent duplicate MiniMax account business assertions are removed from the dist contract command.
- [x] `pnpm test`, `pnpm build`, and `pnpm test:dist -- --no-build` pass.

## Blocked by

- `.scratch/vitest-test-flow/issues/03-move-shared-text-language-voice-and-minimax-helper-tests.md`
- `.scratch/vitest-test-flow/issues/05-move-sqlite-app-data-store-tests.md`

## Verification

- `pnpm test` passed with MiniMax account setup tests using injected API fakes.
- `pnpm build` passed.
- `pnpm test:dist -- --no-build` passed after duplicate MiniMax account assertions were removed from the dist contract command.
