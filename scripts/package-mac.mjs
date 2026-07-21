import { existsSync, lstatSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runElectronRuntimeProbe } from "./electron-runtime.mjs";
import { withLocalReleaseTransaction } from "./local-release-transaction.mjs";
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
const plistScalarValuePattern = String.raw`<(?:string|true|false|integer|real)(?:\s*/>|>[^<]*</(?:string|integer|real)>)`;

export function createPackagingPlan(identity) {
  return Object.freeze({ ...identity.packagingPlan, dmgTool: "/usr/bin/hdiutil" });
}

export const PACKAGING_PLAN = createPackagingPlan(releaseIdentity);

function transactionPackagingPaths(transaction) {
  const transactionReleaseDir = dirname(transaction.candidatePath);
  return {
    releaseDir: transactionReleaseDir,
    appPath: transaction.candidatePath,
    dmgPath: join(transactionReleaseDir, basename(dmgPath)),
    iconsetPath: join(transactionReleaseDir, basename(iconsetPath)),
    iconPath: join(transactionReleaseDir, basename(iconPath)),
    packagedApplicationRoot: dirname(
      join(transaction.candidatePath, releaseIdentity.applicationPaths.packagedDescriptor)
    )
  };
}

export async function packageMacInTransaction(transaction) {
  assertSupportedPlatform();
  const installedBefore = snapshotInstalledApplication();
  const paths = transactionPackagingPaths(transaction);
  await run(process.execPath, [resolve(root, "scripts/build.mjs")], root);
  await mkdir(paths.releaseDir, { recursive: true });
  await cp(electronAppPath, paths.appPath, { recursive: true, verbatimSymlinks: true });
  await rm(join(paths.appPath, releaseIdentity.applicationPaths.defaultApplication), { force: true });

  await generateIcon(paths);
  await cp(paths.iconPath, join(paths.appPath, releaseIdentity.applicationPaths.icon));

  await rm(paths.packagedApplicationRoot, { recursive: true, force: true });
  await mkdir(paths.packagedApplicationRoot, { recursive: true });
  await cp(resolve(root, "dist"), join(paths.appPath, releaseIdentity.applicationPaths.buildProduct), {
    recursive: true
  });
  await writeFile(
    join(paths.appPath, releaseIdentity.applicationPaths.packagedDescriptor),
    JSON.stringify(releaseIdentity.packagedDescriptor, null, 2)
  );

  await rename(
    join(paths.appPath, "Contents/MacOS/Electron"),
    join(paths.appPath, releaseIdentity.applicationPaths.executable)
  );
  await updateInfoPlist(paths.appPath);
  await updateHelperInfoPlists(paths.appPath);
  await rm(paths.iconsetPath, { recursive: true, force: true });
  await signAppBundle(paths.appPath);
  await verifyPackagedApplication(paths.appPath);
  await createDmg(paths);
  await verifyDmgOutput(paths);

  if (snapshotInstalledApplication() !== installedBefore) {
    throw new Error(`Artifact-only packaging modified ${installedAppPath}`);
  }
  let publication;
  return {
    application: appPath,
    dmg: dmgPath,
    candidate: paths.appPath,
    publish() {
      publication ??= publishVerifiedPackage(paths, transaction);
      return publication;
    }
  };
}

export async function packageMac() {
  return withLocalReleaseTransaction({ root }, async (transaction) => {
    const packaged = await packageMacInTransaction(transaction);
    await packaged.publish();
    const { application, dmg } = packaged;
    return { application, dmg };
  });
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

async function verifyPackagedApplication(application) {
  const { executable, addon } = await verifyMacApplicationStructure(application, {
    identity: releaseIdentity
  });
  await runElectronRuntimeProbe({ electronExecutable: executable, addonPath: addon });
}

async function createDmg(paths) {
  const dmgRoot = join(paths.releaseDir, ".dmg-root");
  await rm(dmgRoot, { recursive: true, force: true });
  await mkdir(dmgRoot, { recursive: true });
  await cp(paths.appPath, join(dmgRoot, basename(paths.appPath)), { recursive: true, verbatimSymlinks: true });
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
        paths.dmgPath
      ],
      root
    );
  } finally {
    await rm(dmgRoot, { recursive: true, force: true });
  }
}

async function verifyDmgOutput(paths) {
  const dmgFiles = (await readdir(paths.releaseDir)).filter((name) => name.endsWith(".dmg"));
  if (dmgFiles.length !== 1 || dmgFiles[0] !== basename(paths.dmgPath)) {
    throw new Error(`Expected exactly ${basename(paths.dmgPath)}; found ${dmgFiles.join(", ") || "none"}`);
  }
  await verifyMacDiskImage(paths.dmgPath, { identity: releaseIdentity });
}

async function publishVerifiedPackage(paths, transaction) {
  await safelyPublishRelease({
    sourceApplication: paths.appPath,
    sourceDiskImage: paths.dmgPath,
    destinationDirectory: releaseDir,
    swap: transaction.publicationSwap(releaseDir)
  });
}

export async function safelyPublishRelease({
  sourceApplication,
  sourceDiskImage,
  destinationDirectory,
  swap,
  copyPath = cp,
  renamePath = rename,
  removePath = (path) => rm(path, { recursive: true, force: true })
}) {
  const { staging, backup } = swap.paths;
  await mkdir(staging, { recursive: true });
  await copyPath(sourceApplication, join(staging, basename(sourceApplication)), {
    recursive: true,
    verbatimSymlinks: true
  });
  await copyPath(sourceDiskImage, join(staging, basename(sourceDiskImage)));

  let previousMoved = false;
  try {
    if (existsSync(destinationDirectory)) {
      await renamePath(destinationDirectory, backup);
      previousMoved = true;
    }
    await renamePath(staging, destinationDirectory);
    await swap.remove("staging", removePath);
  } catch (error) {
    const rollbackErrors = [];
    if (previousMoved && !existsSync(destinationDirectory) && existsSync(backup)) {
      try {
        await renamePath(backup, destinationDirectory);
        previousMoved = false;
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    try {
      await swap.remove("staging", removePath);
    } catch (cleanupError) {
      rollbackErrors.push(cleanupError);
    }
    if (existsSync(backup)) await swap.preserve("backup");
    const recovery = rollbackErrors.length > 0
      ? ` Publication rollback also failed: ${rollbackErrors.map(safeErrorMessage).join("; ")}.`
      : "";
    throw new Error(`Unable to publish verified macOS artifacts: ${safeErrorMessage(error)}.${recovery}`);
  }

  if (previousMoved) {
    try {
      await swap.remove("backup", removePath);
    } catch (error) {
      await swap.preserve("backup");
      throw new Error(
        `Verified macOS artifacts are published at ${destinationDirectory}, but the previous release remains at ${backup}. ` +
          `Cleanup error: ${safeErrorMessage(error)}`
      );
    }
  }
}

export async function verifyMacDiskImage(
  diskImage,
  {
    identity = releaseIdentity,
    runCommand = run,
    verifyApplication = verifyMacApplicationStructure
  } = {}
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
    if (applications.length !== 1 || applications[0] !== identity.appFileName) {
      throw new Error(
        `Expected DMG to contain exactly ${identity.appFileName}; found ${applications.join(", ") || "none"}`
      );
    }
    await verifyApplication(join(mountPoint, identity.appFileName), { identity });
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

async function generateIcon(paths) {
  await rm(paths.iconsetPath, { recursive: true, force: true });
  await rm(paths.iconPath, { force: true });
  await mkdir(paths.iconsetPath, { recursive: true });
  const renderedSource = join(paths.releaseDir, `${releaseIdentity.productName}-icon-source.png`);
  await renderAppIconSource(renderedSource, paths.releaseDir);
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
    await run("/usr/bin/sips", ["-z", String(size), String(size), renderedSource, "--out", join(paths.iconsetPath, fileName)], root);
  }
  await writeIcnsFromIconset(paths.iconsetPath, paths.iconPath);
  await rm(renderedSource, { force: true });
}

async function renderAppIconSource(renderedSource, transactionReleaseDir) {
  const quickLookOutput = join(transactionReleaseDir, `${basename(appIconSvgPath)}.png`);
  await rm(quickLookOutput, { force: true });
  await run("/usr/bin/qlmanage", ["-t", "-s", "1024", "-o", transactionReleaseDir, appIconSvgPath], root);
  await rename(quickLookOutput, renderedSource);
}

async function updateInfoPlist(application) {
  const plistPath = join(application, releaseIdentity.applicationPaths.infoPlist);
  let plist = await readFile(plistPath, "utf8");
  for (const [key, value] of Object.entries(releaseIdentity.infoPlist)) {
    plist = replacePlistValue(plist, key, value);
  }
  plist = removePlistEntry(plist, "LSUIElement");
  await writeFile(plistPath, plist);
}

async function updateHelperInfoPlists(application) {
  const frameworksPath = join(application, releaseIdentity.applicationPaths.frameworks);
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

async function signAppBundle(application) {
  await run("/usr/bin/codesign", ["--deep", "--force", "--sign", "-", application], root);
  await run(
    "/usr/bin/codesign",
    ["--force", "--sign", "-", "--requirements", releaseIdentity.signing.designatedRequirement, application],
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
