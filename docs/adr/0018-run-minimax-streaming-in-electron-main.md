# Run MiniMax Streaming in the Electron Main Process

VoiceReader will run MiniMax streaming requests in the Electron main process, where the locally stored API key can be read from SQLite, requests can be cancelled, and non-content errors can be logged. The main process streams generated audio chunks to the renderer over IPC, while the renderer owns audio playback and UI rendering so plaintext credentials do not need to enter the renderer.
