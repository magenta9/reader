import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = resolve(root, "release/mac");
const appName = "VoiceReader";
const appPath = join(releaseDir, `${appName}.app`);
const electronAppPath = resolve(root, "node_modules/electron/dist/Electron.app");
const iconsetPath = join(releaseDir, "VoiceReader.iconset");
const iconPath = join(releaseDir, "VoiceReader.icns");
const appIconSvgPath = resolve(root, "assets/voicereader-icon.svg");

await run(process.execPath, [resolve(root, "scripts/build.mjs")], root);
await rm(appPath, { recursive: true, force: true });
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
      version: "0.1.0",
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
await verifyAppSignature();

console.log(`Packaged ${appPath}`);

async function generateIcon() {
  await rm(iconsetPath, { recursive: true, force: true });
  await rm(iconPath, { force: true });
  await mkdir(iconsetPath, { recursive: true });
  const renderedSource = join(releaseDir, "VoiceReader-icon-source.png");
  await run("/usr/bin/sips", ["-s", "format", "png", appIconSvgPath, "--out", renderedSource], root);
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

async function updateInfoPlist() {
  const plistPath = join(appPath, "Contents/Info.plist");
  let plist = await readFile(plistPath, "utf8");
  plist = replacePlistValue(plist, "CFBundleDisplayName", appName);
  plist = replacePlistValue(plist, "CFBundleExecutable", appName);
  plist = replacePlistValue(plist, "CFBundleIconFile", "VoiceReader.icns");
  plist = replacePlistValue(plist, "CFBundleIdentifier", "com.local.voicereader");
  plist = replacePlistValue(plist, "CFBundleName", appName);
  plist = replacePlistValue(plist, "CFBundleShortVersionString", "0.1.0");
  plist = replacePlistValue(plist, "CFBundleVersion", "0.1.0");
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
}

async function verifyAppSignature() {
  await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=4", appPath], root);
}

function replacePlistValue(plist, key, value) {
  return plist.replace(
    new RegExp(`(<key>${key}</key>\\s*<string>)([^<]*)(</string>)`),
    `$1${value}$3`
  );
}

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit"
    });
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
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
