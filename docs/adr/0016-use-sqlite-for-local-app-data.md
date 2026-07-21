---
status: accepted
refined-by: ADR-0029
---

# Use SQLite for Local App Data

VoiceReader will store local Reading History, settings metadata, Error Log entries, and the user-provided MiniMax API key in a SQLite database under the Electron app data directory. SQLite fits reverse-chronological history, retention cleanup, single-record deletion, and future local querying better than a JSON file. Generated audio remains ephemeral. The MiniMax API key is intentionally stored directly in SQLite per ADR-0017 so the app does not trigger Electron `safeStorage` or macOS Keychain prompts.

ADR-0029 assigns database opening, exact schema validation, known historical migration, atomic version writes, fail-closed behavior, and connection cleanup to the versioned `AppDataStore.open(path)` lifecycle. Reading History retention runs only after that lifecycle commits.
