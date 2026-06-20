# VoiceReader branding, icons, packaging, and verification

Status: completed

## Parent

`.scratch/voicereader-macos/PRD.md`

## What to build

Finish the VoiceReader macOS MVP as a packaged local app. Add the approved product naming and icon treatment, verify the app can be packaged and launched locally, and run focused tests and UI checks that cover the complete MVP across Home, History, Settings, current Reading Target playback, History Replay, and Overlay behavior.

## Acceptance criteria

- [x] User-facing app name, window title, menu labels, and packaging name use `VoiceReader`.
- [x] Dock/app icon uses a sound-focused colored design; Menu Bar icon uses a single-color template icon.
- [x] No playback start/end sound is added.
- [x] The app packages into a local macOS app suitable for self-use without requiring code signing, notarization, auto-update, or distribution setup.
- [x] Packaged app launches and preserves the expected menu bar, Dock, window, and hide-on-close behavior.
- [x] Verification covers first launch, completed onboarding launch, Activation Shortcut, Menu Bar Play, Esc stop, Overlay stop, History Replay, retention cleanup, and Settings persistence.
- [x] UI verification covers Home, History list/detail, Settings, Playback Overlay, and light/dark appearances.
- [x] Obsolete extension artifacts are not part of the final primary app workflow.
- [x] The final implementation remains aligned with `CONTEXT.md`, the macOS PRD, and ADR-0010 through ADR-0019.

## Implementation status

Completed in this workspace. Verification: `npm run verify`, `npm run package:mac`, `ELECTRON_RUN_AS_NODE=1 release/mac/VoiceReader.app/Contents/MacOS/VoiceReader -e "console.log(process.versions.electron)"`, and `open -n -W release/mac/VoiceReader.app` followed by terminating the validation process.

## Blocked by

- `.scratch/voicereader-macos/issues/01-electron-voicereader-shell-and-navigation.md`
- `.scratch/voicereader-macos/issues/07-non-activating-playback-overlay-with-real-waveform.md`
- `.scratch/voicereader-macos/issues/08-full-settings-surface-and-chinese-ui-polish.md`
