var CookieSyncUpdate = (function() {
    var STORAGE_KEY = "updateCheck";
    var TTL_MS = 6 * 60 * 60 * 1000;
    var MIN_BACKOFF_MS = 5 * 60 * 1000;
    var LATEST_RELEASE_URL = "https://api.github.com/repos/wilsonyiyi/cookiesync/releases/latest";

    function normalizeVersion(version) {
        return String(version || "")
            .trim()
            .replace(/^v/i, "")
            .split("-")[0];
    }

    function parseVersion(version) {
        var parts = normalizeVersion(version).split(".").map(function(part) {
            var value = Number.parseInt(part, 10);
            return Number.isFinite(value) ? value : 0;
        });
        while (parts.length < 3) {
            parts.push(0);
        }
        return parts.slice(0, 3);
    }

    function compareVersions(left, right) {
        var a = parseVersion(left);
        var b = parseVersion(right);
        for (var index = 0; index < 3; index += 1) {
            if (a[index] > b[index]) {
                return 1;
            }
            if (a[index] < b[index]) {
                return -1;
            }
        }
        return 0;
    }

    function nextBackoffMs(missCount) {
        var exponent = Math.max(0, (missCount || 1) - 1);
        return Math.min(MIN_BACKOFF_MS * Math.pow(2, exponent), TTL_MS);
    }

    function delayForState(state) {
        if (!state) {
            return MIN_BACKOFF_MS;
        }
        if (typeof state.nextDelayMs === "number") {
            return state.nextDelayMs;
        }
        if (state.hasUpdate) {
            return TTL_MS;
        }
        return nextBackoffMs(state.missCount || 1);
    }

    function remainingDelayMs(state, now) {
        if (!state || typeof state.checkedAt !== "number") {
            return MIN_BACKOFF_MS;
        }
        var remaining = delayForState(state) - (now - state.checkedAt);
        return remaining > 0 ? remaining : MIN_BACKOFF_MS;
    }

    function parseLatestRelease(payload) {
        if (!payload || payload.draft || payload.prerelease || !payload.tag_name || !payload.html_url) {
            return null;
        }
        var latestVersion = normalizeVersion(payload.tag_name);
        if (!latestVersion) {
            return null;
        }
        return {
            latestVersion: latestVersion,
            releaseUrl: payload.html_url
        };
    }

    function buildUpdateState(currentVersion, latest, now, previous) {
        var latestVersion = latest && latest.latestVersion ? latest.latestVersion : "";
        var hasUpdate = Boolean(latestVersion && compareVersions(latestVersion, currentVersion) > 0);
        var sameVersion = previous && previous.currentVersion === normalizeVersion(currentVersion);
        var missCount = hasUpdate ? 0 : (sameVersion ? (previous.missCount || 0) : 0) + 1;
        return {
            checkedAt: now,
            currentVersion: normalizeVersion(currentVersion),
            latestVersion: latestVersion,
            releaseUrl: latest && latest.releaseUrl ? latest.releaseUrl : "",
            hasUpdate: hasUpdate,
            missCount: missCount,
            nextDelayMs: hasUpdate ? TTL_MS : nextBackoffMs(missCount)
        };
    }

    function hasVisibleUpdate(state, currentVersion) {
        return Boolean(
            state
            && state.releaseUrl
            && state.latestVersion
            && compareVersions(state.latestVersion, currentVersion) > 0
        );
    }

    function getUsableCache(cache, currentVersion, now, ttlMs) {
        if (!cache || cache.currentVersion !== normalizeVersion(currentVersion)) {
            return null;
        }
        if (typeof cache.checkedAt !== "number" || now - cache.checkedAt >= (ttlMs || TTL_MS)) {
            return null;
        }
        return cache;
    }

    function shouldSkipFetch(cache, currentVersion, now, options) {
        options = options || {};
        if (options.force) {
            return false;
        }
        if (!cache || cache.currentVersion !== normalizeVersion(currentVersion)) {
            return false;
        }
        if (typeof cache.checkedAt !== "number") {
            return false;
        }
        return now - cache.checkedAt < delayForState(cache);
    }

    function fetchLatestRelease(fetchImpl) {
        var fetchFn = fetchImpl || fetch;
        return fetchFn(LATEST_RELEASE_URL, {
            headers: {Accept: "application/vnd.github+json"}
        }).then(function(response) {
            if (!response.ok) {
                throw new Error("release lookup failed: " + response.status);
            }
            return response.json();
        }).then(parseLatestRelease);
    }

    return {
        STORAGE_KEY: STORAGE_KEY,
        TTL_MS: TTL_MS,
        MIN_BACKOFF_MS: MIN_BACKOFF_MS,
        LATEST_RELEASE_URL: LATEST_RELEASE_URL,
        normalizeVersion: normalizeVersion,
        compareVersions: compareVersions,
        nextBackoffMs: nextBackoffMs,
        remainingDelayMs: remainingDelayMs,
        parseLatestRelease: parseLatestRelease,
        buildUpdateState: buildUpdateState,
        hasVisibleUpdate: hasVisibleUpdate,
        getUsableCache: getUsableCache,
        shouldSkipFetch: shouldSkipFetch,
        fetchLatestRelease: fetchLatestRelease
    };
})();

if (typeof module !== "undefined" && module.exports) {
    module.exports = CookieSyncUpdate;
}
