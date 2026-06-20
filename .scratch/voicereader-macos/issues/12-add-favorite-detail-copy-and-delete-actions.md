# Add Favorite detail copy and delete actions

Status: completed

Implementation status: completed

## Parent

`.scratch/voicereader-macos/PRD.md`

## What to build

Complete basic Favorite detail maintenance. A user can copy the full text from a Favorite Record and delete the currently selected Favorite Record immediately. Favorite Records are not editable, do not support partial playback, do not show count badges or Settings counts, and Favorites does not provide a clear-all action.

## Acceptance criteria

- [x] Favorite detail includes a copy action that copies only the saved full text, not favorite time or original reading time.
- [x] Favorite detail includes a `删除` action that immediately deletes only the selected Favorite Record without a second confirmation step.
- [x] Deleting a Favorite Record selects the next older Favorite Record when available, otherwise the next newer Favorite Record, otherwise the empty state.
- [x] Deleting one Favorite Record does not delete other Favorite Records with the same source and text.
- [x] Favorites does not expose editing, partial playback, clear-all, count badges, or Settings count display.
- [x] Tests cover copy behavior, immediate delete behavior, post-delete selection, duplicate preservation, and absence of unsupported controls.

## Blocked by

- `.scratch/voicereader-macos/issues/10-add-favorite-records-and-favorites-surface.md`

## Verification

- `npm run typecheck` passed.
- `npm run test` passed. The test verifies the delete-favorite IPC/preload bridge, immediate deletion of only the selected Favorite Record, preservation of duplicate Favorite Records, Favorite detail copy/delete source behavior, post-delete adjacent selection logic, and absence of clear-favorites/count-display controls.
