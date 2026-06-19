# History list, detail, deletion, and History Replay

Status: completed

Implementation status: completed

## Parent

`.scratch/voicereader-macos/PRD.md`

## What to build

Build the History user workflow end to end. The user can open `历史记录`, see Reading History Records grouped by time in reverse chronological order, inspect full saved text in a detail pane, copy text, delete records with confirmation, and run History Replay without creating new history or using the system-level Playback Overlay.

## Acceptance criteria

- [x] History uses a split layout with grouped list on the left and selected record detail on the right.
- [x] Groups are `今天`, `昨天`, `本周`, and `更早`, with each group sorted by `createdAt` descending.
- [x] Opening History selects the newest record by default; empty history shows an empty state.
- [x] List items show time, preview, estimated duration, and language summary without showing full text.
- [x] Detail view shows full text and supports copying the full text.
- [x] Single-record delete requires lightweight confirmation and then selects the next most recent record or shows an empty state.
- [x] History Replay plays the full saved text with current Preferred Voice, Speech Rate, and Model.
- [x] History Replay does not create a new Reading History Record, update the existing record time, or show the system-level Playback Overlay.
- [x] History Replay shows playback feedback inside the detail surface and can be stopped with Esc.
- [x] Tests cover grouping, selection, delete behavior, copy behavior, History Replay no-new-record behavior, and Esc stop.

## Blocked by

- `.scratch/voicereader-macos/issues/05-reading-history-records-and-retention-cleanup.md`

## Verification

- `npm run typecheck` passed.
- `npm run test` passed. The test verifies history list ordering, record lookup, single-record deletion, History Replay using the full saved text, History Replay not creating or updating Reading History Records, and missing-record replay skips.
- The test also asserts the renderer bundle includes the required history group labels and detail actions for `今天`, `昨天`, `本周`, `更早`, `复制全文`, and `重新播放`.
- `npm run build` passed.
- `npm run verify` passed, combining typecheck, tests, and build.

## Notes

- History Replay uses the shared playback path and renderer audio queue, but its target is marked as `History Replay` with a `history:<recordId>` URL so renderer/UI can keep feedback inside the history detail surface instead of the system Playback Overlay.
