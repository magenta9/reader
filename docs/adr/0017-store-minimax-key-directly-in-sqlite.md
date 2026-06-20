# Store the MiniMax Key Directly in SQLite

VoiceReader stores the user-provided MiniMax API key directly in the local SQLite settings table. The app intentionally does not call Electron `safeStorage` or macOS Keychain for this credential, because the product should not show Keychain access prompts during setup, launch, playback, voice refresh, or verification.

This prioritizes local UX predictability over local-at-rest credential protection. The SQLite database is still located in Electron app data, but it is not encrypted.
