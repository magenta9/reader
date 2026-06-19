# Store the MiniMax Key with Electron safeStorage

VoiceReader will encrypt the user-provided MiniMax API key with Electron `safeStorage` before saving it in local app configuration. This keeps the personal-key model from ADR-0001 while avoiding plaintext credentials in SQLite or ordinary settings files without adding a separate macOS Keychain integration for the MVP.
