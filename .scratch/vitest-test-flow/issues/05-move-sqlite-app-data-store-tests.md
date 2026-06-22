# Move SQLite app data store tests

Status: completed

Implementation status: completed

## Parent

`.scratch/vitest-test-flow/PRD.md`

## What to build

Move SQLite-backed app data behavior into Vitest. The tests should use temporary local databases and verify the externally observable data-store behavior that VoiceReader depends on.

## Acceptance criteria

- [x] Vitest covers database creation and required local app data tables.
- [x] Vitest covers Settings defaults, Settings updates, and shortcut migration behavior.
- [x] Vitest covers MiniMax API key persistence, reading, clearing, and legacy encrypted key cleanup.
- [x] Vitest covers Reading History persistence, listing, lookup, deletion, clearing, retention cleanup, and source-preserving deduplication.
- [x] Vitest covers Favorite Record persistence, duplicate creation, ordering, lookup, deletion, and survival after Reading History cleanup/deletion.
- [x] Vitest covers Error Log add/count/list/clear behavior, message sanitization, and the 100-entry cap.
- [x] Equivalent duplicate SQLite-backed business assertions are removed from the dist contract command.
- [x] `pnpm test`, `pnpm build`, and `pnpm test:dist -- --no-build` pass.

## Blocked by

- `.scratch/vitest-test-flow/issues/04-move-reading-history-and-favorite-record-model-tests.md`

## Verification

- `pnpm test` passed with SQLite-backed AppDataStore tests.
- `pnpm build` passed.
- `pnpm test:dist -- --no-build` passed after duplicate SQLite-backed business assertions were removed from the dist contract command.
