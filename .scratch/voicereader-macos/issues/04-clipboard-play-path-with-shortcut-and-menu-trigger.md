# Reading Target Play path with shortcut and menu trigger

Status: completed

Implementation status: completed

## Parent

`.scratch/voicereader-macos/PRD.md`

## What to build

Deliver the first complete Reading Target playback path. The user can trigger Play from `Control+Command+R`, the Menu Bar Menu, or Home; VoiceReader reads current Selected Text first and falls back to Clipboard Text when no Selected Text is available, builds a Reading Target, gates configuration silently, streams MiniMax audio from the main process, plays in the renderer, and supports Esc/new Play cancellation.

## Acceptance criteria

- [x] Default Activation Shortcut is `Control+Command+R` and can trigger Play globally when registered.
- [x] Stop Shortcut is fixed to Esc and is globally active only during an active Playback Session.
- [x] Menu Bar Menu `播放` and Home `播放` trigger the same Reading Target Play behavior.
- [x] Empty Selected Text, empty clipboard text, non-text clipboard contents, missing/unverified API key, and missing Voice are skipped silently without Overlay or Error Log entries.
- [x] Valid Selected Text or Clipboard Text is converted into a Reading Target, segmented, language-detected, and routed through current Voice, Speech Rate, and Model settings.
- [x] MiniMax streaming runs in the Electron main process and streams mp3 bytes to the playback renderer without persisting generated audio.
- [x] New Play replaces the current Playback Session, aborts active MiniMax streaming, clears queued audio, and starts from the latest Reading Target.
- [x] Esc stops the active Playback Session, aborts streaming, clears queued audio, and does not write Error Log or alter history.
- [x] Tests cover clipboard boundaries, config gating, shortcut/menu/Home trigger parity, replacement behavior, abort behavior, and playback error logging boundaries.

## Blocked by

- `.scratch/voicereader-macos/issues/03-minimax-connection-verification-and-voice-preferences.md`

## Verification

- `npm run typecheck` passed.
- `npm run test` passed. The test verifies Selected Text / Clipboard Text normalization into Reading Targets, successful MiniMax streaming through the main-process PlaybackService, mp3 hex to byte forwarding, renderer-facing sink session events, config-gated silent skips, runtime MiniMax failure Error Log behavior, and new Play replacement aborting the prior stream.
- `npm run build` passed.
- `npm run verify` passed, combining typecheck, tests, and build.

## Notes

- The Menu Bar Menu `播放`, Home `播放`, and global Activation Shortcut are wired to the same main-process playback path.
- Esc is registered only while a Playback Session is active and stops playback through the same service path.
- Actual audible playback is implemented in the renderer with an HTMLAudioElement queue fed by IPC mp3 chunks; GUI/audio runtime verification still needs to be repeated when the app can be opened normally.
