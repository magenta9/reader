# Non-activating Playback Overlay with real waveform

Status: completed

## Parent

`.scratch/voicereader-macos/PRD.md`

## What to build

Add the current Clipboard Text Playback Overlay as a separate non-activating floating window. It should appear after valid Clipboard Text is accepted, show only real-amplitude waveform feedback and a close control, support hover progress, stop playback through `×`, and disappear on completion or failure.

## Acceptance criteria

- [x] Current Clipboard Text Play shows a separate Playback Overlay after valid Clipboard Text is found.
- [x] Overlay is fixed near the bottom center of the primary display and does not steal focus.
- [x] Overlay shows no text, only waveform feedback and an always-visible `×`.
- [x] Waveform is driven by bounded-rate amplitude data from actual playback, not a purely decorative animation.
- [x] Raw audio bytes are not sent to the overlay and are not persisted for waveform rendering.
- [x] Hovering the overlay reveals a capsule-style approximate progress fill without progress text.
- [x] Clicking `×` immediately stops playback, aborts streaming, clears queued audio, and quickly fades out the overlay.
- [x] Playback completion fills or resolves approximate progress, then quickly fades out.
- [x] Playback failure makes the overlay disappear and writes only non-content runtime failure data to Error Log.
- [x] History Replay never opens the system-level Playback Overlay.
- [x] Tests or visual verification cover overlay lifecycle, focus behavior, stop behavior, hover progress, completion fade, failure disappearance, and History Replay exclusion.

## Implementation status

Completed in this workspace. Verification: `npm run verify`.

## Blocked by

- `.scratch/voicereader-macos/issues/04-clipboard-play-path-with-shortcut-and-menu-trigger.md`
