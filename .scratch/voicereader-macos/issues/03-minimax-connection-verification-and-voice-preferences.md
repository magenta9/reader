# MiniMax connection verification and Voice preferences

Status: completed

Implementation status: completed

## Parent

`.scratch/voicereader-macos/PRD.md`

## What to build

Implement the MiniMax account and Voice setup path. Users should be able to enter their own API key, verify it safely, refresh the Voice list, see configuration state in Home/Settings, and choose Preferred Voice values by language group on Home before any playback path depends on it.

## Acceptance criteria

- [x] Settings supports entering, saving, and clearing the user-provided MiniMax API key without exposing raw key material in the renderer beyond the input flow.
- [x] API key verification calls MiniMax, loads the Voice list on success, and stores verification state for playback gating.
- [x] Verification and Voice refresh failures show safe user-facing messages in Settings without writing Error Log entries or showing raw MiniMax responses.
- [x] Cached Voice data allows playback readiness when refresh fails but a prior usable Voice list exists.
- [x] Home shows configuration state for API key verification and Voice availability.
- [x] Home lets the user switch language groups `中文 / 英文 / 日文 / 韩文 / 其他拉丁语 / 未知` and save the language-scoped Preferred Voice.
- [x] Tests cover verified/unverified/failed states, cached Voice fallback, Preferred Voice persistence, and silent playback gating when no Voice is available.

## Blocked by

- `.scratch/voicereader-macos/issues/02-local-settings-sqlite-and-minimax-key-storage.md`

## Verification

- `npm run typecheck` passed.
- `npm run test` passed. The test verifies MiniMax account setup success, verified state persistence, Voice cache persistence, Preferred Voice persistence, failed refresh fallback to cached voices, missing-key behavior, invalid-key failure behavior, and that setup/refresh failures do not write Error Log entries.
- `npm run build` passed.
- `npm run verify` passed, combining typecheck, tests, and build.

## Notes

- MiniMax verification is implemented behind a testable service with injectable `getVoices`, so live MiniMax calls are not required for normal tests.
- Renderer now exposes the account setup path, Voice refresh, cached Voice count, and language-scoped Preferred Voice selection. Full visual polish remains in the later Settings/UI polish issue.
