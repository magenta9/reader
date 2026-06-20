# VoiceReader

VoiceReader is a macOS voice reader for user-chosen text. It focuses on turning explicit Selected Text or Clipboard Text Reading Targets into spoken audio.

## Language

**Selected Text**:
The non-empty plain text currently selected in the frontmost macOS app when the user explicitly asks VoiceReader to read. If selection capture is unavailable or empty, Selected Text is skipped and VoiceReader may fall back to Clipboard Text.
_Avoid_: Highlighted text, current selection, selected content

**Clipboard Text**:
The non-empty plain text currently available from the user's clipboard when the user explicitly asks VoiceReader to read and no Selected Text is available. Empty or non-text clipboard contents are skipped and are not Reading Targets.
_Avoid_: Copied text, pasteboard content, current text

**Reading Target**:
The text chosen for playback after an explicit user action. In the macOS app, Reading Targets come from Selected Text when available, otherwise Clipboard Text.
_Avoid_: Playback source, input text, content

**Reading History**:
The local list of past Reading Targets that VoiceReader saves so the user can review previously spoken text in reverse chronological order. Reading History preserves full text and metadata, but not generated audio; the user controls how long records are retained.
_Avoid_: Playback log, audio history, recent items

**Reading History Record**:
A saved Reading History entry for one Reading Target. It is created after Play finds valid Selected Text or Clipboard Text and before VoiceReader calls MiniMax for speech generation. It includes the full text, creation time, preview text, estimated duration, detected language summary, and Reading Target source, but not generated audio or raw MiniMax responses. Replaying a Reading History Record plays the full saved text. Replaying the same Reading Target source and text within five minutes reuses the recent record instead of creating a duplicate.
_Avoid_: History item, transcript, saved playback

**Favorite Record**:
A user-saved entry created from a Reading History Record and then maintained independently from Reading History. Each favorite action creates a new Favorite Record, even when another Favorite Record already has the same Reading Target source and text. A Favorite Record keeps both when it was favorited and when its source Reading History Record was created. Favorite Records remain available when ordinary Reading History is automatically cleaned up or deleted, until the user removes that individual Favorite Record from Favorites.
_Avoid_: Bookmarked item, pinned history, permanent record

**Favorites**:
The local collection of Favorite Records that the user keeps separately from ordinary Reading History. Favorites are ordered by the time each Favorite Record was created.
_Avoid_: Bookmarks, pinned list, permanent history

**Favorite Replay**:
A Playback Session started from a Favorite Record. Favorite Replay plays the full saved text, does not create a new Reading History Record, remains available even when the source Reading History Record no longer exists, and shows playback feedback inside the favorite detail surface rather than the system-level Playback Overlay.
_Avoid_: Favorite playback, bookmarked replay, saved replay

**History Replay**:
A Playback Session started from a Reading History Record. History Replay plays the full saved text with current playback preferences, does not create a new Reading History Record, and shows playback feedback inside the history detail surface rather than the system-level Playback Overlay.
_Avoid_: History playback, replay item, restored session

**Feedback Surface**:
The named UI surface that receives playback activity, approximate progress, and completion feedback for a Playback Session. Current Reading Target playback uses the Playback Overlay feedback surface; History Replay uses the history detail feedback surface; Favorite Replay uses the favorite detail feedback surface.
_Avoid_: Output target, display mode, status destination

**Activation Shortcut**:
The user-configured keyboard shortcut that explicitly asks VoiceReader to start Reading Target playback from anywhere on macOS. VoiceReader first tries Selected Text from the frontmost app, then falls back to Clipboard Text when no Selected Text is available. VoiceReader provides a default Activation Shortcut, but the user can change it when it conflicts with another app or system shortcut.
_Avoid_: Hotkey, keyboard command, trigger key

**Stop Shortcut**:
The Escape key while a Playback Session is active; it is globally active only during playback and explicitly asks VoiceReader to stop current playback without starting a new Reading Target.
_Avoid_: Toggle key, cancel key, pause key

**Reader Window**:
The main macOS window for VoiceReader. It contains Home, History, Favorites, and Settings surfaces for Reading Target playback status, Reading History, saved Favorite Records, and user configuration.
_Avoid_: Main screen, dashboard, control panel

**Menu Bar Menu**:
The menu opened from VoiceReader's macOS menu bar icon. It contains high-frequency actions such as Play, opening the Reader Window, opening Settings, and quitting VoiceReader.
_Avoid_: Tray menu, popup, dropdown

**Playback Overlay**:
A small system-level floating window that appears while the current Reading Target is preparing or playing. It stays outside the Reader Window, defaults near the bottom center of the display containing the current mouse location, can be long-pressed and dragged during the current Playback Session to avoid covering content, shows only a waveform-style playback animation, reveals approximate progress on hover, provides no in-overlay controls, and disappears when playback ends or fails. History Replay and Favorite Replay do not use the Playback Overlay.
_Avoid_: Notification, toast, in-window capsule

**Error Log**:
The local non-content record of VoiceReader runtime failures. Error Log entries help diagnose playback problems, but do not include empty Selected Text skips, empty or non-text clipboard skips, missing API key skips, Selected Text, Clipboard Text, Reading Targets, generated audio, or raw MiniMax responses. Settings may show the number of Error Log entries, but not detailed diagnostics.
_Avoid_: Failure history, debug transcript, crash history

**Reading Segment**:
A contiguous part of a Reading Target prepared for speech generation and playback. Each Reading Segment has its own detected language for Voice selection.
_Avoid_: Chunk, batch, request body

**Detected Language**:
The coarse language classification assigned to a Reading Segment for Voice selection.
_Avoid_: Locale, translation language, browser language

**Playback Session**:
A single active attempt to turn a Reading Target into spoken audio. VoiceReader only has one Playback Session at a time; starting a new one replaces the current one. Playback Sessions can be started or stopped, but not paused or resumed; replaying starts from the beginning.
_Avoid_: Audio job, task, stream

**Speech Rate**:
The speed at which spoken audio is played.
_Avoid_: Tempo, acceleration, playback multiplier

**Voice**:
A speaker identity used for spoken audio. Voice selection is language-scoped: a Reading Segment uses the user's Preferred Voice for its detected language when one exists, otherwise it uses that language's Default Voice.
_Avoid_: Character, narrator, sound

**Default Voice**:
The first available Voice for a language from the current MiniMax voice list.
_Avoid_: Built-in voice, fallback voice, system voice

**Preferred Voice**:
The user's chosen Voice for a language.
_Avoid_: Selected voice, custom voice, active voice
