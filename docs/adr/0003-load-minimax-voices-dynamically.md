---
status: accepted
---

# Load MiniMax Voices Dynamically

Reader loads available voices from MiniMax's Get Voice API when the user's API key is valid, and falls back to bundled common voice IDs plus a custom voice ID field if the lookup fails. This keeps the popup current with MiniMax system and user voices without blocking playback on voice discovery failures.

Historical scope note: dynamic Voice discovery remains accepted. The bundled common Voice and custom Voice ID fallback described above belonged to the retired browser UI and is not part of the current macOS boundary.
