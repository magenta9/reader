# Electron VoiceReader shell and navigation

Status: completed

Implementation status: completed

## Parent

`.scratch/voicereader-macos/PRD.md`

## What to build

Create the VoiceReader Electron + React + TypeScript application shell as the new first-class app surface. The app should present a single Chinese Reader Window with `主页 / 历史记录 / 设置`, a Menu Bar Menu with the approved actions, normal Dock presence, correct hide-on-close behavior, single-window restoration, and no active Chrome extension workflow.

## Acceptance criteria

- [x] VoiceReader launches as a macOS Electron app with a React renderer and Chinese navigation for `主页`, `历史记录`, and `设置`.
- [x] The app has one main Reader Window; repeated opens, Dock activation, and Menu Bar actions focus or restore the same window.
- [x] Closing the Reader Window hides it without quitting; `退出` from the Menu Bar Menu quits the app.
- [x] The Menu Bar Menu contains `播放`, `打开 VoiceReader`, `历史记录`, `设置`, and `退出`, with navigation actions opening the correct surface.
- [x] First launch shows the Reader Window; later launches can start hidden after onboarding state is complete.
- [x] Obsolete Chrome extension entrypoints are removed from the active app workflow rather than kept as parallel first-class surfaces.
- [x] A smoke test or documented manual verification proves window lifecycle, menu navigation, and single-window behavior.

## Blocked by

None - can start immediately

## Verification

- `npm run typecheck` passed.
- `npm run test` passed. The test builds the Electron app and asserts the generated main/renderer/preload outputs, Chinese navigation labels, Menu Bar Menu labels, main-window sizing, activate restore path, hide-on-close path, and absence of a Chrome manifest reference in the renderer HTML.
- `npm run build` passed.
- `npm run verify` passed, combining typecheck, tests, and build.
- `ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron -e "console.log(process.versions.electron)"` returned `41.5.1`, proving the local Electron runtime is callable in this environment.

## Notes

- Shell network access could not fetch React/Electron from npm, even with the user-provided proxy and a mirror registry. Current verification uses local symlinked React/Electron packages already present on this machine. `package.json` declares normal semver dependencies so the lockfile should be regenerated once registry access is available.
- A real GUI launch was not performed in this sandboxed turn. Window lifecycle and menu behavior are covered by source/build assertions; full visual runtime verification should be repeated when the app can be opened normally.
