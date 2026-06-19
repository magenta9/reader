# PRD: VoiceReader macOS MVP

Status: ready-for-agent

Canonical PRD: `docs/prd/macos-voicereader-mvp.md`

## Problem Statement

VoiceReader is a macOS menu bar text-to-speech app. The user wants to copy text in any app, trigger playback through a global Activation Shortcut or Menu Bar Menu, see a minimal system-level Playback Overlay during current Clipboard Text playback, and review past Reading Targets in local Reading History.

The Chrome extension is historical context. New implementation work should follow the macOS Electron direction in `docs/prd/macos-voicereader-mvp.md`, ADR-0010, and ADR-0014.

## Solution

Restructure the project directly into an Electron + React + TypeScript macOS app named VoiceReader. The app keeps one Reader Window, one Menu Bar Menu, one Playback Overlay, local SQLite app data, encrypted MiniMax credentials via Electron `safeStorage`, MiniMax streaming in the Electron main process, and renderer-owned audio playback.

## User Stories

1. As a macOS user, I want to press `Cmd+Shift+R` to play the current Clipboard Text, so that I can listen without opening another app.
2. As a macOS user, I want a Menu Bar Menu `播放` action, so that I can play Clipboard Text without remembering the shortcut.
3. As a macOS user, I want Esc to stop the active Playback Session, so that I can cancel playback globally.
4. As a macOS user, I want a non-activating Playback Overlay with waveform feedback, so that I can see current Clipboard Text playback without losing focus.
5. As a macOS user, I want Reading History in reverse chronological groups, so that I can review previously spoken text.
6. As a macOS user, I want History Replay from a record detail view, so that I can replay full saved text without creating duplicate history.
7. As a macOS user, I want History retention controls, so that full text history does not live forever unless I choose that.
8. As a macOS user, I want to provide and verify my own MiniMax API key, so that playback uses my account.
9. As a macOS user, I want to choose Voice, Speech Rate, and Model, so that playback matches my preferences.
10. As a macOS user, I want Launch at Login as an opt-in setting, so that VoiceReader can be available after login.

## Implementation Decisions

- Use Electron + React + TypeScript and remove obsolete Chrome extension surfaces during migration.
- Use Chinese UI and the product name `VoiceReader`.
- Use a single Reader Window with `主页 / 历史记录 / 设置`; duplicate opens focus the same window.
- Use a Menu Bar Menu with `播放 / 打开 VoiceReader / 历史记录 / 设置 / 退出`.
- Use `Cmd+Shift+R` as the default Activation Shortcut and fixed Esc as the Stop Shortcut.
- Read Clipboard Text only on explicit Play/Activation Shortcut; never watch clipboard changes.
- Skip empty text, non-text clipboard contents, missing/unverified API key, and missing Voice silently.
- Save Reading History Records after valid Clipboard Text is found and before MiniMax is called.
- Store Reading History, settings metadata, and Error Log in local SQLite; do not encrypt SQLite.
- Store the MiniMax API key encrypted with Electron `safeStorage`, not in plaintext SQLite.
- Run MiniMax streaming in the Electron main process; stream mp3 bytes to renderer over IPC.
- Let renderer own audio playback and derive real amplitude data for the Playback Overlay waveform.
- Use a separate non-activating BrowserWindow for current Clipboard Text Playback Overlay.
- Do not show the Playback Overlay for History Replay; show replay waveform only in the history detail surface.
- Do not support pause/resume, generated audio persistence, search, export, backup, favorite/pin, or history editing in MVP.

## Testing Decisions

- Test external behavior at the highest seam available: Electron app behavior, IPC contracts, local persistence, and visible UI states.
- Unit test Clipboard Text boundaries, Reading History Record creation timing, 5-minute deduplication, retention cleanup, preview/duration/language metadata, Error Log limits, and silent skip cases.
- Integration test Play/Stop/replacement IPC, MiniMax abort behavior, overlay lifecycle, settings persistence, encrypted key storage, and History Replay behavior.
- UI verification should cover Home, History list/detail, Settings, Playback Overlay, and light/dark modes.

## Out of Scope

- Continuing Chrome extension maintenance
- Browser page extraction
- Clipboard watching or automatic playback
- Search
- Pause/resume
- Audio persistence
- SQLite encryption
- Export/backup
- Auto-update
- Code signing/notarization

## Further Notes

Use `CONTEXT.md` terms and respect all ADRs in `docs/adr/`, especially ADR-0010 through ADR-0019.
