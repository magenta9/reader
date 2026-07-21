import { readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_NAME = "voicereader";
const PACKAGE_TYPE = "module";
const PACKAGE_MAIN = "dist/main/main.js";
const PRODUCT_NAME = "VoiceReader";
const BUNDLE_IDENTIFIER = "com.local.voicereader";
const PLATFORM = "darwin";
const ARCHITECTURE = "arm64";
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function createMacReleaseIdentity(metadata, { root = repositoryRoot } = {}) {
  validatePackageMetadata(metadata);
  const absoluteRoot = resolve(root);
  const packageMetadata = {
    name: metadata.name,
    version: metadata.version,
    private: metadata.private,
    type: metadata.type,
    main: metadata.main
  };
  const appFileName = `${PRODUCT_NAME}.app`;
  const dmgFileName = `${PRODUCT_NAME}-${metadata.version}-${ARCHITECTURE}.dmg`;
  const releaseDirectory = join(absoluteRoot, "release/mac");
  const application = join(releaseDirectory, appFileName);
  const diskImage = join(releaseDirectory, dmgFileName);
  const packagedDescriptor = {
    name: metadata.name,
    productName: PRODUCT_NAME,
    version: metadata.version,
    type: metadata.type,
    main: metadata.main
  };
  const infoPlist = {
    CFBundleDisplayName: PRODUCT_NAME,
    CFBundleExecutable: PRODUCT_NAME,
    CFBundleIconFile: `${PRODUCT_NAME}.icns`,
    CFBundleIdentifier: BUNDLE_IDENTIFIER,
    CFBundleName: PRODUCT_NAME,
    CFBundleShortVersionString: metadata.version,
    CFBundleVersion: metadata.version
  };
  const helperBundleIdentifiers = {
    "Electron Helper.app": `${BUNDLE_IDENTIFIER}.helper`,
    "Electron Helper (GPU).app": `${BUNDLE_IDENTIFIER}.helper.gpu`,
    "Electron Helper (Plugin).app": `${BUNDLE_IDENTIFIER}.helper.plugin`,
    "Electron Helper (Renderer).app": `${BUNDLE_IDENTIFIER}.helper.renderer`
  };
  const identity = {
    package: packageMetadata,
    productName: PRODUCT_NAME,
    bundleIdentifier: BUNDLE_IDENTIFIER,
    platform: PLATFORM,
    architecture: ARCHITECTURE,
    appFileName,
    dmgFileName,
    installedAppPath: `/Applications/${appFileName}`,
    packagedDescriptor,
    infoPlist,
    helperBundleIdentifiers,
    signing: {
      designatedRequirement: `=designated => identifier "${BUNDLE_IDENTIFIER}"`,
      verificationRequirement: `identifier "${BUNDLE_IDENTIFIER}"`
    },
    paths: {
      releaseDirectory,
      application,
      diskImage,
      electronApplication: join(absoluteRoot, "node_modules/electron/dist/Electron.app"),
      iconset: join(releaseDirectory, `${PRODUCT_NAME}.iconset`),
      icon: join(releaseDirectory, `${PRODUCT_NAME}.icns`),
      iconSource: join(absoluteRoot, "assets/voicereader-icon.svg")
    },
    applicationPaths: {
      executable: `Contents/MacOS/${PRODUCT_NAME}`,
      icon: `Contents/Resources/${PRODUCT_NAME}.icns`,
      packagedDescriptor: "Contents/Resources/app/package.json",
      infoPlist: "Contents/Info.plist",
      buildProduct: "Contents/Resources/app/dist",
      nativeAddon: "Contents/Resources/app/dist/native/selection-copy-macos.node",
      frameworks: "Contents/Frameworks",
      defaultApplication: "Contents/Resources/default_app.asar"
    },
    packagingPlan: {
      platform: PLATFORM,
      arch: ARCHITECTURE,
      app: relative(absoluteRoot, application),
      dmg: relative(absoluteRoot, diskImage),
      customPackager: true,
      installsApplication: false
    }
  };
  return deepFreeze(identity);
}

export async function loadMacReleaseIdentity({ root = repositoryRoot } = {}) {
  const absoluteRoot = resolve(root);
  let metadata;
  try {
    metadata = JSON.parse(await readFile(join(absoluteRoot, "package.json"), "utf8"));
  } catch {
    throw new Error("Unable to load package metadata for macOS release identity.");
  }
  return createMacReleaseIdentity(metadata, { root: absoluteRoot });
}

function validatePackageMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new Error("Invalid package metadata for macOS release identity.");
  }
  if (metadata.name !== PACKAGE_NAME) {
    throw new Error("Invalid package name for macOS release identity.");
  }
  if (metadata.private !== true) {
    throw new Error("Invalid package private flag for macOS release identity.");
  }
  if (typeof metadata.version !== "string" || !VERSION_PATTERN.test(metadata.version)) {
    throw new Error("Invalid package version for macOS release identity.");
  }
  if (metadata.type !== PACKAGE_TYPE) {
    throw new Error("Invalid package type for macOS release identity.");
  }
  if (metadata.main !== PACKAGE_MAIN) {
    throw new Error("Invalid package main for macOS release identity.");
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
