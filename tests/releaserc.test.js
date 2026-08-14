const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

function loadReleaseConfig() {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, "../.releaserc.json"), "utf8")
  );
}

function getPluginConfig(config, pluginName) {
  const entry = config.plugins.find((plugin) =>
    Array.isArray(plugin) ? plugin[0] === pluginName : plugin === pluginName
  );
  assert.ok(entry, `missing plugin ${pluginName}`);
  return Array.isArray(entry) ? entry[1] : {};
}

test("github plugin skips PR comments that 404 on fork history", () => {
  const github = getPluginConfig(loadReleaseConfig(), "@semantic-release/github");

  assert.equal(github.successCommentCondition, false);
  assert.equal(github.failCommentCondition, false);
  assert.equal(github.assets[0].path, "cookiesync-chrome.zip");
});
