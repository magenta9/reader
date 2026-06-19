# Restructure Directly to Electron

VoiceReader will be restructured directly into an Electron macOS app rather than maintaining both the Chrome extension and desktop app as first-class targets. The migration should reuse portable TypeScript reading, segmentation, language detection, Voice, MiniMax, and settings logic where practical, but Chrome Manifest V3 build output and browser page extraction are no longer required product surfaces.
