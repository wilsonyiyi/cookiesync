var CookieSyncForm = (function() {
    var COOKIE_NAME = "cookiesync_form";
    var COOKIE_URL = "http://localhost";
    var STORAGE_KEY = "cookiesync_form";
    var KEYS = ["regexHost", "regexNames", "preferredLanguage"];
    var LOCALHOST_TAB_URLS = ["http://localhost/*", "http://localhost:*/*"];

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
        return chrome.tabs.query({url: LOCALHOST_TAB_URLS});
    }

    async function sendTabMessage(tabId, message) {
        try {
            return await chrome.tabs.sendMessage(tabId, message);
        } catch (error) {
            return null;
        }
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
                var response = await sendTabMessage(tabs[index].id, {getFormBackup: true});
                var parsed = parseBackup(response && response.value);
                if (hasFormValues(parsed)) {
                    return parsed;
                }
            }
            return readLegacyCookie();
        },
        async write(data) {
            var value = hasFormValues(data) ? serializeBackup(data) : null;
            var tabs = await queryLocalhostTabs();
            await Promise.all(tabs.map(function(tab) {
                return sendTabMessage(tab.id, {setFormBackup: value});
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

    async function persistBackup(data, backup) {
        if (hasFormValues(data)) {
            await backup.write(data);
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

    async function applyIncomingBackup(rawValue, storageApi, backupApi) {
        var backup = getBackupApi(backupApi);
        var storage = getStorage(storageApi);
        var stored = pickForm(await storage.get(KEYS));
        if (hasFormValues(stored)) {
            await persistBackup(stored, backup);
            return {form: stored, restored: false};
        }
        var incoming = parseBackup(rawValue);
        if (!hasFormValues(incoming)) {
            incoming = await backup.read();
        }
        if (hasFormValues(incoming)) {
            await storage.set(incoming);
            await persistBackup(incoming, backup);
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
