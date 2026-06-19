# Use Electron for the macOS Menu Bar App

Reader's macOS menu bar app will use Electron rather than a pure Swift/AppKit app or Tauri. Electron lets the desktop app reuse the existing TypeScript reading, segmentation, language detection, voice selection, MiniMax, and settings logic while adding macOS clipboard access, a global shortcut, menu bar entry, and desktop audio playback as a thin native shell.
