---
status: accepted
---

# Let Settings Workspace Own the Renderer Settings Workflow

VoiceReader will place the Reader Window's Settings loading, transient drafts, confirmations, feedback and write coordination behind one route-scoped Settings Workspace model. The persisted Settings snapshot remains authoritative: a failure to load it blocks Settings writes and offers retry, while MiniMax credential status、Error Log count and Reading History count fail and retry within their own sections so auxiliary data cannot disable unrelated settings.

Continuous settings such as Speech Rate use optimistic presentation with a serialized, coalescing latest-write-wins lane; only the newest unsent value is retained while a write is in flight. Ordinary discrete settings wait for the semantic main command to succeed before replacing the authoritative snapshot, and failures preserve or restore the previous value. Shortcut registration、Reading History retention and destructive maintenance keep their validated or two-phase confirmation workflows.

Leaving Settings ends the current Settings Workspace: uncommitted API Key or Custom Model drafts、confirmations、shortcut recording and visit-scoped feedback are discarded, and late renderer responses are ignored. Already accepted main-process commands are not rolled back; the next Settings visit reloads authoritative state. This decision preserves ADR-0028's semantic command boundary、ADR-0030's role-scoped bridge contract、the SQLite schema and existing user-controlled behavior; rollback is source-only.

The production React adapter subscribes to an immutable workspace snapshot. Lifecycle setup may safely replay under React StrictMode: a restarted visit receives a new generation, while reads and commands from the disposed generation cannot update or unlock the active visit. This renderer-only lifecycle detail does not alter the route, bridge, persistence or user-visible contracts.
