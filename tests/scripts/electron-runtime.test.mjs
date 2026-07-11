import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { runElectronRuntimeProbe } from "../../scripts/electron-runtime.mjs";

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("proves addon loading and SQLite behavior under the real Electron runtime", async () => {
  const root = mkdtempSync(join(tmpdir(), "voicereader-electron-probe-"));
  temporaryRoots.push(root);
  const addonPath = join(root, "selection-addon.cjs");
  writeFileSync(addonPath, "module.exports = { readSelectedText() {}, copySelection() {} };\n");

  const result = await runElectronRuntimeProbe({ addonPath });

  expect(result).toMatchObject({
    electron: "41.10.1",
    nodeMajor: 24,
    sqlite: { insertedText: "VoiceReader runtime probe", rowCount: 1 },
    addonExports: ["copySelection", "readSelectedText"]
  });
});

it("rejects an addon that does not expose the Selected Text contract", async () => {
  const root = mkdtempSync(join(tmpdir(), "voicereader-electron-probe-"));
  temporaryRoots.push(root);
  const addonPath = join(root, "invalid-addon.cjs");
  writeFileSync(addonPath, "module.exports = {};\n");

  await expect(runElectronRuntimeProbe({ addonPath })).rejects.toThrow(
    "Selected Text addon is missing readSelectedText"
  );
});
