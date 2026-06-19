# Use SQLite for Local App Data

VoiceReader will store local Reading History, settings metadata, and Error Log entries in a SQLite database under the Electron app data directory. SQLite fits reverse-chronological history, retention cleanup, single-record deletion, and future local querying better than a JSON file, while generated audio remains ephemeral and MiniMax API credentials should be stored separately with encryption.
