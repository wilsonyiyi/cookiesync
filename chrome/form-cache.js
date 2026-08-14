var CookieSyncForm = (function() {
    var COOKIE_NAME = "cookiesync_form";
    var COOKIE_URL = "http://localhost";
    var STORAGE_KEY = "cookiesync_form";
    var KEYS = ["regexHost", "regexNames", "preferredLanguage"];

    function isLocalhostUrl(url) {
        if (!url) {
            return false;
        }
        try {
            var parsed = new URL(url);
            return parsed.protocol === "http:" && parsed.hostname === "localhost";
        } catch (error) {
            return false;
        }
    }

    function isInjectableTab(tab) {
        if (!tab || !tab.id || tab.discarded) {
            return false;
        }
        var url = tab.url || tab.pendingUrl || "";
        if (
            url.indexOf("chrome-error://") === 0 ||
            url.indexOf("chrome://") === 0 ||
            url.indexOf("about:") === 0
        ) {
            return false;
        }
        return isLocalhostUrl(url);
    }

    function isIgnorableInjectError(error) {
        var message = error && error.message ? String(error.message) : String(error || "");
        return /error page|No tab with id|cannot be scripted|Frame with ID/i.test(message);
    }

    function hasFormValues(data) {
        return Boolean(
            data && (
                (typeof data.regexHost === "string" && data.regexHost.length > 0) ||
                (typeof data.regexNames === "string" && data.regexNames.length > 0)
            )
        );
    }

    function pickForm(data) {
        data = data || {};
        return {
            regexHost: typeof data.regexHost === "string" ? data.regexHost : "",
            regexNames: typeof data.regexNames === "string" ? data.regexNames : "",
            preferredLanguage: typeof data.preferredLanguage === "string" ? data.preferredLanguage : ""
        };
    }

    function serializeForm(data) {
        return encodeURIComponent(JSON.stringify(pickForm(data)));
    }

    function parseForm(value) {
        if (!value) {
            return null;
        }
        try {
            return pickForm(JSON.parse(decodeURIComponent(value)));
        } catch (error) {
            return null;
        }
    }

    function serializeBackup(data) {
        return JSON.stringify(pickForm(data));
    }

    function parseBackup(value) {
        if (!value) {
            return null;
        }
        try {
            return pickForm(JSON.parse(value));
        } catch (error) {
            return parseForm(value);
        }
    }

    function buildSharePayload(data) {
        var form = pickForm(data);
        return {
            app: "cookiesync",
            version: 1,
            regexHost: form.regexHost,
            regexNames: form.regexNames
        };
    }

    function parseSharePayload(raw) {
        var payload = raw;
        if (typeof raw === "string") {
            try {
                payload = JSON.parse(raw);
            } catch (error) {
                return null;
            }
        }
        if (!payload || payload.app !== "cookiesync" || payload.version !== 1) {
            return null;
        }
        var form = pickForm(payload);
        if (!hasFormValues(form)) {
            return null;
        }
        return {
            regexHost: form.regexHost,
            regexNames: form.regexNames
        };
    }

    function getStorage(storageApi) {
        return storageApi || chrome.storage.local;
    }

    async function queryLocalhostTabs() {
        if (!chrome.tabs || !chrome.tabs.query) {
            return [];
        }
        try {
            var tabs = await chrome.tabs.query({url: ["http://*/*", "http://localhost/*"]});
            return tabs.filter(isInjectableTab);
        } catch (error) {
            console.warn("CookieSync query localhost tabs failed:", error);
            return [];
        }
    }

    async function sendTabMessage(tabId, message) {
        if (!chrome.tabs || !chrome.tabs.sendMessage) {
            return null;
        }
        try {
            return await chrome.tabs.sendMessage(tabId, message);
        } catch (error) {
            return null;
        }
    }

    async function writeTabBackup(tabId, value) {
        if (chrome.scripting && chrome.scripting.executeScript) {
            try {
                await chrome.scripting.executeScript({
                    target: {tabId: tabId},
                    world: "ISOLATED",
                    func: function(key, nextValue) {
                        if (nextValue == null || nextValue === "") {
                            localStorage.removeItem(key);
                        } else {
                            localStorage.setItem(key, nextValue);
                        }
                    },
                    args: [STORAGE_KEY, value]
                });
                return;
            } catch (error) {
                if (!isIgnorableInjectError(error)) {
                    console.warn("CookieSync executeScript backup failed:", tabId, error);
                }
            }
        }
        await sendTabMessage(tabId, {setFormBackup: value});
    }

    async function readTabBackup(tabId) {
        if (chrome.scripting && chrome.scripting.executeScript) {
            try {
                var results = await chrome.scripting.executeScript({
                    target: {tabId: tabId},
                    world: "ISOLATED",
                    func: function(key) {
                        return localStorage.getItem(key);
                    },
                    args: [STORAGE_KEY]
                });
                if (results && results[0] && results[0].result) {
                    return results[0].result;
                }
            } catch (error) {}
        }
        var response = await sendTabMessage(tabId, {getFormBackup: true});
        return response && response.value;
    }

    async function readLegacyCookie() {
        if (!chrome.cookies || !chrome.cookies.get) {
            return null;
        }
        var cookie = await chrome.cookies.get({
            url: COOKIE_URL,
            name: COOKIE_NAME
        });
        return parseForm(cookie && cookie.value);
    }

    async function clearLegacyCookie() {
        if (!chrome.cookies || !chrome.cookies.remove) {
            return;
        }
        try {
            await chrome.cookies.remove({
                url: COOKIE_URL,
                name: COOKIE_NAME
            });
        } catch (error) {}
    }

    var chromeBackup = {
        async read() {
            var tabs = await queryLocalhostTabs();
            for (var index = 0; index < tabs.length; index += 1) {
                var parsed = parseBackup(await readTabBackup(tabs[index].id));
                if (hasFormValues(parsed)) {
                    return parsed;
                }
            }
            return readLegacyCookie();
        },
        async write(data, tabId) {
            var value = hasFormValues(data) ? serializeBackup(data) : null;
            var written = {};
            if (tabId) {
                await writeTabBackup(tabId, value);
                written[tabId] = true;
            }
            var tabs = await queryLocalhostTabs();
            await Promise.all(tabs.map(function(tab) {
                if (written[tab.id]) {
                    return null;
                }
                return writeTabBackup(tab.id, value);
            }));
            await clearLegacyCookie();
        },
        async clearLegacyCookie() {
            return clearLegacyCookie();
        }
    };

    function getBackupApi(backupApi) {
        return backupApi || chromeBackup;
    }

    async function persistBackup(data, backup, tabId) {
        if (hasFormValues(data)) {
            await backup.write(data, tabId);
        }
        if (backup.clearLegacyCookie) {
            await backup.clearLegacyCookie();
        }
    }

    async function loadForm(storageApi, backupApi) {
        var backup = getBackupApi(backupApi);
        var stored = pickForm(await getStorage(storageApi).get(KEYS));
        if (hasFormValues(stored)) {
            await persistBackup(stored, backup);
            return stored;
        }
        var restored = await backup.read();
        if (hasFormValues(restored)) {
            await getStorage(storageApi).set(restored);
            await persistBackup(restored, backup);
            return restored;
        }
        if (backup.clearLegacyCookie) {
            await backup.clearLegacyCookie();
        }
        return stored;
    }

    async function saveForm(partial, storageApi, backupApi) {
        var storage = getStorage(storageApi);
        var backup = getBackupApi(backupApi);
        var current = pickForm(await storage.get(KEYS));
        var next = pickForm({
            regexHost: partial.regexHost != null ? partial.regexHost : current.regexHost,
            regexNames: partial.regexNames != null ? partial.regexNames : current.regexNames,
            preferredLanguage: partial.preferredLanguage != null ? partial.preferredLanguage : current.preferredLanguage
        });
        await storage.set(partial);
        await persistBackup(next, backup);
        return next;
    }

    async function applyIncomingBackup(rawValue, storageApi, backupApi, tabId) {
        var backup = getBackupApi(backupApi);
        var storage = getStorage(storageApi);
        var stored = pickForm(await storage.get(KEYS));
        if (hasFormValues(stored)) {
            await persistBackup(stored, backup, tabId);
            return {form: stored, restored: false};
        }
        var incoming = parseBackup(rawValue);
        if (!hasFormValues(incoming)) {
            incoming = await backup.read();
        }
        if (hasFormValues(incoming)) {
            await storage.set(incoming);
            await persistBackup(incoming, backup, tabId);
            return {form: incoming, restored: true};
        }
        if (backup.clearLegacyCookie) {
            await backup.clearLegacyCookie();
        }
        return {form: stored, restored: false};
    }

    return {
        COOKIE_NAME: COOKIE_NAME,
        COOKIE_URL: COOKIE_URL,
        STORAGE_KEY: STORAGE_KEY,
        KEYS: KEYS,
        isLocalhostUrl: isLocalhostUrl,
        isInjectableTab: isInjectableTab,
        hasFormValues: hasFormValues,
        serializeForm: serializeForm,
        parseForm: parseForm,
        serializeBackup: serializeBackup,
        parseBackup: parseBackup,
        buildSharePayload: buildSharePayload,
        parseSharePayload: parseSharePayload,
        loadForm: loadForm,
        saveForm: saveForm,
        applyIncomingBackup: applyIncomingBackup
    };
})();

if (typeof module !== "undefined" && module.exports) {
    module.exports = CookieSyncForm;
}
