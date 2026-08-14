const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const updateCheck = require("../chrome/update-check");

test("compares dotted versions", () => {
  assert.equal(updateCheck.compareVersions("1.0.1", "1.0.0"), 1);
  assert.equal(updateCheck.compareVersions("v1.0.0", "1.0.0"), 0);
  assert.equal(updateCheck.compareVersions("1.0.0", "1.1.0"), -1);
});

test("treats a higher GitHub tag as an update", () => {
  const state = updateCheck.buildUpdateState("1.0.0", {
    latestVersion: "1.1.0",
    releaseUrl: "https://github.com/wilsonyiyi/cookiesync/releases/tag/v1.1.0"
  }, 1000);

  assert.equal(state.hasUpdate, true);
  assert.equal(updateCheck.hasVisibleUpdate(state, "1.0.0"), true);
  assert.equal(updateCheck.hasVisibleUpdate(state, "1.1.0"), false);
  assert.equal(state.missCount, 0);
  assert.equal(state.latestVersion, "1.1.0");
  assert.equal(state.currentVersion, "1.0.0");
});

test("does not prompt when current version is already newest", () => {
  const state = updateCheck.buildUpdateState("1.1.0", {
    latestVersion: "1.1.0",
    releaseUrl: "https://github.com/wilsonyiyi/cookiesync/releases/tag/v1.1.0"
  }, 1000);

  assert.equal(state.hasUpdate, false);
  assert.equal(updateCheck.hasVisibleUpdate(state, "1.1.0"), false);
  assert.equal(state.missCount, 1);
  assert.equal(state.nextDelayMs, updateCheck.MIN_BACKOFF_MS);
});

test("ignores draft and prerelease payloads", () => {
  assert.equal(updateCheck.parseLatestRelease({
    tag_name: "v9.0.0",
    html_url: "https://example.com",
    prerelease: true
  }), null);
  assert.equal(updateCheck.parseLatestRelease({
    tag_name: "v9.0.0",
    html_url: "https://example.com",
    draft: true
  }), null);
});

test("parses a GitHub latest-release payload", () => {
  const latest = updateCheck.parseLatestRelease({
    tag_name: "v1.2.3",
    html_url: "https://github.com/wilsonyiyi/cookiesync/releases/tag/v1.2.3",
    draft: false,
    prerelease: false
  });

  assert.deepEqual(latest, {
    latestVersion: "1.2.3",
    releaseUrl: "https://github.com/wilsonyiyi/cookiesync/releases/tag/v1.2.3"
  });
});

test("reuses a fresh cache for the same installed version", () => {
  const cache = updateCheck.buildUpdateState("1.0.0", {
    latestVersion: "1.1.0",
    releaseUrl: "https://example.com/v1.1.0"
  }, 1000);

  assert.equal(updateCheck.getUsableCache(cache, "v1.0.0", 1000 + 60 * 1000, updateCheck.TTL_MS), cache);
  assert.equal(updateCheck.getUsableCache(cache, "1.0.0", 1000 + updateCheck.TTL_MS, updateCheck.TTL_MS), null);
  assert.equal(updateCheck.getUsableCache(cache, "1.1.0", 1500, updateCheck.TTL_MS), null);
});

test("backs off no-update checks from 5 minutes to 6 hours", () => {
  assert.equal(updateCheck.nextBackoffMs(1), 5 * 60 * 1000);
  assert.equal(updateCheck.nextBackoffMs(2), 10 * 60 * 1000);
  assert.equal(updateCheck.nextBackoffMs(3), 20 * 60 * 1000);
  assert.equal(updateCheck.nextBackoffMs(8), updateCheck.TTL_MS);
});

test("increments miss count and delay after repeated no-update checks", () => {
  const first = updateCheck.buildUpdateState("1.0.0", {
    latestVersion: "1.0.0",
    releaseUrl: "https://example.com/v1.0.0"
  }, 1000);
  const second = updateCheck.buildUpdateState("1.0.0", {
    latestVersion: "1.0.0",
    releaseUrl: "https://example.com/v1.0.0"
  }, 2000, first);

  assert.equal(first.nextDelayMs, updateCheck.MIN_BACKOFF_MS);
  assert.equal(second.missCount, 2);
  assert.equal(second.nextDelayMs, 10 * 60 * 1000);
  assert.equal(updateCheck.shouldSkipFetch(first, "1.0.0", 1000 + 4 * 60 * 1000), true);
  assert.equal(updateCheck.shouldSkipFetch(first, "1.0.0", 1000 + 5 * 60 * 1000), false);
});

test("skips fetch when an update is already cached", () => {
  const cache = updateCheck.buildUpdateState("1.0.0", {
    latestVersion: "1.1.0",
    releaseUrl: "https://example.com/v1.1.0"
  }, 1000);

  assert.equal(cache.missCount, 0);
  assert.equal(cache.nextDelayMs, updateCheck.TTL_MS);
  assert.equal(updateCheck.shouldSkipFetch(cache, "1.0.0", 1000 + 60 * 1000), true);
  assert.equal(updateCheck.shouldSkipFetch(cache, "1.0.0", 1000 + 60 * 1000, {force: true}), false);
});

test("fetchLatestRelease reads the GitHub latest release", async () => {
  const fetchImpl = async (url, options) => {
    assert.equal(url, updateCheck.LATEST_RELEASE_URL);
    assert.equal(options.headers.Accept, "application/vnd.github+json");
    return {
      ok: true,
      json: async () => ({
        tag_name: "v2.0.0",
        html_url: "https://github.com/wilsonyiyi/cookiesync/releases/tag/v2.0.0"
      })
    };
  };

  const latest = await updateCheck.fetchLatestRelease(fetchImpl);
  assert.equal(latest.latestVersion, "2.0.0");
});

test("fetchLatestRelease fails closed on HTTP errors", async () => {
  await assert.rejects(
    () => updateCheck.fetchLatestRelease(async () => ({ok: false, status: 404})),
    /release lookup failed: 404/
  );
});

test("popup loads the update checker next to the version label", () => {
  const popup = fs.readFileSync(path.join(__dirname, "../chrome/popup.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../chrome/popup.css"), "utf8");
  const script = fs.readFileSync(path.join(__dirname, "../chrome/popup.js"), "utf8");
  assert.match(popup, /<span id="version" class="version">v[\d.]+<\/span>/);
  assert.match(popup, /<script src="update-check.js"><\/script>/);
  assert.match(popup, /id="updateLink" class="update-button" hidden/);
  assert.match(popup, /data-i18n="update"/);
  assert.match(css, /\.version\.is-checking::after/);
  assert.match(script, /updateCheckInFlight = true/);
});
