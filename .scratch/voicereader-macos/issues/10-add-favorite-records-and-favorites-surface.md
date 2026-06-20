# Add Favorite Records and the 收藏 surface

Status: completed

Implementation status: completed

## Parent

`.scratch/voicereader-macos/PRD.md`

## What to build

Add the first end-to-end Favorites path. A user can open a Reading History Record detail, click `添加收藏`, remain on the History page with short `已添加` feedback, and then open the new `收藏` surface from the Reader Window navigation or Menu Bar Menu to see the newly created Favorite Record in a grouped list and detail view. Each favorite action creates a new Favorite Record, even when the same Reading History Record or same source text was already favorited.

## Acceptance criteria

- [x] Reader Window navigation includes `收藏`, and the Menu Bar Menu can open the Favorites surface directly.
- [x] History detail includes an `添加收藏` action that creates a new Favorite Record without navigating away from History.
- [x] Repeated clicks on `添加收藏` create repeated Favorite Records rather than showing a blocking `已收藏` state.
- [x] Favorites uses `今天`, `昨天`, `本周`, and `更早` groups based on favorite time, with records sorted newest first inside each group.
- [x] Favorite list items show favorite time, preview, estimated duration, and language summary.
- [x] Favorite detail shows the full saved text plus both favorite time and original reading time.
- [x] Empty Favorites shows `暂无收藏` and the detail hint `在历史记录详情中添加收藏后，会显示在这里。`
- [x] Tests cover adding a Favorite Record from History, duplicate favorites, navigation/menu access, grouping, sorting, default selection, and empty state behavior.

## Blocked by

- `.scratch/voicereader-macos/issues/06-history-list-detail-deletion-and-history-replay.md`

## Verification

- `npm run typecheck` passed.
- `npm run test` passed. The test verifies the Favorites route/menu labels, IPC/preload bridge methods, `favorite_records` schema, Favorite Record creation from Reading History, duplicate favorites, favorite-time ordering, and Favorites UI labels for navigation, add feedback, empty state, favorite time, and original reading time.
