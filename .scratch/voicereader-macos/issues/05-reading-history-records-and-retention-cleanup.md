# Reading History records and retention cleanup

Status: completed

Implementation status: completed

## Parent

`.scratch/voicereader-macos/PRD.md`

## What to build

Add local Reading History persistence for current Reading Target playback. VoiceReader should save a Reading History Record after valid Selected Text or Clipboard Text is found and before MiniMax is called, deduplicate repeated Reading Targets with the same source and text within five minutes, generate display metadata, and clean up records according to retention settings.

## Acceptance criteria

- [x] Valid Reading Target Play creates or reuses a Reading History Record before MiniMax streaming begins.
- [x] MiniMax failure after record creation does not remove or mark the Reading History Record as failed.
- [x] Replaying the same Reading Target source and text within five minutes reuses the recent record instead of creating a duplicate.
- [x] Records include full text, creation time, preview, duration estimate, language summary, and `source=selected_text | clipboard`.
- [x] Records store original full text and display metadata, not generated audio, raw MiniMax responses, or Reading Segments.
- [x] Retention options support `7 天`, `1 个月`, `3 个月`, and `永久`, defaulting to `1 个月`.
- [x] Retention cleanup runs on app startup, retention changes, and new record creation; shortening retention immediately deletes expired records.
- [x] Settings can clear all Reading History through an in-page confirmation flow.
- [x] Tests cover creation timing, failure preservation, five-minute dedupe, metadata generation, retention cleanup, and clear-all behavior.

## Blocked by

- `.scratch/voicereader-macos/issues/04-clipboard-play-path-with-shortcut-and-menu-trigger.md`

## Verification

- `npm run typecheck` passed.
- `npm run test` passed. The test verifies Reading History Record creation, metadata shape, preview generation, duration estimate, language summary, `source=selected_text | clipboard`, 5-minute deduplication, new record creation after the dedupe window, retention cleanup for `7d` and `forever`, clear-all behavior, and that no generated audio/raw MiniMax response/segments are stored in the record shape.
- Playback tests verify a valid Reading Target Play creates history before MiniMax streaming is invoked, duplicate Reading Targets reuse the recent record, and MiniMax failure after creation preserves the history record.
- `npm run build` passed.
- `npm run verify` passed, combining typecheck, tests, and build.

## Notes

- Settings now exposes retention selection, immediate cleanup, Reading History count, local privacy copy, and an in-page clear-history confirmation.
