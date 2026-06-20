# Full Settings surface and Chinese UI polish

Status: completed

## Parent

`.scratch/voicereader-macos/PRD.md`

## What to build

Complete the Chinese Settings experience and UI polish around configuration. Settings should expose all approved groups, show safe local privacy messaging, support speech/model/history/general preferences, and keep configuration blockers visible without noisy playback-time prompts.

## Acceptance criteria

- [x] Settings is organized into `账户与连接`, `快捷键`, `朗读`, `历史记录`, and `通用`.
- [x] `账户与连接` includes API key configuration, verification state, Voice refresh, and safe verification error messaging.
- [x] `快捷键` includes Activation Shortcut recording/registration state and failure messaging without Error Log entries.
- [x] `朗读` includes Speech Rate `0.5x - 3.0x` with `0.1x` step and Model selection with built-in options plus custom model id.
- [x] Custom Model is not availability-verified on save; runtime playback failures are recorded as non-content Error Log entries.
- [x] `历史记录` includes retention selection, clear-history in-page confirmation, and privacy copy that states history is local, audio is not saved, and current text is sent to MiniMax.
- [x] `通用` includes Launch at Login, Error Log count, and Error Log clear.
- [x] Settings follows system light/dark appearance and uses Chinese user-facing labels.
- [x] Home does not show playback state and remains focused on `播放`, Voice choice, and configuration status.
- [x] Tests or UI verification cover all Settings groups, validation/silent-skip states, privacy copy presence, clear actions, and light/dark appearance.

## Implementation status

Completed in this workspace. Verification: `npm run verify`.

## Blocked by

- `.scratch/voicereader-macos/issues/02-local-settings-sqlite-and-minimax-key-storage.md`
- `.scratch/voicereader-macos/issues/03-minimax-connection-verification-and-voice-preferences.md`
- `.scratch/voicereader-macos/issues/05-reading-history-records-and-retention-cleanup.md`
