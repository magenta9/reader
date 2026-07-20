---
status: accepted
partially-superseded-by: ADR-0036
refined-by: ADR-0032
---

# Split Vitest Source Tests From Dist Contract Tests

VoiceReader uses four independent verification layers. Vitest owns source-level behavior and jsdom React UI tests at public module seams. The Build Verifier consumes only `dist/` and owns the exact runtime product manifest, HTML/CSP/resource relationships, native-addon presence and executable production-preload role behavior. macOS package verification owns the final `.app`/DMG layout, architecture and signature. Packaged smoke owns real Electron startup, dynamic HTML/preload paths, native-addon readiness and isolated SQLite migration scenarios.

`bun run test` is the fast source-test command, `bun run test:dist` builds once and verifies the Build Product, and `make verify` performs a frozen install, one clean build, Electron runtime probe, typecheck, Vitest and Build Product verification. No verification layer may preserve coverage by reading source, CSS, package or verifier scripts and asserting function names, selectors, SQL, command literals or implementation ordering. A deleted mirror may return only as behavior at the highest applicable public source, artifact, package or packaged-smoke seam.

Reader App Shell behavior follows the same split: source-level controller and Electron adapter tests own window configuration、Menu command mapping、lifecycle、navigation ordering、sender identity and feedback behavior. Dist checks verify only the built main bundle、Reader preload role behavior and packaged artifacts; they must not read App Shell or App Presence source to mirror function names、literal placement or call ordering. Final packaged smoke proves that the real Reader App Shell assembles and reaches a headless initialized state before readiness is accepted.

After adopting role-scoped executable bridge contracts, Vitest owns endpoint declaration、loopback、implementation、error and unsubscribe behavior. Dist checks execute the three built role preloads and a narrow Reader Window Settings/route tracer to prove production isolation and compiled bridge behavior; they do not preserve per-handler/per-adapter file lists, duplicate business scenarios or source substring mirrors.

Historical scope note: ADR-0036 supersedes only the Reader App Shell sender-identity source-test responsibility above because Reading Target Acquisition no longer uses Electron sender context or focused-sender policy. This decision's four verification layers、source/artifact split and remaining Shell behavior responsibilities stay accepted.
