const { DatabaseSync } = require("node:sqlite");
const { resolve } = require("node:path");

const addonPath = process.argv[2];
const databasePath = process.argv[3];

if (!addonPath || !databasePath) {
  throw new Error("Usage: electron-runtime-probe.cjs <addon-path> <database-path>");
}

const addon = require(resolve(addonPath));
for (const exportName of ["readSelectedText", "copySelection"]) {
  if (typeof addon[exportName] !== "function") {
    throw new Error(`Selected Text addon is missing ${exportName}`);
  }
}

const database = new DatabaseSync(databasePath);
try {
  database.exec("CREATE TABLE runtime_probe (value TEXT NOT NULL)");
  database.prepare("INSERT INTO runtime_probe (value) VALUES (?)").run("VoiceReader runtime probe");
  const row = database.prepare("SELECT value FROM runtime_probe").get();
  const count = database.prepare("SELECT COUNT(*) AS count FROM runtime_probe").get();
  process.stdout.write(
    `${JSON.stringify({
      electron: process.versions.electron,
      nodeMajor: Number.parseInt(process.versions.node.split(".")[0], 10),
      sqlite: { insertedText: row.value, rowCount: Number(count.count) },
      addonExports: Object.keys(addon).sort()
    })}\n`
  );
} finally {
  database.close();
}
