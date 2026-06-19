# Clipboard Play path with shortcut and menu trigger

Status: completed

Implementation status: completed

## Parent

`.scratch/voicereader-macos/PRD.md`

## What to build

Deliver the first complete Clipboard Text playback path. The user can trigger Play from `Cmd+Shift+R`, the Menu Bar Menu, or Home; VoiceReader reads current Clipboard Text only at that explicit moment, builds a Reading Target, gates configuration silently, streams MiniMax audio from the main process, plays in the renderer, and supports Esc/new Play cancellation.

## Acceptance criteria

- [x] Default Activation Shortcut is `Cmd+Shift+R` and can trigger Play globally when registered.
- [x] Stop Shortcut is fixed to Esc and is globally active only during an active Playback Session.
- [x] Menu Bar Menu `播放` and Home `Play Clipboard` trigger the same Clipboard Text Play behavior.
- [x] Empty clipboard text, non-text clipboard contents, missing/unverified API key, and missing Voice are skipped silently without Overlay or Error Log entries.
- [x] Valid Clipboard Text is converted into a Reading Target, segmented, language-detected, and routed through current Voice, Speech Rate, and Model settings.
- [x] MiniMax streaming runs in the Electron main process and streams mp3 bytes to the playback renderer without persisting generated audio.
- [x] New Play replaces the current Playback Session, aborts active MiniMax streaming, clears queued audio, and starts from the latest Clipboard Text.
- [x] Esc stops the active Playback Session, aborts streaming, clears queued audio, and does not write Error Log or alter history.
- [x] Tests cover clipboard boundaries, config gating, shortcut/menu/Home trigger parity, replacement behavior, abort behavior, and playback error logging boundaries.

## Blocked by

- `.scratch/voicereader-macos/issues/03-minimax-connection-verification-and-voice-preferences.md`

## Verification

- `npm run typecheck` passed.
- `npm run test` passed. The test verifies Clipboard Text normalization into a clipboard Reading Target, successful MiniMax streaming through the main-process PlaybackService, mp3 hex to byte forwarding, renderer-facing sink session events, config-gated silent skips, runtime MiniMax failure Error Log behavior, and new Play replacement aborting the prior stream.
- `npm run build` passed.
- `npm run verify` passed, combining typecheck, tests, and build.

## Notes

- The Menu Bar Menu `播放`, Home `Play Clipboard`, and global Activation Shortcut are wired to the same main-process playback path.
- Esc is registered only while a Playback Session is active and stops playback through the same service path.
- Actual audible playback is implemented in the renderer with an HTMLAudioElement queue fed by IPC mp3 chunks; GUI/audio runtime verification still needs to be repeated when the app can be opened normally.
