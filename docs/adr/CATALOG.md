# Architecture Decision Record Catalog

> Generated from ADR frontmatter. Do not edit manually.

| ADR | Title | Status | Relations |
| --- | --- | --- | --- |
| [ADR-0001](0001-use-user-provided-minimax-keys.md) | Use User-Provided MiniMax Keys | accepted | refined-by: [ADR-0010](0010-shift-primary-product-to-macos-app.md), [ADR-0017](0017-store-minimax-key-directly-in-sqlite.md), [ADR-0018](0018-run-minimax-streaming-in-electron-main.md) |
| [ADR-0002](0002-use-popup-and-options-without-side-panel.md) | Use Popup and Options Without a Side Panel | historical | — |
| [ADR-0003](0003-load-minimax-voices-dynamically.md) | Load MiniMax Voices Dynamically | accepted | — |
| [ADR-0004](0004-request-persistent-page-access.md) | Request Persistent Page Access | historical | — |
| [ADR-0005](0005-do-not-persist-reading-content.md) | Do Not Persist Reading Content | partially-superseded | partially-superseded-by: [ADR-0009](0009-save-local-reading-history-without-audio.md) |
| [ADR-0006](0006-use-typescript-browser-native-ui.md) | Use TypeScript and Browser-Native UI | historical | — |
| [ADR-0007](0007-run-tts-streaming-in-offscreen-document.md) | Run TTS Streaming in the Offscreen Document | superseded | superseded-by: [ADR-0018](0018-run-minimax-streaming-in-electron-main.md) |
| [ADR-0008](0008-use-electron-for-macos-menu-bar-app.md) | Use Electron for the macOS Menu Bar App | accepted | — |
| [ADR-0009](0009-save-local-reading-history-without-audio.md) | Save Local Reading History Without Audio | accepted | — |
| [ADR-0010](0010-shift-primary-product-to-macos-app.md) | Shift Primary Product to macOS App | accepted | — |
| [ADR-0011](0011-use-non-activating-playback-overlay.md) | Use a Non-Activating Playback Overlay | accepted | — |
| [ADR-0012](0012-use-chinese-ui-for-macos-app.md) | Use Chinese UI for the macOS App | accepted | — |
| [ADR-0013](0013-name-the-macos-app-voicereader.md) | Name the macOS App VoiceReader | accepted | refined-by: [ADR-0035](0035-let-release-identity-own-macos-artifact-identity.md) |
| [ADR-0014](0014-restructure-directly-to-electron.md) | Restructure Directly to Electron | accepted | — |
| [ADR-0015](0015-use-react-typescript-for-electron-ui.md) | Use React and TypeScript for the Electron UI | accepted | — |
| [ADR-0016](0016-use-sqlite-for-local-app-data.md) | Use SQLite for Local App Data | accepted | refined-by: [ADR-0029](0029-version-the-sqlite-app-data-schema-atomically.md) |
| [ADR-0017](0017-store-minimax-key-directly-in-sqlite.md) | Store the MiniMax Key Directly in SQLite | accepted | refined-by: [ADR-0029](0029-version-the-sqlite-app-data-schema-atomically.md) |
| [ADR-0018](0018-run-minimax-streaming-in-electron-main.md) | Run MiniMax Streaming in the Electron Main Process | accepted | refined-by: [ADR-0026](0026-let-main-own-playback-session-terminal-state.md), [ADR-0027](0027-let-minimax-adapter-own-validated-audio-bytes.md) |
| [ADR-0019](0019-drive-overlay-waveform-from-audio-amplitude.md) | Drive the Overlay Waveform from Audio Amplitude | accepted | refined-by: [ADR-0026](0026-let-main-own-playback-session-terminal-state.md) |
| [ADR-0020](0020-store-favorites-independently-from-reading-history.md) | Store Favorites Independently From Reading History | accepted | refined-by: [ADR-0029](0029-version-the-sqlite-app-data-schema-atomically.md) |
| [ADR-0021](0021-split-vitest-source-tests-from-dist-contract-tests.md) | Split Vitest Source Tests From Dist Contract Tests | accepted | partially-superseded-by: [ADR-0036](0036-let-reading-target-acquisition-own-trigger-preparation.md); refined-by: [ADR-0032](0032-make-the-build-product-the-verifier-boundary.md) |
| [ADR-0022](0022-use-bun-tooling-while-retaining-electron-runtime.md) | Use Bun tooling while retaining the Electron runtime | accepted | — |
| [ADR-0023](0023-build-the-selection-addon-from-source.md) | Build the macOS selection addon from source | accepted | — |
| [ADR-0024](0024-require-a-verified-local-macos-release-chain.md) | Require a verified local macOS release chain | accepted | refined-by: [ADR-0029](0029-version-the-sqlite-app-data-schema-atomically.md) |
| [ADR-0025](0025-keep-the-custom-macos-packager.md) | Keep the custom macOS packager | accepted | — |
| [ADR-0026](0026-let-main-own-playback-session-terminal-state.md) | Let the Main Process Own Playback Session Terminal State | accepted | — |
| [ADR-0027](0027-let-minimax-adapter-own-validated-audio-bytes.md) | Let the MiniMax Adapter Own Validated Audio Bytes | accepted | — |
| [ADR-0028](0028-use-semantic-commands-for-renderer-settings-writes.md) | Use Semantic Commands for Renderer Settings Writes | accepted | — |
| [ADR-0029](0029-version-the-sqlite-app-data-schema-atomically.md) | Version the SQLite App Data Schema Atomically | accepted | — |
| [ADR-0030](0030-use-role-scoped-executable-bridge-contracts.md) | Use Role-scoped Executable Bridge Contracts | accepted | partially-superseded-by: [ADR-0036](0036-let-reading-target-acquisition-own-trigger-preparation.md) |
| [ADR-0031](0031-let-reader-app-shell-own-window-and-navigation-lifecycle.md) | Let Reader App Shell Own Window and Navigation Lifecycle | accepted | partially-superseded-by: [ADR-0036](0036-let-reading-target-acquisition-own-trigger-preparation.md) |
| [ADR-0032](0032-make-the-build-product-the-verifier-boundary.md) | Make the Build Product the Verifier Boundary | accepted | — |
| [ADR-0033](0033-let-settings-workspace-own-renderer-settings-workflow.md) | Let Settings Workspace Own the Renderer Settings Workflow | accepted | — |
| [ADR-0034](0034-let-home-workspace-own-renderer-home-workflow.md) | Let Home Workspace Own the Renderer Home Workflow | accepted | — |
| [ADR-0035](0035-let-release-identity-own-macos-artifact-identity.md) | Let Release Identity Own macOS Artifact Identity | accepted | — |
| [ADR-0036](0036-let-reading-target-acquisition-own-trigger-preparation.md) | Let Reading Target Acquisition Own Trigger Preparation | accepted | — |
| [ADR-0037](0037-let-adr-frontmatter-own-decision-status-and-relationships.md) | Let ADR Frontmatter Own Decision Status and Relationships | accepted | — |
