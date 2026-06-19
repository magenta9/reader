# Local settings, SQLite, and encrypted MiniMax key storage

Status: completed

Implementation status: completed

## Parent

`.scratch/voicereader-macos/PRD.md`

## What to build

Add VoiceReader's local app data foundation: SQLite-backed settings metadata, Reading History and Error Log storage primitives, encrypted MiniMax API key storage using Electron `safeStorage`, Launch at Login persistence, and IPC access from the renderer. This slice should make settings durable and observable before playback is wired.

## Acceptance criteria

- [x] VoiceReader creates and opens a SQLite database in the Electron app data area for local app data.
- [x] Settings metadata can be read and written through a typed main/renderer boundary.
- [x] MiniMax API key values are encrypted with Electron `safeStorage` before being saved and are not stored as plaintext in SQLite.
- [x] Error Log storage supports adding runtime failure entries, clearing entries, counting entries, and capping retained entries at 100.
- [x] Launch at Login and onboarding completion state are persisted and can be reflected in Settings/Home state.
- [x] Empty/non-text clipboard skips and missing API key skips are not recorded as Error Log entries.
- [x] Tests cover settings persistence, encrypted key round-trip behavior, Error Log cap/clear/count behavior, and non-content log boundaries.

## Blocked by

- `.scratch/voicereader-macos/issues/01-electron-voicereader-shell-and-navigation.md`

## Verification

- `npm run typecheck` passed.
- `npm run test` passed. The test builds the app and verifies SQLite database creation, required tables, settings persistence, encrypted MiniMax API key round-trip through an injected cipher, absence of plaintext API key in settings storage, Error Log add/count/list/clear behavior, the 100-entry Error Log cap, and skip events not being recorded.
- `npm run build` passed.
- `npm run verify` passed, combining typecheck, tests, and build.

## Notes

- SQLite uses Node/Electron `node:sqlite`, avoiding a native package install while shell network access is unavailable.
- The production MiniMax key cipher is Electron `safeStorage`; tests inject a deterministic cipher so encryption behavior can be verified without a GUI Electron session.
