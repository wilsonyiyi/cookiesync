const fs = require("fs");
const path = require("path");

const VERSION_PATTERN = /(<span id="version" class="version">)v[\d.]+(<\/span>)/;

function readPackageVersion(rootDir) {
  const packagePath = path.join(rootDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  if (!pkg.version) {
    throw new Error("package.json is missing version");
  }
  return pkg.version;
}

function resolveVersion(rootDir, cliVersion) {
  return cliVersion || readPackageVersion(rootDir);
}

function syncManifestVersion(rootDir, version) {
  const manifestPath = path.join(rootDir, "chrome/manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.version = version;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

function syncPopupVersion(rootDir, version) {
  const popupPath = path.join(rootDir, "chrome/popup.html");
  const popup = fs.readFileSync(popupPath, "utf8");
  if (!VERSION_PATTERN.test(popup)) {
    throw new Error("popup.html is missing a version element to sync");
  }
  fs.writeFileSync(popupPath, popup.replace(VERSION_PATTERN, `$1v${version}$2`));
}

function syncVersion(rootDir, version) {
  syncManifestVersion(rootDir, version);
  syncPopupVersion(rootDir, version);
  return version;
}

function main() {
  const rootDir = path.join(__dirname, "..");
  const version = resolveVersion(rootDir, process.argv[2]);
  syncVersion(rootDir, version);
}

module.exports = {
  VERSION_PATTERN,
  readPackageVersion,
  resolveVersion,
  syncVersion
};

if (require.main === module) {
  main();
}
