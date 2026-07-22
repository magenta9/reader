import { constants, existsSync } from "node:fs";
import { access, lstat, readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import vm from "node:vm";

const requiredBuildArtifacts = [
  "main/main.js",
  "main/main.js.map",
  "runtime-role-bindings.json",
  "runtime/production-runtime-role-bindings.cjs",
  "preload/reader-window.cjs",
  "preload/reader-window.cjs.map",
  "preload/playback-renderer.cjs",
  "preload/playback-renderer.cjs.map",
  "preload/playback-overlay.cjs",
  "preload/playback-overlay.cjs.map",
  "renderer/index.html",
  "renderer/renderer.js",
  "renderer/renderer.js.map",
  "renderer/renderer.css",
  "renderer/renderer.css.map",
  "renderer/assets/voicereader-icon.svg",
  "playback-renderer/index.html",
  "playback-renderer/playback-renderer.js",
  "playback-renderer/playback-renderer.js.map",
  "overlay/index.html",
  "overlay/overlay.js",
  "overlay/overlay.js.map",
  "overlay/overlay.css",
  "overlay/overlay.css.map",
  "assets/voicereader-icon.svg",
  "assets/voicereader-template-icon.svg"
];

const legacyBuildArtifacts = [
  "preload/preload.js",
  "preload/preload.cjs",
  "preload/bridge-adapters",
  "main/app-bridge-handlers.js"
];

const htmlContracts = Object.freeze([
  {
    artifact: "renderer/index.html",
    title: "VoiceReader",
    script: "./renderer.js",
    stylesheet: "./renderer.css",
    requiresMediaCsp: true
  },
  {
    artifact: "playback-renderer/index.html",
    title: "VoiceReader Playback Renderer",
    script: "./playback-renderer.js",
    requiresMediaCsp: true
  },
  {
    artifact: "overlay/index.html",
    title: "VoiceReader Overlay",
    script: "./overlay.js",
    stylesheet: "./overlay.css",
    requiresMediaCsp: false
  }
]);

const expectedRuntimeRoleManifest = {
  schemaVersion: 1,
  roles: [
    {
      role: "reader-window",
      preloadArtifact: "preload/reader-window.cjs",
      documentArtifact: "renderer/index.html",
      globalName: "voiceReader",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    },
    {
      role: "playback-renderer",
      preloadArtifact: "preload/playback-renderer.cjs",
      documentArtifact: "playback-renderer/index.html",
      globalName: "voiceReader",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false
      }
    },
    {
      role: "playback-overlay",
      preloadArtifact: "preload/playback-overlay.cjs",
      documentArtifact: "overlay/index.html",
      globalName: "voiceReader",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    }
  ]
};

const roleContracts = [
  {
    artifact: "preload/reader-window.cjs",
    required: [
      "getBootstrapState", "setRoute", "onNavigate", "getSettings", "setSpeechRate", "setModel",
      "createFavoriteFromHistoryRecord", "listFavorites", "playFavoriteRecord", "onPlaybackFinish"
    ],
    forbidden: [
      "updateSettings", "onPlaybackStart", "onAudioChunk", "reportAudioOutcome", "sendOverlayMetric",
      "onOverlayShow", "notifyOverlayReady"
    ]
  },
  {
    artifact: "preload/playback-renderer.cjs",
    required: ["onPlaybackStart", "onAudioChunk", "onAudioInputEnd", "reportAudioOutcome", "sendOverlayMetric"],
    forbidden: [
      "getSettings", "setRoute", "onNavigate", "playReadingTarget", "onPlaybackFinish", "onOverlayShow",
      "notifyOverlayReady", "setMiniMaxApiKey", "clearMiniMaxApiKey", "clearReadingHistory", "copyText"
    ]
  },
  {
    artifact: "preload/playback-overlay.cjs",
    required: ["onOverlayShow", "onOverlayMetric", "onOverlayFinish", "onOverlayFail", "onOverlayStop", "notifyOverlayReady"],
    forbidden: [
      "getSettings", "setRoute", "onNavigate", "onPlaybackStart", "onAudioChunk", "reportAudioOutcome",
      "sendOverlayMetric", "stopPlayback", "setMiniMaxApiKey", "clearMiniMaxApiKey", "clearReadingHistory",
      "copyText"
    ]
  }
];

const readerProbeChannels = {
  getBootstrapState: "app-shell:get-bootstrap-state",
  setRoute: "app-shell:set-route",
  onNavigate: "app-shell:navigate",
  setSpeechRate: "app-data:set-speech-rate",
  setModel: "app-data:set-model"
};

export async function verifyBuiltVoiceReader(distRoot, { platform = process.platform } = {}) {
  const findings = [];
  const unreadableArtifacts = new Set();
  const requiredArtifacts = platform === "darwin"
    ? [...requiredBuildArtifacts, "native/selection-copy-macos.node"]
    : requiredBuildArtifacts;

  for (const artifact of requiredArtifacts) {
    try {
      const metadata = await lstat(join(distRoot, artifact));
      if (!metadata.isFile()) {
        unreadableArtifacts.add(artifact);
        findings.push(finding("artifact", artifact, "build artifact must be a readable file"));
      } else {
        await access(join(distRoot, artifact), constants.R_OK);
      }
    } catch (error) {
      unreadableArtifacts.add(artifact);
      findings.push(
        finding(
          "artifact",
          artifact,
          error?.code === "ENOENT"
            ? "required build artifact is missing"
            : "build artifact must be a readable file"
        )
      );
    }
  }
  for (const artifact of legacyBuildArtifacts) {
    if (existsSync(join(distRoot, artifact))) {
      findings.push(finding("artifact", artifact, "legacy build artifact must be absent"));
    }
  }
  const allowedArtifacts = new Set(requiredArtifacts);
  const legacyArtifacts = new Set(legacyBuildArtifacts);
  for (const artifact of await listBuildArtifacts(distRoot)) {
    if (!allowedArtifacts.has(artifact) && !legacyArtifacts.has(artifact)) {
      findings.push(finding("artifact", artifact, "unexpected build artifact"));
    }
  }

  for (const contract of htmlContracts) {
    const source = await readOptionalText(distRoot, contract.artifact, unreadableArtifacts, findings);
    if (source === undefined) continue;
    checkIncludes(findings, contract.artifact, source, `<title>${contract.title}</title>`, `missing title ${contract.title}`);
    checkIncludes(findings, contract.artifact, source, `src="${contract.script}"`, `missing script entrypoint ${contract.script}`);
    checkMissing(findings, contract.artifact, source, "manifest.json", "legacy manifest reference must be absent");
    if (contract.stylesheet) {
      checkIncludes(findings, contract.artifact, source, `href="${contract.stylesheet}"`, `missing stylesheet ${contract.stylesheet}`);
    }
    if (contract.requiresMediaCsp) {
      checkIncludes(findings, contract.artifact, source, "Content-Security-Policy", "missing Content Security Policy");
      checkIncludes(findings, contract.artifact, source, "media-src 'self' blob:", "media Content Security Policy must allow local blob audio");
    }
  }

  const appIcon = await readOptionalText(distRoot, "assets/voicereader-icon.svg", unreadableArtifacts, findings);
  const rendererIcon = await readOptionalText(
    distRoot,
    "renderer/assets/voicereader-icon.svg",
    unreadableArtifacts,
    findings
  );
  if (appIcon !== undefined && rendererIcon !== undefined && rendererIcon !== appIcon) {
    findings.push(
      finding(
        "resource",
        "renderer/assets/voicereader-icon.svg",
        "renderer icon must match the packaged application icon"
      )
    );
  }

  let runtimeRoleManifest;
  const runtimeRoleManifestSource = await readOptionalText(
    distRoot,
    "runtime-role-bindings.json",
    unreadableArtifacts,
    findings
  );
  if (runtimeRoleManifestSource !== undefined) {
    try {
      runtimeRoleManifest = JSON.parse(runtimeRoleManifestSource);
      if (JSON.stringify(runtimeRoleManifest) !== JSON.stringify(expectedRuntimeRoleManifest)) {
        findings.push(
          finding(
            "role-binding",
            "runtime-role-bindings.json",
            "runtime role manifest does not match the expected production bindings"
          )
        );
      }
    } catch {
      findings.push(
        finding(
          "role-binding",
          "runtime-role-bindings.json",
          "runtime role manifest is not valid JSON"
        )
      );
    }
  }

  const runtimeRoleModuleSource = await readOptionalText(
    distRoot,
    "runtime/production-runtime-role-bindings.cjs",
    unreadableArtifacts,
    findings
  );
  if (runtimeRoleModuleSource !== undefined) {
    try {
      const moduleManifest = evaluateRuntimeRoleBindingModule(runtimeRoleModuleSource);
      if (
        JSON.stringify(moduleManifest) !== JSON.stringify(expectedRuntimeRoleManifest) ||
        JSON.stringify(moduleManifest) !== JSON.stringify(runtimeRoleManifest)
      ) {
        findings.push(
          finding(
            "role-binding",
            "runtime/production-runtime-role-bindings.cjs",
            "runtime role module does not match the verified production manifest"
          )
        );
      }
    } catch (error) {
      findings.push(
        finding(
          "role-binding",
          "runtime/production-runtime-role-bindings.cjs",
          `runtime role module evaluation failed: ${safeErrorMessage(error)}`
        )
      );
    }
  }

  const mainBundleSource = await readOptionalText(
    distRoot,
    "main/main.js",
    unreadableArtifacts,
    findings
  );
  if (
    mainBundleSource !== undefined &&
    !mainBundleSource.includes("production-runtime-role-bindings.cjs")
  ) {
    findings.push(
      finding(
        "role-binding",
        "main/main.js",
        "main runtime does not load the verified runtime role module"
      )
    );
  }
  if (mainBundleSource?.includes("src/preload/")) {
    findings.push(
      finding(
        "role-binding",
        "main/main.js",
        "main runtime must not embed source-owned role metadata"
      )
    );
  }

  for (const contract of roleContracts) {
    const bundle = await readOptionalText(distRoot, contract.artifact, unreadableArtifacts, findings);
    if (bundle === undefined) continue;
    const invocations = [];
    let runtime;
    try {
      runtime = evaluatePreloadRuntime(bundle, createProbeInvoke(invocations));
    } catch (error) {
      findings.push(finding("role", contract.artifact, `preload evaluation failed: ${safeErrorMessage(error)}`));
      continue;
    }
    if (runtime.exposures.length > 0 && (
      runtime.exposures.length !== 1 || runtime.exposures[0].name !== "voiceReader"
    )) {
      findings.push(finding("role", contract.artifact, "preload must expose exactly one voiceReader bridge"));
      continue;
    }
    if (!runtime.bridge || typeof runtime.bridge !== "object") {
      findings.push(finding("role", contract.artifact, "preload did not expose a bridge"));
      continue;
    }
    for (const capability of contract.required) {
      if (typeof runtime.bridge[capability] !== "function") {
        findings.push(finding("role", contract.artifact, `missing capability ${capability}`));
      }
    }
    for (const capability of contract.forbidden) {
      if (capability in runtime.bridge) {
        findings.push(finding("role", contract.artifact, `unexpected capability ${capability}`));
      }
    }
    if (contract.artifact === "preload/reader-window.cjs") {
      await verifyReaderWindowBehavior(runtime, invocations, findings, contract.artifact);
    }
  }

  return { ok: findings.length === 0, findings };
}

async function verifyReaderWindowBehavior(runtime, invocations, findings, artifact) {
  const bridge = runtime.bridge;
  if (["setSpeechRate", "setModel", "getBootstrapState", "setRoute", "onNavigate"].some(
    (capability) => typeof bridge[capability] !== "function"
  )) return;
  try {
    const speechRate = await bridge.setSpeechRate(1.6);
    const model = await bridge.setModel("speech-2.8-hd");
    if (speechRate?.speechRate !== 1.6 || model?.model !== "speech-2.8-hd") {
      findings.push(finding("behavior", artifact, "compiled Settings commands did not preserve values"));
    }
    const preferenceInvocations = invocations.slice(-2);
    if (
      preferenceInvocations.length !== 2 ||
      preferenceInvocations[0].args[0] !== 1.6 ||
      preferenceInvocations[1].args[0] !== "speech-2.8-hd" ||
      preferenceInvocations[0].channel !== readerProbeChannels.setSpeechRate ||
      preferenceInvocations[1].channel !== readerProbeChannels.setModel
    ) {
      findings.push(finding("behavior", artifact, "compiled Settings commands used unexpected channels"));
    }

    const snapshots = [];
    const channelsBefore = new Set(runtime.listenerChannels());
    const unsubscribe = bridge.onNavigate((snapshot) => snapshots.push({ route: snapshot.route, revision: snapshot.revision }));
    const navigateChannel = runtime.listenerChannels().find((channel) => !channelsBefore.has(channel));
    if (!navigateChannel) {
      findings.push(finding("behavior", artifact, "compiled route event did not register a listener"));
    } else {
      if (navigateChannel !== readerProbeChannels.onNavigate) {
        findings.push(finding("behavior", artifact, "compiled route event used an unexpected channel"));
      }
      runtime.emit(navigateChannel, { route: "history", revision: 5 });
      unsubscribe();
      runtime.emit(navigateChannel, { route: "settings", revision: 6 });
      if (JSON.stringify(snapshots) !== JSON.stringify([{ route: "history", revision: 5 }])) {
        findings.push(finding("behavior", artifact, "compiled route event did not preserve snapshot or unsubscribe behavior"));
      }
    }

    const bootstrap = await bridge.getBootstrapState();
    const route = await bridge.setRoute("favorites");
    const routeInvocations = invocations.slice(-2);
    if (
      routeInvocations[0]?.channel !== readerProbeChannels.getBootstrapState ||
      routeInvocations[1]?.channel !== readerProbeChannels.setRoute
    ) {
      findings.push(finding("behavior", artifact, "compiled route commands used unexpected channels"));
    }
    if (
      bootstrap?.hasCompletedOnboarding !== true ||
      bootstrap?.route?.route !== "home" ||
      bootstrap?.route?.revision !== 4 ||
      route?.route !== "favorites" ||
      route?.revision !== 5
    ) {
      findings.push(finding("behavior", artifact, "compiled route commands did not preserve revisioned snapshots"));
    }
  } catch (error) {
    findings.push(finding("behavior", artifact, `compiled Reader Window probe failed: ${safeErrorMessage(error)}`));
  }
}

function createProbeInvoke(invocations) {
  return async (channel, ...args) => {
    invocations.push({ channel, args });
    if (args[0] === 1.6) return { speechRate: 1.6 };
    if (args[0] === "speech-2.8-hd") return { model: "speech-2.8-hd" };
    if (args[0] === "favorites") return { route: "favorites", revision: 5 };
    if (args.length === 0) {
      return { hasCompletedOnboarding: true, route: { route: "home", revision: 4 } };
    }
    return undefined;
  };
}

function evaluatePreloadRuntime(bundle, invoke) {
  const exposures = [];
  const listeners = new Map();
  const sandbox = {
    require(specifier) {
      if (specifier !== "electron") throw new Error(`unexpected preload dependency ${specifier}`);
      return {
        contextBridge: {
          exposeInMainWorld(name, exposedBridge) {
            exposures.push({ name, bridge: exposedBridge });
          }
        },
        ipcRenderer: {
          invoke,
          on(channel, listener) {
            const channelListeners = listeners.get(channel) ?? new Set();
            channelListeners.add(listener);
            listeners.set(channel, channelListeners);
          },
          off(channel, listener) {
            listeners.get(channel)?.delete(listener);
          }
        }
      };
    },
    module: { exports: {} },
    exports: {}
  };
  vm.runInNewContext(bundle, sandbox);
  const bridge = exposures.length === 1 && exposures[0].name === "voiceReader"
    ? exposures[0].bridge
    : undefined;
  return {
    bridge,
    exposures,
    emit(channel, ...args) {
      for (const listener of listeners.get(channel) ?? []) listener({}, ...args);
    },
    listenerChannels: () => [...listeners.keys()]
  };
}

function evaluateRuntimeRoleBindingModule(bundle) {
  const module = { exports: {} };
  vm.runInNewContext(bundle, { module, exports: module.exports });
  const runtimeModule = module.exports;
  if (
    !runtimeModule ||
    typeof runtimeModule !== "object" ||
    typeof runtimeModule.getRuntimeRoleManifest !== "function"
  ) {
    throw new Error("runtime role module must export getRuntimeRoleManifest");
  }
  return runtimeModule.getRuntimeRoleManifest();
}

function safeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function checkIncludes(findings, artifact, source, expected, reason) {
  if (!source.includes(expected)) findings.push(finding("html", artifact, reason));
}

function checkMissing(findings, artifact, source, forbidden, reason) {
  if (source.includes(forbidden)) findings.push(finding("html", artifact, reason));
}

function finding(category, artifact, reason) {
  return { category, artifact, reason };
}

async function readOptionalText(distRoot, artifact, unreadableArtifacts, findings) {
  if (unreadableArtifacts.has(artifact)) return undefined;
  const path = join(distRoot, artifact);
  if (!existsSync(path)) return undefined;
  try {
    return await readFile(path, "utf8");
  } catch {
    unreadableArtifacts.add(artifact);
    findings.push(finding("artifact", artifact, "build artifact must be a readable file"));
    return undefined;
  }
}

async function listBuildArtifacts(distRoot) {
  if (!existsSync(distRoot)) return [];
  const artifacts = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else artifacts.push(relative(distRoot, path));
    }
  };
  await visit(distRoot);
  return artifacts.sort();
}
