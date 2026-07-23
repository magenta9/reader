---
status: accepted
---

# Let Record Workspace Own the Renderer Record Workflow

VoiceReader will place the Reader Window's History and Favorites visit workflows behind one route-scoped Record Workspace. Two narrow kind adapters preserve the different list, replay, deletion, undo and add-to-Favorites capabilities, while the shared workspace owns authoritative Record loading, reverse-chronological grouping, default and adjacent selection, detail Replay, copy, deletion, visit feedback, command single-flight and immutable presentation snapshots. React renders the snapshot, converts DOM actions to semantic intents and applies focus requests; it does not coordinate bridge promises or keep a second workflow state machine.

Entering either route selects its newest Record. Selecting the active Record is idempotent and does not collapse its detail. Deletion is immediate for both kinds and exposes the existing 10-second App-level undo action: the workspace prefers the adjacent older Record, falls back to the newer neighbor, and focuses the empty state when none remain. Undo restores the original Record and selection when the same visit is active. The App keeps the latest undo available across navigation without taking ownership of the Record workflow or forcing a return to the originating route.

Each route visit has its own generation. Leaving History or Favorites disposes the workspace, clears visit-scoped presentation and prevents late reads or commands from updating or unlocking a later visit; accepted main-process mutations are not rolled back. Detail Replay is stopped before selection or deletion can leave its owning detail, and only the matching Playback Session terminal event clears active Replay presentation. Main remains authoritative for Playback Sessions, persistence, deletion tokens and Favorite Record creation under ADR-0026, ADR-0009 and ADR-0020.

The highest test seam is the Record Workspace interface with a fake Reader Window capability adapter. It covers both kind adapters, grouping, selection, deletion/undo, command ordering and visit invalidation; Reader Window DOM tests retain visible wiring, focus and cross-route undo tracers. This refines the renderer ownership of ADR-0009 and ADR-0020 without changing role-scoped bridge contracts, IPC channels, payloads, SQLite schema, retention, configuration or user data. The migration and rollback are source-only: restore the former React-owned workflow and its shallow view model, with no data or contract migration.
