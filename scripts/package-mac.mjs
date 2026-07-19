import { existsSync, lstatSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, relative, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runElectronRuntimeProbe } from "./electron-runtime.mjs";
import { assertCommand, spawnCommand } from "./spawn-command.mjs";
import { verifyMacApplicationStructure } from "./verify-mac-app.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = resolve(root, "release/mac");
const appName = "VoiceReader";
const appVersion = "0.1.0";
const appPath = join(releaseDir, `${appName}.app`);
const dmgPath = join(releaseDir, `${appName}-${appVersion}-arm64.dmg`);
const installedAppPath = "/Applications/VoiceReader.app";
const electronAppPath = resolve(root, "node_modules/electron/dist/Electron.app");
const iconsetPath = join(releaseDir, "VoiceReader.iconset");
const iconPath = join(releaseDir, "VoiceReader.icns");
const appIconSvgPath = resolve(root, "assets/voicereader-icon.svg");
const appBundleIdentifier = "com.local.voicereader";
const appDesignatedRequirement = `=designated => identifier "${appBundleIdentifier}"`;
const plistScalarValuePattern = String.raw`<(?:string|true|false|integer|real)(?:\s*/>|>[^<]*</(?:string|integer|real)>)`;

export const PACKAGING_PLAN = {
  platform: "darwin",
  arch: "arm64",
  app: relative(root, appPath),
  dmg: relative(root, dmgPath),
  dmgTool: "/usr/bin/hdiutil",
  customPackager: true,
  installsApplication: false
};

export async function packageMac() {
  assertSupportedPlatform();
  const installedBefore = snapshotInstalledApplication();
  await rm(releaseDir, { recursive: true, force: true });
  await run(process.execPath, [resolve(root, "scripts/build.mjs")], root);
  await mkdir(releaseDir, { recursive: true });
  await cp(electronAppPath, appPath, { recursive: true, verbatimSymlinks: true });
  await rm(join(appPath, "Contents/Resources/default_app.asar"), { force: true });

  await generateIcon();
  await cp(iconPath, join(appPath, "Contents/Resources/VoiceReader.icns"));

  await rm(join(appPath, "Contents/Resources/app"), { recursive: true, force: true });
  await mkdir(join(appPath, "Contents/Resources/app"), { recursive: true });
  await cp(resolve(root, "dist"), join(appPath, "Contents/Resources/app/dist"), { recursive: true });
  await writeFile(
    join(appPath, "Contents/Resources/app/package.json"),
    JSON.stringify(
      {
        name: "voicereader",
        productName: appName,
        version: appVersion,
        type: "module",
        main: "dist/main/main.js"
      },
      null,
      2
    )
  );

  await rename(join(appPath, "Contents/MacOS/Electron"), join(appPath, `Contents/MacOS/${appName}`));
  await updateInfoPlist();
  await updateHelperInfoPlists();
  await rm(iconsetPath, { recursive: true, force: true });
  await signAppBundle();
  await verifyPackagedApplication();
  await createDmg();
  await verifyDmgOutput();

  if (snapshotInstalledApplication() !== installedBefore) {
    throw new Error("Artifact-only packaging modified /Applications/VoiceReader.app");
  }
  return { application: appPath, dmg: dmgPath };
}

function assertSupportedPlatform() {
  if (process.platform !== PACKAGING_PLAN.platform || process.arch !== PACKAGING_PLAN.arch) {
    throw new Error(
      `VoiceReader packaging supports darwin arm64 only; received ${process.platform} ${process.arch}`
    );
  }
}

function snapshotInstalledApplication() {
  if (!existsSync(installedAppPath)) return null;
  const stat = lstatSync(installedAppPath, { bigint: true });
  return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}`;
}

async function verifyPackagedApplication() {
  const { executable, addon } = await verifyMacApplicationStructure(appPath);
  await runElectronRuntimeProbe({ electronExecutable: executable, addonPath: addon });
}

async function createDmg() {
  const dmgRoot = join(releaseDir, ".dmg-root");
  await rm(dmgRoot, { recursive: true, force: true });
  await mkdir(dmgRoot, { recursive: true });
  await cp(appPath, join(dmgRoot, basename(appPath)), { recursive: true, verbatimSymlinks: true });
  try {
    await run(
      PACKAGING_PLAN.dmgTool,
      ["create", "-volname", appName, "-srcfolder", dmgRoot, "-ov", "-format", "UDZO", dmgPath],
      root
    );
  } finally {
    await rm(dmgRoot, { recursive: true, force: true });
  }
}

async function verifyDmgOutput() {
  const dmgFiles = (await readdir(releaseDir)).filter((name) => name.endsWith(".dmg"));
  if (dmgFiles.length !== 1 || dmgFiles[0] !== basename(dmgPath)) {
    throw new Error(`Expected exactly ${basename(dmgPath)}; found ${dmgFiles.join(", ") || "none"}`);
  }
  await verifyMacDiskImage(dmgPath);
}

export async function verifyMacDiskImage(
  diskImage,
  { runCommand = run, verifyApplication = verifyMacApplicationStructure } = {}
) {
  if (!existsSync(diskImage)) throw new Error(`Disk image is missing: ${diskImage}`);
  const mountPoint = await mkdtemp(join(tmpdir(), "voicereader-dmg-"));
  let mounted = false;
  let verificationFailure;
  try {
    await runCommand(PACKAGING_PLAN.dmgTool, ["verify", diskImage], root);
    await runCommand(
      PACKAGING_PLAN.dmgTool,
      ["attach", "-readonly", "-nobrowse", "-mountpoint", mountPoint, diskImage],
      root
    );
    mounted = true;
    const applications = (await readdir(mountPoint)).filter((name) => name.endsWith(".app"));
    if (applications.length !== 1 || applications[0] !== `${appName}.app`) {
      throw new Error(`Expected DMG to contain exactly ${appName}.app; found ${applications.join(", ") || "none"}`);
    }
    await verifyApplication(join(mountPoint, `${appName}.app`));
  } catch (error) {
    verificationFailure = error;
  }

  const cleanupFailures = [];
  if (mounted) {
    try {
      await runCommand(PACKAGING_PLAN.dmgTool, ["detach", mountPoint], root);
    } catch (error) {
      cleanupFailures.push(error);
    }
  }
  try {
    await rm(mountPoint, { recursive: true, force: true });
  } catch (error) {
    cleanupFailures.push(error);
  }

  if (verificationFailure && cleanupFailures.length > 0) {
    throw new AggregateError(
      [verificationFailure, ...cleanupFailures],
      `DMG verification failed: ${safeErrorMessage(verificationFailure)}; cleanup failed: ${cleanupFailures
        .map(safeErrorMessage)
        .join("; ")}`
    );
  }
  if (verificationFailure) throw verificationFailure;
  if (cleanupFailures.length === 1) throw cleanupFailures[0];
  if (cleanupFailures.length > 1) throw new AggregateError(cleanupFailures, "DMG cleanup failed");
}

function safeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function generateIcon() {
  await rm(iconsetPath, { recursive: true, force: true });
  await rm(iconPath, { force: true });
  await mkdir(iconsetPath, { recursive: true });
  const renderedSource = join(releaseDir, "VoiceReader-icon-source.png");
  await renderAppIconSource(renderedSource);
  const sizes = [
    [16, "icon_16x16.png"],
    [32, "icon_16x16@2x.png"],
    [32, "icon_32x32.png"],
    [64, "icon_32x32@2x.png"],
    [128, "icon_128x128.png"],
    [256, "icon_128x128@2x.png"],
    [256, "icon_256x256.png"],
    [512, "icon_256x256@2x.png"],
    [512, "icon_512x512.png"],
    [1024, "icon_512x512@2x.png"]
  ];
  for (const [size, fileName] of sizes) {
    await run("/usr/bin/sips", ["-z", String(size), String(size), renderedSource, "--out", join(iconsetPath, fileName)], root);
  }
  await writeIcnsFromIconset(iconsetPath, iconPath);
  await rm(renderedSource, { force: true });
}

async function renderAppIconSource(renderedSource) {
  const quickLookOutput = join(releaseDir, "voicereader-icon.svg.png");
  await rm(quickLookOutput, { force: true });
  await run("/usr/bin/qlmanage", ["-t", "-s", "1024", "-o", releaseDir, appIconSvgPath], root);
  await rename(quickLookOutput, renderedSource);
}

async function updateInfoPlist() {
  const plistPath = join(appPath, "Contents/Info.plist");
  let plist = await readFile(plistPath, "utf8");
  plist = replacePlistValue(plist, "CFBundleDisplayName", appName);
  plist = replacePlistValue(plist, "CFBundleExecutable", appName);
  plist = replacePlistValue(plist, "CFBundleIconFile", "VoiceReader.icns");
  plist = replacePlistValue(plist, "CFBundleIdentifier", appBundleIdentifier);
  plist = replacePlistValue(plist, "CFBundleName", appName);
  plist = replacePlistValue(plist, "CFBundleShortVersionString", appVersion);
  plist = replacePlistValue(plist, "CFBundleVersion", appVersion);
  plist = removePlistEntry(plist, "LSUIElement");
  await writeFile(plistPath, plist);
}

async function updateHelperInfoPlists() {
  const frameworksPath = join(appPath, "Contents/Frameworks");
  const helperApps = await readdir(frameworksPath);
  for (const helperApp of helperApps.filter((name) => name.startsWith("Electron Helper") && name.endsWith(".app"))) {
    const plistPath = join(frameworksPath, helperApp, "Contents/Info.plist");
    let plist = await readFile(plistPath, "utf8");
    plist = replacePlistValue(plist, "CFBundleIdentifier", helperBundleIdentifier(helperApp));
    await writeFile(plistPath, plist);
  }
}

function helperBundleIdentifier(helperApp) {
  if (helperApp.includes("(Renderer)")) return "com.local.voicereader.helper.renderer";
  if (helperApp.includes("(GPU)")) return "com.local.voicereader.helper.gpu";
  if (helperApp.includes("(Plugin)")) return "com.local.voicereader.helper.plugin";
  return "com.local.voicereader.helper";
}

async function signAppBundle() {
  await run("/usr/bin/codesign", ["--deep", "--force", "--sign", "-", appPath], root);
  await run("/usr/bin/codesign", ["--force", "--sign", "-", "--requirements", appDesignatedRequirement, appPath], root);
}

function replacePlistValue(plist, key, value) {
  return plist.replace(
    new RegExp(`(<key>${key}</key>\\s*<string>)([^<]*)(</string>)`),
    `$1${value}$3`
  );
}

function removePlistEntry(plist, key) {
  const entryPattern = String.raw`\s*<key>${key}</key>\s*${plistScalarValuePattern}`;
  return plist.replace(
    new RegExp(entryPattern, "g"),
    ""
  );
}

function run(command, args, cwd) {
  return spawnCommand(command, args, { cwd }).then((result) => assertCommand(result, command));
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

async function writeIcnsFromIconset(iconset, outputPath) {
  const entries = [
    ["icp4", "icon_16x16.png"],
    ["icp5", "icon_32x32.png"],
    ["icp6", "icon_32x32@2x.png"],
    ["ic07", "icon_128x128.png"],
    ["ic08", "icon_256x256.png"],
    ["ic09", "icon_512x512.png"],
    ["ic10", "icon_512x512@2x.png"]
  ];
  const chunks = [];
  let totalLength = 8;
  for (const [type, fileName] of entries) {
    const data = await readFile(join(iconset, fileName));
    const chunk = Buffer.concat([Buffer.from(type), uint32(data.length + 8), data]);
    chunks.push(chunk);
    totalLength += chunk.length;
  }
  await writeFile(outputPath, Buffer.concat([Buffer.from("icns"), uint32(totalLength), ...chunks]));
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.length === 1 && argv[0] === "plan") {
    process.stdout.write(`${JSON.stringify(PACKAGING_PLAN)}\n`);
    return;
  }
  if (argv.length > 0) throw new Error("Usage: package-mac.mjs [plan]");
  const output = await packageMac();
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
