---
status: accepted
---

# Use Semantic Commands for Renderer Settings Writes

VoiceReader will not expose a generic `Partial<AppSettings>` write operation to the Reader Window. The Reader Window bridge expresses only the settings actions the UI can actually perform: `setSpeechRate`, `setModel`, `setLaunchAtLogin`, `setActivationShortcut`, MiniMax account and Preferred Voice commands, and the preview/apply Reading History retention workflow.

Electron main owns the invariant and side-effect boundary for each command. Playback Preferences owns the renderer-callable Speech Rate and Model capabilities plus Model input handling, while AppDataStore continues to own persistent Settings normalization such as the Speech Rate range; Launch at Login coordinates Electron login-item state; Playback Commands validates and registers the global shortcut; MiniMax Account owns verification status, errors and Voice cache; Reading History retention remains an explicit destructive workflow. A renderer therefore cannot forge main-owned recovery or cache state by submitting an arbitrary settings object.

`AppDataStore` may continue to use partial settings updates as an internal persistence mechanism. This decision changes the cross-process capability contract, not the SQLite settings key, serialized JSON shape, UI, or existing valid setting behavior. Tests verify command behavior through the public bridge and production preload artifact rather than preserving a compatibility alias for the generic patch. Rollback is source-only and does not require a data migration.

These commands are now endpoints of the Reader Window executable role contract. Their method/channel/type mapping is declared once and drives both preload invocation and main registration; each main implementation still delegates validation and side effects to its existing owner. Adding a setting write therefore requires a named Reader endpoint and behavior test, not a new hand-written preload/main pair.
