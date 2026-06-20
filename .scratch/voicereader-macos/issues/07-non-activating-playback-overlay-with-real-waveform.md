# Non-activating Playback Overlay with real waveform

Status: completed

## Parent

`.scratch/voicereader-macos/PRD.md`

## What to build

Add the current Reading Target Playback Overlay as a separate non-activating floating window. It should appear after valid Selected Text or Clipboard Text is accepted, show only real-amplitude waveform feedback, provide no in-overlay controls, and disappear on completion or failure. Playback is stopped through the global Esc Stop Shortcut.

## Acceptance criteria

- [x] Current Reading Target Play shows a separate Playback Overlay after valid Selected Text or Clipboard Text is found.
- [x] Overlay is fixed near the bottom center of the display containing the current mouse location and does not steal focus.
- [x] Overlay shows no text and only waveform feedback.
- [x] Waveform is driven by bounded-rate amplitude data from actual playback, not a purely decorative animation.
- [x] Raw audio bytes are not sent to the overlay and are not persisted for waveform rendering.
- [x] Overlay does not show a close button, stop button, hover progress fill, or progress text.
- [x] Esc immediately stops playback, aborts streaming, clears queued audio, and quickly fades out the overlay.
- [x] Playback completion quickly fades out the overlay.
- [x] Playback failure makes the overlay disappear and writes only non-content runtime failure data to Error Log.
- [x] History Replay never opens the system-level Playback Overlay.
- [x] Tests or visual verification cover overlay lifecycle, focus behavior, Esc stop behavior, completion fade, failure disappearance, and History Replay exclusion.

## Implementation status

Completed in this workspace. Verification: `npm run verify`.

## Blocked by

- `.scratch/voicereader-macos/issues/04-clipboard-play-path-with-shortcut-and-menu-trigger.md`
