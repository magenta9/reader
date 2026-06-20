# Add Favorite Replay with favorite detail feedback

Status: completed

Implementation status: completed

## Parent

`.scratch/voicereader-macos/PRD.md`

## What to build

Add Favorite Replay from the Favorite Record detail view. A user can replay the full saved Favorite Record text using current playback preferences. Favorite Replay must use a dedicated favorite detail feedback surface, avoid the system-level Playback Overlay, avoid creating or updating Reading History, and remain stoppable with Esc.

## Acceptance criteria

- [x] Favorite detail can start replay of the full saved Favorite Record text.
- [x] Favorite Replay uses current Preferred Voice, Speech Rate, and Model.
- [x] Favorite Replay uses a dedicated `favorite_detail` feedback surface rather than reusing `history_detail`.
- [x] Favorite Replay shows playback feedback inside the favorite detail surface and never shows the system-level Playback Overlay.
- [x] Favorite Replay does not create a new Reading History Record and does not update any source or favorite timestamps.
- [x] Esc stops active Favorite Replay through the existing Stop Shortcut behavior.
- [x] Missing or deleted Favorite Records skip gracefully without starting playback.
- [x] Tests cover replay target creation, `favorite_detail` routing, no-new-history behavior, timestamp preservation, overlay suppression, Esc stop, and missing-record skip.

## Blocked by

- `.scratch/voicereader-macos/issues/10-add-favorite-records-and-favorites-surface.md`

## Verification

- `npm run typecheck` passed.
- `npm run test` passed. The test verifies Favorite Replay target creation from saved Favorite Record text, current playback credentials and Voice use, `favorite_detail` feedback routing through service/command/lifecycle, no-new-history behavior, favorite timestamp preservation, missing-record skip behavior, Esc shortcut registration/cleanup, Electron overlay suppression, and audio queue overlay-metric suppression.
