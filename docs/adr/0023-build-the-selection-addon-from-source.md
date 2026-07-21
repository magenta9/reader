---
status: accepted
---

# Build the macOS selection addon from source

VoiceReader will build its macOS Selected Text Node-API addon from the checked-in Objective-C++ source with Xcode Command Line Tools, rather than committing a prebuilt `.node` binary or adopting Kanban's dependency-prebuild ABI recovery state machine. The addon uses Node-API and one compiled binary has been proven loadable by both the host Node runtime and Electron 41, so supported verification and packaging will compile it locally and probe the final binary under the real Electron runtime; a missing compiler toolchain or failed load probe will fail the workflow.
