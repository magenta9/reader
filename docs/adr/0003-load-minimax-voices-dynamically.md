# Load MiniMax Voices Dynamically

Reader loads available voices from MiniMax's Get Voice API when the user's API key is valid, and falls back to bundled common voice IDs plus a custom voice ID field if the lookup fails. This keeps the popup current with MiniMax system and user voices without blocking playback on voice discovery failures.
