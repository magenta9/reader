---
status: accepted
refined-by: ADR-0026, ADR-0027
---

# Run MiniMax Streaming in the Electron Main Process

VoiceReader will run MiniMax streaming requests in the Electron main process, where the locally stored API key can be read from SQLite, requests can be cancelled, and non-content errors can be logged. The main process streams validated MP3 byte chunks to the renderer over IPC, while the renderer owns audio playback and UI rendering so plaintext credentials do not need to enter the renderer. ADR-0027 assigns MiniMax JSON/SSE envelopes, hex decoding, malformed payload rejection, and the at-least-one-chunk guarantee to the production MiniMax adapter.

ADR-0026 refines the lifecycle boundary: generation completion seals the audio queue, while the Playback Renderer reports the real audio-output outcome and the main process owns the Playback Session terminal state.
