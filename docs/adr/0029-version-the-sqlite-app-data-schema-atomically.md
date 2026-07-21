---
status: accepted
---

# Version the SQLite App Data Schema Atomically

VoiceReader opens its local database only through `AppDataStore.open(path)`. That seam owns a versioned SQLite lifecycle: it acquires `BEGIN IMMEDIATE`, classifies the database, applies a known migration, validates the exact schema contract, writes `PRAGMA user_version`, commits, and only then applies Reading History retention. A failed lifecycle rolls back, closes the SQLite handle, and fails startup rather than guessing how to repair data.

Schema version 1 is the existing four-table schema for Settings, Reading History, Favorites, and Error Log, including its three explicit descending indexes. Version 0 is accepted only when it exactly matches an empty database, the historical three-table schema, or the unversioned four-table schema. The three-table migration only adds the existing Favorites table and index. The lifecycle preserves the ADR-0017 credential behavior by deleting the obsolete encrypted-key row without attempting decryption, and preserves the existing migration from the old default activation shortcut. Unknown unversioned schemas and versions newer than the application supports fail closed before compatibility writes or retention cleanup.

Tests use real SQLite files reconstructed from repository history and exercise the public `AppDataStore.open` seam. The packaged release gate launches the final `.app` against fresh, historical three-table, and unversioned current databases, verifies version, exact schema, sentinel data, and compatibility normalization, and separately proves that a future-version database is rejected without mutation.

This decision establishes a lifecycle and a v1 baseline; it does not add a new table or column, change retention, promise arbitrary binary downgrade compatibility, or introduce backup, salvage, export, recovery UI, or automatic rebuilding of unknown databases. Those behaviors require separate product and release decisions. Because v1 has the same physical schema as the previous unversioned application and older code ignores `user_version`, rollback may revert the lifecycle commits without a reverse data migration.
