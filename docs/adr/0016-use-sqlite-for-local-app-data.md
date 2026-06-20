# Use SQLite for Local App Data

VoiceReader will store local Reading History, settings metadata, Error Log entries, and the user-provided MiniMax API key in a SQLite database under the Electron app data directory. SQLite fits reverse-chronological history, retention cleanup, single-record deletion, and future local querying better than a JSON file. Generated audio remains ephemeral. The MiniMax API key is intentionally stored directly in SQLite per ADR-0017 so the app does not trigger Electron `safeStorage` or macOS Keychain prompts.
