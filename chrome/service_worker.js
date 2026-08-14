importScripts("update-check.js");
importScripts("form-cache.js");

var defaultHost = ".*\\.example\\.com";
var defaultNames = ["sessionid.*"].join('\n');

var hostsArray = [];
var namesArray = [];

async function updateRegexpes() {
    const form = await CookieSyncForm.loadForm();
    namesArray = (form.regexNames || defaultNames).split("\n");
    hostsArray = (form.regexHost || defaultHost).split("\n");
}

chrome.runtime.onConnect.addListener(port => {
    console.log("CookieSync: onConnect");
    port.onMessage.addListener(async (m) => {
        console.log("CookieSync: onMessage");
        if (m.updateHost) {
            await CookieSyncForm.saveForm({regexHost: m.updateHost});
            updateRegexpes();
        }
        if (m.updateRegexNames) {
            await CookieSyncForm.saveForm({regexNames: m.updateRegexNames});
            updateRegexpes();
        }
    });
});

function toLocalhostCookie(cookie) {
    const details = {
        url: "http://localhost",
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

async function copyCookieToLocalhost(cookie) {
    const result = await chrome.cookies.set(toLocalhostCookie(cookie));
    if (!result) {
        throw new Error(chrome.runtime.lastError?.message || `cookies.set returned empty for ${cookie.name}`);
    }
    return result;
}

async function manualSyncCookies() {
    const allCookies = await chrome.cookies.getAll({});
    let copied = 0;
    let failed = 0;

    for (const cookie of allCookies) {
        if (cookie.name === CookieSyncForm.COOKIE_NAME) {
            continue;
        }
        if (doesCookieHostMatch(cookie.domain) && doesCookieNameMatch(cookie.name)) {
            try {
                await copyCookieToLocalhost(cookie);
                copied += 1;
            } catch (setError) {
                failed += 1;
                console.warn(`Failed to set cookie ${cookie.name}:`, setError);
            }
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
                    return updateRegexpes().then(() => result);
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

chrome.cookies.onChanged.addListener((changeInfo) => {
    if (changeInfo.removed) {
        return;
    }
    const cookie = changeInfo.cookie;
    if (cookie.name === CookieSyncForm.COOKIE_NAME) {
        return;
    }
    if (cookie.domain === "localhost" || cookie.domain === ".localhost") {
        return;
    }
    if (doesCookieHostMatch(cookie.domain) && doesCookieNameMatch(cookie.name)) {
        copyCookieToLocalhost(cookie).catch((setError) => {
            console.warn(`Failed to set cookie ${cookie.name}:`, setError);
        });
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
                return updateRegexpes();
            }
        })
        .catch((error) => {
            console.warn("CookieSync form backup sync failed:", error);
        });
});

updateRegexpes();

console.log("CookieSync: installed service worker");
