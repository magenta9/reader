# PRD: VoiceReader macOS MVP

Status: ready-for-agent

Canonical PRD: `docs/prd/macos-voicereader-mvp.md`

## Problem Statement

VoiceReader is a macOS menu bar text-to-speech app. The user wants to select or copy text in any app, trigger playback through a global Activation Shortcut or Menu Bar Menu, see a minimal system-level Playback Overlay during current Reading Target playback, and review past Reading Targets in local Reading History.

The Chrome extension is historical context. New implementation work should follow the macOS Electron direction in `docs/prd/macos-voicereader-mvp.md`, ADR-0010, ADR-0014, and ADR-0020.

## Solution

Restructure the project directly into an Electron + React + TypeScript macOS app named VoiceReader. The app keeps one Reader Window, one Menu Bar Menu, one Playback Overlay, local SQLite app data, a MiniMax API key stored directly in SQLite, MiniMax streaming in the Electron main process, and renderer-owned audio playback.

## User Stories

1. As a macOS user, I want to press `Control+Command+R` to play current Selected Text, or Clipboard Text when no Selected Text is available, so that I can listen without opening another app.
2. As a macOS user, I want a Menu Bar Menu `播放` action, so that I can play the current Reading Target without remembering the shortcut.
3. As a macOS user, I want Esc to stop the active Playback Session, so that I can cancel playback globally.
4. As a macOS user, I want a non-activating Playback Overlay with waveform feedback, so that I can see current Reading Target playback without losing focus.
5. As a macOS user, I want Reading History in reverse chronological groups, so that I can review previously spoken text.
6. As a macOS user, I want History Replay from a record detail view, so that I can replay full saved text without creating duplicate history.
7. As a macOS user, I want History retention controls, so that full text history does not live forever unless I choose that.
8. As a macOS user, I want to provide and verify my own MiniMax API key, so that playback uses my account.
9. As a macOS user, I want to choose Voice, Speech Rate, and Model, so that playback matches my preferences.
10. As a macOS user, I want Launch at Login as an opt-in setting, so that VoiceReader can be available after login.
11. As a macOS user, I want to add Reading History Records to Favorites, so that important text remains available outside ordinary history retention.
12. As a macOS user, I want to view, replay, copy, and delete Favorite Records, so that I can maintain saved text separately from Reading History.

## Implementation Decisions

- Use Electron + React + TypeScript and remove obsolete Chrome extension surfaces during migration.
- Use Chinese UI and the product name `VoiceReader`.
- Use a single Reader Window with `主页 / 历史记录 / 收藏 / 设置`; duplicate opens focus the same window.
- Use a Menu Bar Menu with `播放 / 打开 VoiceReader / 历史记录 / 收藏 / 设置 / 退出`.
- Use `Control+Command+R` as the default Activation Shortcut and fixed Esc as the Stop Shortcut.
- Read Selected Text first on explicit Play/Activation Shortcut, then fall back to Clipboard Text when no Selected Text is available; never watch clipboard changes.
- Skip empty Selected Text, empty/non-text clipboard contents, missing/unverified API key, and missing Voice silently.
- Save Reading History Records after a valid Reading Target is found and before MiniMax is called.
- Store Reading History, Favorites, settings metadata, Error Log, and the MiniMax API key in local SQLite; do not encrypt SQLite.
- Do not use Electron `safeStorage` or macOS Keychain for the MiniMax API key, avoiding keychain prompts.
- Run MiniMax streaming in the Electron main process; stream mp3 bytes to renderer over IPC.
- Let renderer own audio playback and derive real amplitude data for the Playback Overlay waveform.
- Use a separate non-activating BrowserWindow for current Reading Target Playback Overlay on the display containing the current mouse location.
- Do not show the Playback Overlay for History Replay; show replay waveform only in the history detail surface.
- Store Favorites as independent Favorite Records created from Reading History Records, not as flags or references on Reading History.
- Do not show the Playback Overlay for Favorite Replay; show replay waveform only in the favorite detail surface.
- Do not support pause/resume, generated audio persistence, search, export, backup, favorite editing, or history editing in MVP.

## Testing Decisions

- Test external behavior at the highest seam available: Electron app behavior, IPC contracts, local persistence, and visible UI states.
- Unit test Selected Text and Clipboard Text boundaries, Reading History Record creation timing, 5-minute deduplication, retention cleanup, preview/duration/language metadata, Error Log limits, and silent skip cases.
- Integration test Play/Stop/replacement IPC, MiniMax abort behavior, overlay lifecycle, settings persistence, SQLite key storage, History Replay behavior, and Favorite Replay behavior.
- UI verification should cover Home, History list/detail, Favorites list/detail, Settings, Playback Overlay, and light/dark modes.

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
