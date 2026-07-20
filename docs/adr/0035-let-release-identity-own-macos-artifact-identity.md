---
status: accepted
---

# Let Release Identity Own macOS Artifact Identity

VoiceReader will derive every machine-consumed macOS release identity value through `scripts/release-identity.mjs`. The root `package.json` is the authority for package metadata and release version; Release Identity validates that metadata fail-closed, combines it with the fixed VoiceReader product、bundle、helper、platform and architecture contract, and returns one immutable snapshot containing artifact names、bundle metadata、application layout and signing requirements. Packaging、final verification、packaged smoke and local installation must pass that same snapshot through their full operation instead of re-reading or rebuilding individual identity values.

The custom packager remains responsible for filesystem assembly、system tools、icon rendering、signing execution and DMG creation. The final artifact verifier remains an independent seam that consumes only a Release Identity snapshot and a completed `.app`; it verifies the descriptor、Info.plist、helper identifiers、resources、Build Product、architecture and signature without reading packager source or inferring the expected identity from the artifact. Packaged smoke verifies this artifact contract before launching any scenario, and deploy plans derive their platform、architecture and installation destination from Release Identity.

Changing the release version therefore means changing the root `package.json` version and rerunning the verified release chain. The DMG filename is derived as `VoiceReader-<package version>-arm64.dmg`; documentation may describe that pattern but must not become a second machine authority with a copied current version. Invalid or unreadable package metadata stops the release workflow before cleanup、artifact writes or application replacement.

This decision deepens ADR-0013's VoiceReader product naming、ADR-0024's verified local release chain、ADR-0025's custom packager and ADR-0032's independent Build Product/final artifact verification layers. Rollback is source-only: there is no SQLite、IPC、configuration or user-data migration.
