# Preserve Favorites independently from Reading History

Status: completed

Implementation status: completed

## Parent

`.scratch/voicereader-macos/PRD.md`

## What to build

Make Favorite Records independent from ordinary Reading History lifecycle. A Favorite Record keeps the saved full text, display metadata, original reading time, and favorite time needed for future display and playback. Deleting Reading History Records, clearing Reading History, and retention cleanup must not remove Favorite Records.

## Acceptance criteria

- [x] Favorite Records preserve full text, preview, duration estimate, language summary, source, `sourceCreatedAt`, and `favoritedAt`.
- [x] Favorite Records do not depend on an existing Reading History Record to render their list item or detail view.
- [x] Deleting the source Reading History Record does not delete or break the Favorite Record.
- [x] Clearing Reading History does not delete or break Favorite Records.
- [x] Retention cleanup never deletes Favorite Records, even when the source Reading History Record would be expired.
- [x] Local privacy copy and data behavior remain consistent: Favorites store text locally and do not store generated audio.
- [x] Tests cover deleting source history, clearing history, retention cleanup, and Favorite Record content preservation.

## Blocked by

- `.scratch/voicereader-macos/issues/10-add-favorite-records-and-favorites-surface.md`

## Verification

- `npm run typecheck` passed.
- `npm run test` passed. The test verifies that Favorite Records copy all display/playback text metadata, remain listable after deleting the source Reading History Record, survive retention cleanup of expired source history, survive `clearReadingHistory`, and that the Settings privacy copy says history and favorite text stay local without generated audio.
