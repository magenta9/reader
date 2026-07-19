import { constants, existsSync } from "node:fs";
import { access, lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

const requiredBuildArtifacts = [
  "main/main.js",
  "preload/reader-window.cjs",
  "preload/playback-renderer.cjs",
  "preload/playback-overlay.cjs",
  "renderer/index.html",
  "renderer/renderer.js",
  "renderer/renderer.css",
  "renderer/assets/voicereader-icon.svg",
  "playback-renderer/index.html",
  "playback-renderer/playback-renderer.js",
  "overlay/index.html",
  "overlay/overlay.js",
  "overlay/overlay.css",
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

  for (const contract of htmlContracts) {
    const source = await readOptionalText(distRoot, contract.artifact, unreadableArtifacts, findings);
    if (source === undefined) continue;
    checkIncludes(findings, contract.artifact, source, `<title>${contract.title}</title>`, `missing title ${contract.title}`);
    checkIncludes(findings, contract.artifact, source, `src="${contract.script}"`, `missing script entrypoint ${contract.script}`);
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

  return { ok: findings.length === 0, findings };
}

function checkIncludes(findings, artifact, source, expected, reason) {
  if (!source.includes(expected)) findings.push(finding("html", artifact, reason));
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
