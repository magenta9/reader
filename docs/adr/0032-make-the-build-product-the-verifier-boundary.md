---
status: accepted
---

# Make the Build Product the Verifier Boundary

VoiceReader will treat `dist/` as the single publishable Build Product and verify it through one structured `verifyBuiltVoiceReader(distRoot)` interface. The verifier owns the runtime artifact manifest、legacy artifact absence、HTML/CSP/entrypoint relationships、resource placement and executable production preload behavior. Its CLI adapter may build first or reuse an existing product, but the verifier itself consumes only the supplied Build Product and returns categorized artifact、role or behavior findings.

The executable preload proof runs the three production CommonJS artifacts in an isolated VM, checks critical public capabilities and explicit cross-role denials, and traces Reader Window Settings commands、revisioned route snapshots and event unsubscribe behavior. Source tests remain the exact registry truth; the artifact verifier deliberately does not copy that declaration metadata or infer a role from a URL/pathname.

Source behavior remains owned by Vitest at each public module seam. The Build Verifier must not read `src/`、CSS source、package scripts or verifier scripts to preserve function names、type names、selectors、literal ordering or command strings. Package verification owns the final `.app`/DMG layout、architecture and signature; packaged smoke owns real Electron startup、native-addon readiness and isolated SQLite migration scenarios. These independent layers must not be collapsed into one implicit release command.

The contract phase is complete: TypeScript type-checks without emitting an internal source tree, while esbuild bundles、HTML/CSS/assets and the macOS native addon form the exact Build Product. The legacy dist script, temporary internal emit and duplicate source-level scenarios have been deleted. Rollback is source-only; no IPC、schema or user-data migration is involved.

The structured verifier fails closed on every file outside the explicit runtime product manifest, including internal `main`、`shared` and component modules. Package assumptions are proven at the package plan, final artifact and packaged-smoke seams rather than by reading package implementation scripts.

This decision deepens ADR-0021's source/dist split and preserves ADR-0023's source-built addon、ADR-0024's verified local release chain、ADR-0025's custom packager、ADR-0030's executable role contracts and ADR-0031's production Reader App Shell smoke seam.
