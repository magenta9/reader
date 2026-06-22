# PRD: Vitest Source Tests and Dist Contract Test Flow

Status: ready-for-agent

Decision source: ADR-0021

## Problem Statement

VoiceReader currently relies on one large build-first Node test script for both source-level behavior and build-output contract checks. This makes ordinary test feedback slow, makes failures harder to locate, and forces developers to rebuild the Electron app even when they only changed source-level logic or React UI behavior.

The user wants the test workflow to become faster and easier to maintain without losing the existing protection around Electron build artifacts, preload bridge boundaries, bundled HTML/CSS, native addon copying, packaging assumptions, and visible VoiceReader behavior.

## Solution

Introduce Vitest as the fast source-level test runner for VoiceReader behavior and React UI tests. Keep a separate dist contract test command for checks that genuinely require built output. `pnpm test` should become the normal fast Vitest command, `pnpm test:dist` should validate build-output contracts, and `pnpm verify` should run typecheck, Vitest, build, then dist contract checks without rebuilding twice.

React UI tests should use jsdom and Testing Library so Reader Window and Playback Overlay behavior can be tested through visible labels, controls, and user interactions. Renderer and overlay entrypoints should be split so tests import pure components with fake bridges rather than triggering real `window.voiceReader` access or root rendering at module import time.

## User Stories

1. As a VoiceReader developer, I want `pnpm test` to run fast source-level tests, so that I can get feedback without waiting for a full Electron build.
2. As a VoiceReader developer, I want source-level test failures to point at source modules, so that I can fix behavior without reasoning through generated output.
3. As a VoiceReader developer, I want `pnpm test:watch` to rerun Vitest tests during development, so that small changes can be validated interactively.
4. As a VoiceReader developer, I want dist contract tests to remain available, so that Electron build artifacts are still protected.
5. As a VoiceReader developer, I want `pnpm test:dist` to run independently, so that build-output contracts can be checked directly when packaging-sensitive code changes.
6. As a VoiceReader developer, I want `pnpm verify` to run typecheck, Vitest, build, and dist contract checks, so that pre-commit verification covers both source behavior and generated output.
7. As a VoiceReader developer, I want `pnpm verify` to avoid duplicate builds, so that full verification remains practical.
8. As a VoiceReader developer, I want source tests kept outside the production source tree, so that build output does not accidentally include test files.
9. As a VoiceReader developer, I want TypeScript to typecheck tests, so that fake bridges and test helpers stay aligned with VoiceReader contracts.
10. As a VoiceReader developer, I want React UI tests to use user-visible queries, so that tests protect behavior rather than component internals.
11. As a VoiceReader developer, I want Home setup blockers tested through visible disabled states and recovery actions, so that setup regressions are caught.
12. As a VoiceReader developer, I want verified playback controls tested through fake bridges, so that Play behavior can be checked without real MiniMax calls.
13. As a VoiceReader developer, I want Voice preference selection tested through the UI, so that language-scoped Preferred Voice behavior remains reliable.
14. As a VoiceReader developer, I want Reading History list and detail behavior tested through visible records and actions, so that replay, copy, favorite, and delete affordances remain discoverable.
15. As a VoiceReader developer, I want Playback Overlay lifecycle behavior tested through fake overlay events, so that show, progress, finish, fail, and stop states remain reliable.
16. As a VoiceReader developer, I want progress behavior tested at the overlay seam, so that overlay progress does not regress when later audio code changes.
17. As a VoiceReader developer, I want local data behavior tested directly against the SQLite-backed store seam, so that Settings, Reading History, Favorites, and Error Log persistence remain covered.
18. As a VoiceReader developer, I want MiniMax account setup tested with injected API fakes, so that connection status and Voice cache behavior do not require live MiniMax calls.
19. As a VoiceReader developer, I want Playback Session orchestration tested with fake sinks and streams, so that Play, Stop, replacement, History Replay, and Favorite Replay behavior remain covered.
20. As a VoiceReader developer, I want Selected Text and Clipboard Text acquisition tested with fake clipboards and selection-copy adapters, so that Reading Target fallback behavior remains stable.
21. As a VoiceReader developer, I want AppPresence behavior tested at its controller seam, so that Dock visibility, Dock icon, and selection-capture hiding behavior survive refactors.
22. As a VoiceReader developer, I want existing bundle and preload bridge shape checks retained in dist contract tests, so that cross-process capabilities stay constrained.
23. As a VoiceReader developer, I want build artifact existence checks retained in dist contract tests, so that missing renderer, overlay, preload, asset, or native outputs are caught.
24. As a VoiceReader developer, I want packaging-script assumptions retained in dist contract tests, so that macOS packaging regressions are caught before manual packaging.
25. As a VoiceReader maintainer, I want documentation to reflect the new command meanings, so that future agents run the correct checks.
26. As a VoiceReader maintainer, I want ADR-0021 reflected in the implementation, so that future contributors understand why both Vitest and dist contract tests exist.
27. As a VoiceReader maintainer, I want this migration to preserve existing uncommitted AppPresence work, so that the test-flow change does not accidentally revert unrelated progress.
28. As a VoiceReader maintainer, I want the migration to avoid introducing Electron end-to-end tests, so that the first step stays focused and maintainable.
29. As a VoiceReader maintainer, I want the migration to avoid live MiniMax credentials, so that normal verification remains local and deterministic.
30. As a future agent, I want the test files organized by product seam, so that adding a new behavior test is straightforward.

## Implementation Decisions

- Use Vitest for source-level behavior tests and React UI tests.
- Use jsdom for React UI tests and Testing Library for visible UI queries and user interactions.
- Keep source-level tests in a root-level test tree that mirrors product seams instead of placing tests beside production modules.
- Keep production build configuration focused on production source only; tests must not be emitted into Electron build output.
- Add a Vitest watch command for local development.
- Keep one separate dist contract command for checks that require built output.
- Make the dist contract command build by default when run directly.
- Allow the dist contract command to skip building when verification has already built the app.
- Change full verification to run typecheck, Vitest, build, then dist contract checks without repeating the build.
- Split renderer and overlay entrypoints from pure React components so component tests can inject fake bridges.
- Keep real bridge lookup and root rendering in runtime entrypoints only.
- Use fake Reader Window, renderer audio, and Playback Overlay bridges for React UI tests.
- Preserve existing fake-based testing seams for MiniMax account setup, Playback Session orchestration, Reading Target acquisition, local data persistence, and renderer audio queue behavior.
- Move source-level assertions out of the existing build-first script into Vitest tests.
- Retain build-output assertions in the dist contract command, including generated files, bundle contracts, preload bridge shape, HTML/CSS contracts, native addon output, asset copying, and packaging-script assumptions.
- Remove duplicate business behavior assertions from the dist contract command after equivalent Vitest coverage exists.
- Preserve the current AppPresenceController direction and cover it in Vitest rather than folding it back into the main Electron entrypoint.
- Update developer documentation after command behavior changes.
- Do not update the domain glossary because this is an engineering workflow decision, not a VoiceReader product term.
- No data schema, IPC contract, MiniMax API contract, or user-facing product behavior changes are intended.

## Testing Decisions

- Good tests should assert external behavior at the highest practical seam, not private implementation details.
- Source-level Vitest tests should cover the same product behavior currently protected by the build-first script, but import source modules directly.
- UI tests should prefer labels, button text, roles, disabled states, selection changes, and visible feedback over CSS selectors or component internals.
- Dist contract tests should remain string- and artifact-oriented only where the contract is actually about generated output or bundle boundaries.
- Tests for Reading Target selection should cover Selected Text priority, Clipboard Text fallback, empty/non-text skip behavior, clipboard restoration, and safe selection-capture failure logging.
- Tests for local data should cover Settings defaults and updates, MiniMax API key persistence and clearing, legacy key cleanup, Reading History persistence and retention, Favorite Record independence, and Error Log limits.
- Tests for Reading History Record behavior should cover creation timing, preview, language summary, duration estimate, source, deduplication, and replay without new history.
- Tests for Favorite Records should cover duplicate favorite creation, independence from Reading History cleanup/deletion, detail copy/delete behavior, and Favorite Replay without new history.
- Tests for MiniMax account behavior should cover verified setup, invalid key failure, missing key, Voice refresh, cached Voice fallback, Preferred Voice updates, and absence of Error Log writes for setup blockers.
- Tests for MiniMax stream parsing should cover incremental audio, final aggregate audio, final-only audio, malformed/empty stream tolerance where already supported, and API key/base URL classification.
- Tests for Playback Session behavior should cover successful play, silent readiness skips, runtime failure Error Log behavior, new Play replacement, stream abort, Stop Shortcut registration/cleanup, History Replay, and Favorite Replay.
- Tests for renderer audio queue behavior should cover session start, chunk playback, segment end, finish, fail, stop, renderer idle, progress metrics, and suppression of Playback Overlay metrics for History Replay and Favorite Replay.
- Tests for AppPresence should cover macOS hide plus Dock restore, non-macOS reader window hide, missing Dock no-op behavior, and non-empty Dock icon setting.
- React UI tests should initially cover Home setup blocker, Home verified playback, Home Voice preference selection, History empty and detail selection states, and Playback Overlay lifecycle.
- The existing build-first script is the prior art for behavior coverage and should be mined carefully before deleting assertions.
- `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:dist -- --no-build`, `pnpm test:dist`, and `pnpm verify` are the acceptance commands.

## Out of Scope

- Playwright tests
- Electron end-to-end tests
- Browser Mode component tests
- Screenshot-based visual regression tests
- Real MiniMax API calls
- Real macOS global shortcut testing
- Real audio device output validation
- Changes to Reading Target, Reading History, Favorite Record, Playback Session, Voice, or Playback Overlay product behavior
- Changes to SQLite schema or persisted user data
- Changes to packaging, code signing, or notarization behavior beyond preserving current contract checks
- Rewriting the full Reader Window UI into small components beyond the minimum needed for bridge injection and testability
- Updating the domain glossary

## Further Notes

- ADR-0021 is the controlling decision for this PRD.
- The migration should be performed on top of the current dirty worktree without reverting unrelated user or in-progress changes.
- The existing AppPresenceController work is part of the current implementation shape and should be protected by the new test suite.
- If Node/Vitest tests fail after Electron-native dependency changes, rebuild the affected native dependency before assuming the source migration is broken.
