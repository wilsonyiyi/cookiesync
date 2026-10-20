importScripts("update-check.js");
importScripts("form-cache.js");

var defaultHost = ".*\\.example\\.com";
var defaultNames = ["sessionid.*"].join('\n');
var lastSyncKey = "lastSyncStatus";

var hostsArray = [];
var namesArray = [];

async function updateRegexpes() {
    const form = await CookieSyncForm.loadForm();
    namesArray = (form.regexNames || defaultNames).split("\n");
    hostsArray = (form.regexHost || defaultHost).split("\n");
}

var regexpesReady = updateRegexpes();

function refreshRegexpes() {
    regexpesReady = updateRegexpes();
    return regexpesReady;
}

chrome.runtime.onConnect.addListener(port => {
    console.log("CookieSync: onConnect");
    port.onMessage.addListener(async (m) => {
        console.log("CookieSync: onMessage");
        if (m.updateHost) {
            await CookieSyncForm.saveForm({regexHost: m.updateHost});
            await refreshRegexpes();
        }
        if (m.updateRegexNames) {
            await CookieSyncForm.saveForm({regexNames: m.updateRegexNames});
            await refreshRegexpes();
        }
    });
});

function isLocalhostDomain(domain) {
    return (domain || "").replace(/^\./, "").toLowerCase() === "localhost";
}

function localhostCookieUrl(path) {
    if (!path || path === "/") {
        return "http://localhost";
    }
    return "http://localhost" + (path.startsWith("/") ? path : "/" + path);
}

function cookieDomainMatchesHost(cookie, hostname) {
    const raw = cookie.domain || "";
    const domain = raw.replace(/^\./, "").toLowerCase();
    const host = (hostname || "").toLowerCase();
    const hostOnly = cookie.hostOnly != null ? cookie.hostOnly : !raw.startsWith(".");
    if (hostOnly) {
        return host === domain;
    }
    return host === domain || host.endsWith("." + domain);
}

function cookiePathMatches(cookiePath, requestPath) {
    const path = cookiePath || "/";
    const req = requestPath || "/";
    if (path === "/") {
        return true;
    }
    if (req === path) {
        return true;
    }
    const prefix = path.endsWith("/") ? path : path + "/";
    return req.startsWith(prefix);
}

function cookieAppliesToUrl(cookie, urlString) {
    let url;
    try {
        url = new URL(urlString);
    } catch (error) {
        return false;
    }
    if (cookie.secure && url.protocol !== "https:") {
        return false;
    }
    if (!cookieDomainMatchesHost(cookie, url.hostname)) {
        return false;
    }
    return cookiePathMatches(cookie.path, url.pathname);
}

function sameCookieIdentity(a, b) {
    return a.name === b.name
        && a.domain === b.domain
        && (a.path || "/") === (b.path || "/")
        && (a.storeId || "0") === (b.storeId || "0");
}

function mostSpecificCookie(cookies) {
    return cookies.slice().sort((a, b) => {
        const pathDiff = (b.path || "/").length - (a.path || "/").length;
        if (pathDiff) {
            return pathDiff;
        }
        if (Boolean(a.hostOnly) !== Boolean(b.hostOnly)) {
            return a.hostOnly ? -1 : 1;
        }
        return 0;
    })[0];
}

function chooseCookiesToSync(cookies, preferredUrls) {
    const groups = new Map();
    for (const cookie of cookies) {
        if (!cookie || cookie.name === CookieSyncForm.COOKIE_NAME || isLocalhostDomain(cookie.domain)) {
            continue;
        }
        if (!doesCookieHostMatch(cookie.domain) || !doesCookieNameMatch(cookie.name)) {
            continue;
        }
        const list = groups.get(cookie.name) || [];
        list.push(cookie);
        groups.set(cookie.name, list);
    }

    const chosen = [];
    for (const list of groups.values()) {
        let pick = null;
        for (const url of preferredUrls || []) {
            const applicable = list.filter((cookie) => cookieAppliesToUrl(cookie, url));
            if (applicable.length) {
                pick = mostSpecificCookie(applicable);
                break;
            }
        }
        if (!pick && list.length === 1) {
            pick = list[0];
        }
        if (pick) {
            chosen.push(pick);
        }
    }
    return chosen;
}

async function getPreferredSourceUrls() {
    if (!chrome.tabs || !chrome.tabs.query) {
        return [];
    }
    const [tabs, focused] = await Promise.all([
        chrome.tabs.query({}),
        chrome.tabs.query({active: true, lastFocusedWindow: true})
    ]);
    const matching = [];
    for (const tab of tabs) {
        if (!tab.url || CookieSyncForm.isLocalhostUrl(tab.url)) {
            continue;
        }
        let hostname = "";
        try {
            hostname = new URL(tab.url).hostname;
        } catch (error) {
            continue;
        }
        if (!hostname || !doesCookieHostMatch(hostname)) {
            continue;
        }
        matching.push(tab);
    }
    matching.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    const focusedTab = focused && focused[0];
    if (focusedTab && matching.some((tab) => tab.id === focusedTab.id)) {
        return [focusedTab.url].concat(
            matching.filter((tab) => tab.id !== focusedTab.id).map((tab) => tab.url)
        );
    }
    return matching.map((tab) => tab.url);
}

function toLocalhostCookie(cookie) {
    const details = {
        url: localhostCookieUrl(cookie.path),
        name: cookie.name,
        value: cookie.value,
        path: cookie.path || "/",
        httpOnly: cookie.httpOnly,
        secure: false
    };
    if (cookie.sameSite && cookie.sameSite !== "unspecified") {
        details.sameSite = cookie.sameSite === "no_restriction" ? "lax" : cookie.sameSite;
    }
    if (cookie.expirationDate) {
        details.expirationDate = cookie.expirationDate;
    }
    return details;
}

async function removeLocalhostCookies(name, storeId) {
    if (!chrome.cookies.getAll || !chrome.cookies.remove) {
        return;
    }
    const existing = await chrome.cookies.getAll({name: name});
    for (const cookie of existing) {
        if (!isLocalhostDomain(cookie.domain)) {
            continue;
        }
        if (storeId && cookie.storeId && cookie.storeId !== storeId) {
            continue;
        }
        const details = {
            url: (cookie.secure ? "https://localhost" : "http://localhost") + (cookie.path && cookie.path !== "/" ? cookie.path : "/"),
            name: cookie.name
        };
        if (cookie.storeId) {
            details.storeId = cookie.storeId;
        }
        await chrome.cookies.remove(details);
    }
}

async function copyCookieToLocalhost(cookie) {
    await removeLocalhostCookies(cookie.name, cookie.storeId);
    const result = await chrome.cookies.set(toLocalhostCookie(cookie));
    if (!result) {
        throw new Error(chrome.runtime.lastError?.message || `cookies.set returned empty for ${cookie.name}`);
    }
    return result;
}

async function syncChangedCookie(cookie) {
    try {
        await copyCookieToLocalhost(cookie);
        await chrome.storage.local.set({
            [lastSyncKey]: {
                type: "success",
                copied: 1,
                failed: 0,
                timestamp: Date.now(),
                error: ""
            }
        });
    } catch (setError) {
        await chrome.storage.local.set({
            [lastSyncKey]: {
                type: "error",
                copied: 0,
                failed: 1,
                timestamp: Date.now(),
                error: setError.message || String(setError)
            }
        });
        console.warn("Failed to set cookie " + cookie.name + ":", setError);
    }
}

async function cookieForChange(cookie) {
    if (!cookie || cookie.name === CookieSyncForm.COOKIE_NAME || isLocalhostDomain(cookie.domain)) {
        return null;
    }
    await regexpesReady;
    if (!doesCookieHostMatch(cookie.domain) || !doesCookieNameMatch(cookie.name)) {
        return null;
    }
    const preferredUrls = await getPreferredSourceUrls();
    if (!preferredUrls.length) {
        return cookie;
    }
    const sameName = await chrome.cookies.getAll({name: cookie.name});
    const winner = chooseCookiesToSync(sameName, preferredUrls)
        .find((item) => item.name === cookie.name);
    if (!winner || !sameCookieIdentity(winner, cookie)) {
        return null;
    }
    return winner;
}

async function manualSyncCookies() {
    await regexpesReady;
    const allCookies = await chrome.cookies.getAll({});
    const selected = chooseCookiesToSync(allCookies, await getPreferredSourceUrls());
    let copied = 0;
    let failed = 0;

    for (const cookie of selected) {
        try {
            await copyCookieToLocalhost(cookie);
            copied += 1;
        } catch (setError) {
            failed += 1;
            console.warn(`Failed to set cookie ${cookie.name}:`, setError);
        }
    }

    console.log(`Manual sync completed. Copied ${copied}, failed ${failed}, scanned ${allCookies.length}.`);
    return {copied, failed};
}

async function runUpdateCheck(force) {
    const currentVersion = chrome.runtime.getManifest().version;
    const stored = await chrome.storage.local.get(CookieSyncUpdate.STORAGE_KEY);
    const cache = stored[CookieSyncUpdate.STORAGE_KEY];
    const now = Date.now();
    if (CookieSyncUpdate.shouldSkipFetch(cache, currentVersion, now, {force: Boolean(force)})) {
        await scheduleNextCheck(cache, now);
        return cache;
    }
    try {
        const latest = await CookieSyncUpdate.fetchLatestRelease();
        const state = CookieSyncUpdate.buildUpdateState(currentVersion, latest, Date.now(), cache);
        await chrome.storage.local.set({[CookieSyncUpdate.STORAGE_KEY]: state});
        await scheduleNextCheck(state, state.checkedAt);
        console.log("CookieSync update check", state);
        return state;
    } catch (error) {
        console.warn("CookieSync update check failed:", error);
        await scheduleNextCheck({
            checkedAt: now,
            nextDelayMs: CookieSyncUpdate.MIN_BACKOFF_MS
        }, now);
        return cache || null;
    }
}

async function scheduleNextCheck(state, now) {
    const delayMs = CookieSyncUpdate.remainingDelayMs(state, now || Date.now());
    await chrome.alarms.clear("cookiesync-update-check");
    chrome.alarms.create("cookiesync-update-check", {
        delayInMinutes: Math.max(1, delayMs / 60000)
    });
}

chrome.runtime.onInstalled.addListener(() => {
    runUpdateCheck(true);
});

chrome.runtime.onStartup.addListener(() => {
    runUpdateCheck(false);
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "cookiesync-update-check") {
        runUpdateCheck(false);
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.manualSync) {
        manualSyncCookies()
            .then((result) => sendResponse(result))
            .catch((error) => {
                console.error('Error during manual sync:', error);
                sendResponse({copied: 0, failed: 0, error: error.message});
            });
        return true;
    }
    if (message.checkUpdate) {
        runUpdateCheck(Boolean(message.force))
            .then((state) => sendResponse({ok: true, state: state || null}))
            .catch((error) => sendResponse({ok: false, error: error.message}));
        return true;
    }
    if (Object.prototype.hasOwnProperty.call(message, "formBackup")) {
        var tabId = sender && sender.tab && sender.tab.id;
        CookieSyncForm.applyIncomingBackup(message.formBackup, null, null, tabId)
            .then((result) => {
                if (result.restored) {
                    return refreshRegexpes().then(() => result);
                }
                return result;
            })
            .then((result) => sendResponse({
                ok: true,
                restored: result.restored,
                value: CookieSyncForm.hasFormValues(result.form)
                    ? CookieSyncForm.serializeBackup(result.form)
                    : null
            }))
            .catch((error) => sendResponse({ok: false, error: error.message}));
        return true;
    }
});

chrome.cookies.onChanged.addListener(async (changeInfo) => {
    if (changeInfo.removed) {
        return;
    }
    const cookie = await cookieForChange(changeInfo.cookie);
    if (cookie) {
        syncChangedCookie(cookie);
    }
});

function doesCookieHostMatch(cookiehost) {
    return hostsArray.some(regex => regex && new RegExp(regex).test(cookiehost));
}

function doesCookieNameMatch(name) {
    return namesArray.some(regex => new RegExp(regex).test(name));
}

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (changeInfo.status !== "complete" || !CookieSyncForm.isLocalhostUrl(tab && tab.url)) {
        return;
    }
    CookieSyncForm.applyIncomingBackup(null, null, null, tab.id)
        .then((result) => {
            if (result.restored) {
                return refreshRegexpes();
            }
        })
        .catch((error) => {
            console.warn("CookieSync form backup sync failed:", error);
        });
});

console.log("CookieSync: installed service worker");
