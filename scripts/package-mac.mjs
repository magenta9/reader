import { existsSync, lstatSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runElectronRuntimeProbe } from "./electron-runtime.mjs";
import { loadMacReleaseIdentity } from "./release-identity.mjs";
import { assertCommand, spawnCommand } from "./spawn-command.mjs";
import { verifyMacApplicationStructure } from "./verify-mac-app.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseIdentity = await loadMacReleaseIdentity({ root });
const releaseDir = releaseIdentity.paths.releaseDirectory;
const appPath = releaseIdentity.paths.application;
const dmgPath = releaseIdentity.paths.diskImage;
const installedAppPath = releaseIdentity.installedAppPath;
const electronAppPath = releaseIdentity.paths.electronApplication;
const iconsetPath = releaseIdentity.paths.iconset;
const iconPath = releaseIdentity.paths.icon;
const appIconSvgPath = releaseIdentity.paths.iconSource;
const packagedApplicationRoot = dirname(
  join(appPath, releaseIdentity.applicationPaths.packagedDescriptor)
);
const plistScalarValuePattern = String.raw`<(?:string|true|false|integer|real)(?:\s*/>|>[^<]*</(?:string|integer|real)>)`;

export function createPackagingPlan(identity) {
  return Object.freeze({ ...identity.packagingPlan, dmgTool: "/usr/bin/hdiutil" });
}

export const PACKAGING_PLAN = createPackagingPlan(releaseIdentity);

export async function packageMac() {
  assertSupportedPlatform();
  const installedBefore = snapshotInstalledApplication();
  await rm(releaseDir, { recursive: true, force: true });
  await run(process.execPath, [resolve(root, "scripts/build.mjs")], root);
  await mkdir(releaseDir, { recursive: true });
  await cp(electronAppPath, appPath, { recursive: true, verbatimSymlinks: true });
  await rm(join(appPath, releaseIdentity.applicationPaths.defaultApplication), { force: true });

  await generateIcon();
  await cp(iconPath, join(appPath, releaseIdentity.applicationPaths.icon));

  await rm(packagedApplicationRoot, { recursive: true, force: true });
  await mkdir(packagedApplicationRoot, { recursive: true });
  await cp(resolve(root, "dist"), join(appPath, releaseIdentity.applicationPaths.buildProduct), {
    recursive: true
  });
  await writeFile(
    join(appPath, releaseIdentity.applicationPaths.packagedDescriptor),
    JSON.stringify(releaseIdentity.packagedDescriptor, null, 2)
  );

  await rename(join(appPath, "Contents/MacOS/Electron"), join(appPath, releaseIdentity.applicationPaths.executable));
  await updateInfoPlist();
  await updateHelperInfoPlists();
  await rm(iconsetPath, { recursive: true, force: true });
  await signAppBundle();
  await verifyPackagedApplication();
  await createDmg();
  await verifyDmgOutput();

  if (snapshotInstalledApplication() !== installedBefore) {
    throw new Error(`Artifact-only packaging modified ${installedAppPath}`);
  }
  return { application: appPath, dmg: dmgPath };
}

function assertSupportedPlatform() {
  if (process.platform !== PACKAGING_PLAN.platform || process.arch !== PACKAGING_PLAN.arch) {
    throw new Error(
      `${releaseIdentity.productName} packaging supports ${releaseIdentity.platform} ${releaseIdentity.architecture} only; received ${process.platform} ${process.arch}`
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
      [
        "create",
        "-volname",
        releaseIdentity.productName,
        "-srcfolder",
        dmgRoot,
        "-ov",
        "-format",
        "UDZO",
        dmgPath
      ],
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
    if (applications.length !== 1 || applications[0] !== releaseIdentity.appFileName) {
      throw new Error(
        `Expected DMG to contain exactly ${releaseIdentity.appFileName}; found ${applications.join(", ") || "none"}`
      );
    }
    await verifyApplication(join(mountPoint, releaseIdentity.appFileName));
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
  const renderedSource = join(releaseDir, `${releaseIdentity.productName}-icon-source.png`);
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
  const quickLookOutput = join(releaseDir, `${basename(appIconSvgPath)}.png`);
  await rm(quickLookOutput, { force: true });
  await run("/usr/bin/qlmanage", ["-t", "-s", "1024", "-o", releaseDir, appIconSvgPath], root);
  await rename(quickLookOutput, renderedSource);
}

async function updateInfoPlist() {
  const plistPath = join(appPath, releaseIdentity.applicationPaths.infoPlist);
  let plist = await readFile(plistPath, "utf8");
  for (const [key, value] of Object.entries(releaseIdentity.infoPlist)) {
    plist = replacePlistValue(plist, key, value);
  }
  plist = removePlistEntry(plist, "LSUIElement");
  await writeFile(plistPath, plist);
}

async function updateHelperInfoPlists() {
  const frameworksPath = join(appPath, releaseIdentity.applicationPaths.frameworks);
  const helperApps = await readdir(frameworksPath);
  for (const helperApp of helperApps.filter((name) => name.startsWith("Electron Helper") && name.endsWith(".app"))) {
    const plistPath = join(frameworksPath, helperApp, "Contents/Info.plist");
    let plist = await readFile(plistPath, "utf8");
    const identifier = releaseIdentity.helperBundleIdentifiers[helperApp];
    if (!identifier) throw new Error(`Unexpected Electron helper application: ${helperApp}`);
    plist = replacePlistValue(plist, "CFBundleIdentifier", identifier);
    await writeFile(plistPath, plist);
  }
}

async function signAppBundle() {
  await run("/usr/bin/codesign", ["--deep", "--force", "--sign", "-", appPath], root);
  await run(
    "/usr/bin/codesign",
    ["--force", "--sign", "-", "--requirements", releaseIdentity.signing.designatedRequirement, appPath],
    root
  );
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
