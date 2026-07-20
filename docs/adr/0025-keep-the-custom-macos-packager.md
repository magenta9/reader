---
status: accepted
---

# Keep the custom macOS packager

VoiceReader will retain its checked-in macOS application packaging script and add DMG creation with the system `hdiutil`, rather than introducing `electron-builder`. The current packager already owns and tests VoiceReader's bundle layout, icon generation, Info.plist and helper identifiers, native-addon placement, ad-hoc signing, and signature verification; changing packagers during the Bun migration would create an unrelated packaging-boundary migration and an additional trusted dependency. Kanban remains the reference for release behavior and safety gates, not for the mechanism that assembles the application.
