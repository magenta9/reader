# Make the Build Product the Verifier Boundary

VoiceReader will treat `dist/` as the single publishable Build Product and verify it through one structured `verifyBuiltVoiceReader(distRoot)` interface. The verifier owns the runtime artifact manifest、legacy artifact absence、HTML/CSP/entrypoint relationships、resource placement and executable production preload behavior. Its CLI adapter may build first or reuse an existing product, but the verifier itself consumes only the supplied Build Product and returns categorized artifact、role or behavior findings.

Source behavior remains owned by Vitest at each public module seam. The Build Verifier must not read `src/`、CSS source、package scripts or verifier scripts to preserve function names、type names、selectors、literal ordering or command strings. Package verification owns the final `.app`/DMG layout、architecture and signature; packaged smoke owns real Electron startup、native-addon readiness and isolated SQLite migration scenarios. These independent layers must not be collapsed into one implicit release command.

During expand–migrate–contract, the old dist script may run beside the structured verifier. Once built evidence has moved, TypeScript will stop emitting the internal source tree into `dist/`; esbuild bundles、HTML/CSS/assets and the macOS native addon will form the exact Build Product. Rollback is source-only and proceeds in reverse migration order; no IPC、schema or user-data migration is involved.

This decision deepens ADR-0021's source/dist split and preserves ADR-0023's source-built addon、ADR-0024's verified local release chain、ADR-0025's custom packager、ADR-0030's executable role contracts and ADR-0031's production Reader App Shell smoke seam.
