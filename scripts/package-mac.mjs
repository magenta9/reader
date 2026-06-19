import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = resolve(root, "release/mac");
const appName = "VoiceReader";
const appPath = join(releaseDir, `${appName}.app`);
const electronAppPath = resolve(root, "node_modules/electron/dist/Electron.app");
const iconsetPath = join(releaseDir, "VoiceReader.iconset");
const iconPath = join(releaseDir, "VoiceReader.icns");

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
await rm(iconsetPath, { recursive: true, force: true });
await signAppBundle();
await verifyAppSignature();

console.log(`Packaged ${appPath}`);

async function generateIcon() {
  await rm(iconsetPath, { recursive: true, force: true });
  await rm(iconPath, { force: true });
  await mkdir(iconsetPath, { recursive: true });
  const renderedSource = join(releaseDir, "VoiceReader-icon-source.png");
  await writeFile(renderedSource, createAppIconPng(1024));
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

async function signAppBundle() {
  await run("/usr/bin/codesign", ["--force", "--sign", "-", appPath], root);
}

async function verifyAppSignature() {
  await run("/usr/bin/codesign", ["--verify", "--strict", "--verbose=4", appPath], root);
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

function createAppIconPng(size) {
  const rows = [];
  const radius = size * 0.226;
  const center = size / 2;
  const circleRadius = size * 0.332;
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  let offset = 0;
  for (let y = 0; y < size; y += 1) {
    pixels[offset] = 0;
    offset += 1;
    for (let x = 0; x < size; x += 1) {
      const inside = roundedRectContains(x, y, size, radius);
      const gradient = x / size * 0.55 + y / size * 0.45;
      const base = gradientColor(gradient);
      let r = base[0];
      let g = base[1];
      let b = base[2];
      let a = inside ? 255 : 0;
      const dx = x - center;
      const dy = y - center;
      if (inside && Math.sqrt(dx * dx + dy * dy) < circleRadius) {
        r = mix(r, 255, 0.14);
        g = mix(g, 255, 0.14);
        b = mix(b, 255, 0.14);
      }
      if (inside && isWhiteGlyph(x, y, size)) {
        r = 255;
        g = 255;
        b = 255;
        a = 255;
      }
      pixels[offset] = r;
      pixels[offset + 1] = g;
      pixels[offset + 2] = b;
      pixels[offset + 3] = a;
      offset += 4;
    }
  }
  rows.push(pngChunk("IHDR", Buffer.concat([uint32(size), uint32(size), Buffer.from([8, 6, 0, 0, 0])])));
  rows.push(pngChunk("IDAT", deflateSync(pixels)));
  rows.push(pngChunk("IEND", Buffer.alloc(0)));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...rows]);
}

function roundedRectContains(x, y, size, radius) {
  const max = size - 1;
  const cx = x < radius ? radius : x > max - radius ? max - radius : x;
  const cy = y < radius ? radius : y > max - radius ? max - radius : y;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function gradientColor(t) {
  if (t < 0.48) return lerpColor([47, 107, 255], [17, 168, 123], t / 0.48);
  return lerpColor([17, 168, 123], [244, 182, 63], (t - 0.48) / 0.52);
}

function lerpColor(a, b, t) {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function isWhiteGlyph(x, y, size) {
  const speaker =
    x >= size * 0.27 &&
    x <= size * 0.43 &&
    y >= size * 0.4 &&
    y <= size * 0.6 &&
    x <= size * 0.34 + Math.abs(y - size * 0.5) * 0.8;
  const barA = roundedVerticalBar(x, y, size * 0.49, size * 0.5, size * 0.056, size * 0.39);
  const barB = roundedVerticalBar(x, y, size * 0.6, size * 0.5, size * 0.062, size * 0.52);
  const barC = roundedVerticalBar(x, y, size * 0.71, size * 0.5, size * 0.056, size * 0.29);
  return speaker || barA || barB || barC;
}

function roundedVerticalBar(x, y, cx, cy, width, height) {
  const radius = width / 2;
  const top = cy - height / 2 + radius;
  const bottom = cy + height / 2 - radius;
  const closestY = y < top ? top : y > bottom ? bottom : y;
  const dx = x - cx;
  const dy = y - closestY;
  return dx * dx + dy * dy <= radius * radius;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  return Buffer.concat([uint32(data.length), typeBuffer, data, uint32(crc32(Buffer.concat([typeBuffer, data])))]);
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
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
