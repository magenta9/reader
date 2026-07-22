import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, clipboard, globalShortcut } from "electron";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerAppRoleBridges } from "./app-role-bridges.js";
import { createElectronReaderAppShell } from "./electron-reader-app-shell.js";
import { AppDataStore } from "./data/app-data-store.js";
import { LaunchAtLoginCommands } from "./data/launch-at-login-commands.js";
import { MiniMaxAccountService } from "./data/minimax-account-service.js";
import { PlaybackPreferencesCommands } from "./data/playback-preferences-commands.js";
import { PlaybackService } from "./playback/playback-service.js";
import { ElectronPlaybackOutput } from "./playback/electron-playback-output.js";
import { PlaybackOverlayController } from "./playback/playback-overlay-controller.js";
import { PlaybackCommandController } from "./playback/playback-command-controller.js";
import { streamMiniMaxSpeechAudio } from "../shared/minimax.js";
import { ReadingTargetAcquirer } from "./reading-target/reading-target-acquirer.js";
import { startReaderSurfaces } from "./reader-startup.js";
import {
  enterPackagedSmokeMode,
  readPackagedSmokeConfiguration
} from "./packaged-smoke-runtime.js";
import {
  defineProductionRuntimeRoleIdentities,
  resolveProductionRuntimeRoleIdentity,
  type ResolvedProductionRuntimeRoleBinding
} from "../shared/production-runtime-role-identity.js";

const mainBundleDir = dirname(fileURLToPath(import.meta.url));
const runtimeRoleModulePath = join(
  mainBundleDir,
  "../runtime/production-runtime-role-bindings.cjs"
);
const runtimeRoleModule = createRequire(import.meta.url)(runtimeRoleModulePath) as unknown;
if (!isRuntimeRoleModule(runtimeRoleModule)) {
  throw new Error("Production Runtime Role Binding module is invalid.");
}
const runtimeRoleManifest = runtimeRoleModule.getRuntimeRoleManifest();
if (
  !isRecord(runtimeRoleManifest) ||
  runtimeRoleManifest.schemaVersion !== 1 ||
  !Array.isArray(runtimeRoleManifest.roles)
) {
  throw new Error("Production Runtime Role Binding manifest is invalid.");
}
const productionRuntimeRoleBindings = defineProductionRuntimeRoleIdentities(
  runtimeRoleManifest.roles
);
const resolveRuntimeArtifact = (artifact: string): string => join(mainBundleDir, "..", artifact);
const readerWindowRuntime = resolveProductionRuntimeRoleIdentity(
  "reader-window",
  resolveRuntimeArtifact,
  productionRuntimeRoleBindings
);
const playbackRendererRuntime = resolveProductionRuntimeRoleIdentity(
  "playback-renderer",
  resolveRuntimeArtifact,
  productionRuntimeRoleBindings
);
const playbackOverlayRuntime = resolveProductionRuntimeRoleIdentity(
  "playback-overlay",
  resolveRuntimeArtifact,
  productionRuntimeRoleBindings
);
const appIconAssetPath = join(mainBundleDir, "../assets/voicereader-icon.svg");
const packagedSmoke = readPackagedSmokeConfiguration();

interface RuntimeRoleModule {
  getRuntimeRoleManifest(): unknown;
}

function isRuntimeRoleModule(candidate: unknown): candidate is RuntimeRoleModule {
  return isRecord(candidate) && typeof candidate.getRuntimeRoleManifest === "function";
}

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);
}

app.setName("VoiceReader");
if (packagedSmoke.enabled) {
  app.setPath("userData", packagedSmoke.userData);
} else {
  app.setPath("userData", join(app.getPath("appData"), "VoiceReader"));
}

void bootstrap().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  app.exit(1);
});

async function bootstrap(): Promise<void> {
  await app.whenReady();

  const databasePath = join(app.getPath("userData"), "voicereader.sqlite");
  const appDataStore = AppDataStore.open(databasePath);
  const minimaxAccountService = new MiniMaxAccountService(appDataStore);
  const playbackPreferences = new PlaybackPreferencesCommands(appDataStore);
  const launchAtLoginCommands = new LaunchAtLoginCommands(app, appDataStore);
  const overlayController = new PlaybackOverlayController(playbackOverlayRuntime);
  let playbackCommands!: PlaybackCommandController;
  let playbackOutput!: ElectronPlaybackOutput;
  const readerAppShell = createElectronReaderAppShell({
    app,
    appIconAssetPath,
    buildMenu: (template) => Menu.buildFromTemplate(template),
    createBrowserWindow: (options) => new BrowserWindow(options),
    createTray: (icon) => new Tray(icon),
    headless: packagedSmoke.enabled,
    nativeImage,
    playback: {
      play: async (trigger) => {
        await playbackCommands.startReadingTargetPlayback(trigger);
      },
      stop: () => playbackCommands.stopPlayback()
    },
    runtimeRoleBinding: readerWindowRuntime,
    shutdown: () => {
      globalShortcut.unregisterAll();
      playbackOutput.destroy();
      overlayController.destroy();
      appDataStore.close();
    },
    state: {
      read: () => appDataStore.getSettings(),
      setLastRoute: (route) => {
        appDataStore.updateSettings({ lastRoute: route });
      },
      setOnboardingComplete: (complete) => {
        appDataStore.updateSettings({ hasCompletedOnboarding: complete });
      }
    }
  });
  const readingTargetAcquirer = new ReadingTargetAcquirer({
    clipboard,
    errorLog: appDataStore,
    hideReaderWindowForSelectionCapture: () => readerAppShell.hideForSelectionCapture()
  });
  playbackOutput = await ElectronPlaybackOutput.create({
    createPlaybackRenderer: () => createPlaybackRendererWindow(playbackRendererRuntime),
    readerFeedback: readerAppShell,
    overlay: overlayController,
    runtimeRoleBinding: playbackRendererRuntime
  });
  const playbackService = new PlaybackService(
    appDataStore,
    playbackOutput,
    streamMiniMaxSpeechAudio
  );
  playbackCommands = new PlaybackCommandController(
    appDataStore,
    playbackService,
    globalShortcut,
    (trigger) => readingTargetAcquirer.acquire(trigger)
  );
  registerAppRoleBridges({
    appDataStore,
    clipboard,
    ipcMain,
    launchAtLoginCommands,
    minimaxAccountService,
    playbackPreferences,
    overlayController,
    playbackCommands,
    readerAppShell
  });
  const readerAppShellInitialization = startReaderSurfaces({
    launchAtLoginCommands,
    playbackCommands,
    readerAppShell
  });
  if (packagedSmoke.enabled) {
    await Promise.all([readerAppShellInitialization, overlayController.prepare()]);
    enterPackagedSmokeMode({
      app,
      appDataStore,
      databasePath,
      scenario: packagedSmoke.scenario
    });
  }
}

function createPlaybackRendererWindow(
  runtimeRoleBinding: ResolvedProductionRuntimeRoleBinding
): BrowserWindow {
  return new BrowserWindow({
    title: "VoiceReader Playback Renderer",
    width: 1,
    height: 1,
    show: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: runtimeRoleBinding.preloadEntry,
      ...runtimeRoleBinding.webPreferences
    }
  });
}
