---
status: accepted
refined-by: ADR-0029
---

# Store Favorites Independently From Reading History

VoiceReader will store Favorites as independent Favorite Records created from Reading History Records, rather than as flags or references on Reading History. Each favorite action creates a separate Favorite Record with the saved text, display metadata, original reading time, and favorite time, so duplicate favorites are allowed and Favorites remain playable, copyable, and removable even after ordinary Reading History is deleted or cleaned up by retention settings.

ADR-0029 records the historical three-table to four-table migration that adds this existing Favorites schema atomically while preserving Reading History, Settings, Error Log data, and the independent Favorite Record contract.
