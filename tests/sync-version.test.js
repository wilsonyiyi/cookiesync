const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { resolveVersion, syncVersion } = require("../scripts/sync-version");

function createWorkspace(version) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "cookiesync-version-"));
  fs.mkdirSync(path.join(rootDir, "chrome"));
  fs.writeFileSync(
    path.join(rootDir, "package.json"),
    JSON.stringify({ name: "cookiesync", version }, null, 2) + "\n"
  );
  fs.writeFileSync(
    path.join(rootDir, "chrome/manifest.json"),
    JSON.stringify({
      manifest_version: 3,
      name: "CookieSync",
      version: "0.0.0"
    }, null, 2) + "\n"
  );
  fs.writeFileSync(
    path.join(rootDir, "chrome/popup.html"),
    '<span id="version" class="version">v0.0.0</span>\n'
  );
  return rootDir;
}

test("syncs package version into manifest and popup", () => {
  const rootDir = createWorkspace("2.2.0");

  const version = syncVersion(rootDir, "2.2.0");
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, "chrome/manifest.json"), "utf8"));
  const popup = fs.readFileSync(path.join(rootDir, "chrome/popup.html"), "utf8");

  assert.equal(version, "2.2.0");
  assert.equal(manifest.version, "2.2.0");
  assert.equal(popup.includes('id="version" class="version">v2.2.0</span>'), true);
});

test("prefers the CLI version over package.json", () => {
  const rootDir = createWorkspace("2.1.0");
  assert.equal(resolveVersion(rootDir, "2.2.0"), "2.2.0");
  assert.equal(resolveVersion(rootDir), "2.1.0");
});

test("throws when popup version element is missing", () => {
  const rootDir = createWorkspace("2.2.0");
  fs.writeFileSync(path.join(rootDir, "chrome/popup.html"), "<footer></footer>\n");

  assert.throws(
    () => syncVersion(rootDir, "2.2.0"),
    /missing a version element/
  );
});
