# Run TTS Streaming in the Offscreen Document

Reader runs MiniMax streaming and audio playback inside the offscreen document while the service worker coordinates commands, tabs, and lifecycle. The browser-verifiable direct MiniMax path uses HTTP streaming because browser WebSocket clients cannot set the Bearer `Authorization` header required by MiniMax's WebSocket API; keeping streaming in the offscreen document still avoids relying on the Manifest V3 service worker for long-lived audio state and gives playback code access to browser audio APIs.
