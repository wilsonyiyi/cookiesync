var CookieSyncForm = (function() {
    var COOKIE_NAME = "cookiesync_form";
    var COOKIE_URL = "http://localhost";
    var KEYS = ["regexHost", "regexNames", "preferredLanguage"];
    var BACKUP_MAX_AGE_SEC = 60 * 60 * 24 * 365 * 10;

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

    function getStorage(storageApi) {
        return storageApi || chrome.storage.local;
    }

    function getCookies(cookiesApi) {
        return cookiesApi || chrome.cookies;
    }

    async function readBackup(cookiesApi) {
        var cookie = await getCookies(cookiesApi).get({
            url: COOKIE_URL,
            name: COOKIE_NAME
        });
        return parseForm(cookie && cookie.value);
    }

    async function writeBackup(data, cookiesApi) {
        if (!hasFormValues(data)) {
            return null;
        }
        return getCookies(cookiesApi).set({
            url: COOKIE_URL,
            name: COOKIE_NAME,
            value: serializeForm(data),
            path: "/",
            expirationDate: Math.floor(Date.now() / 1000) + BACKUP_MAX_AGE_SEC
        });
    }

    async function loadForm(storageApi, cookiesApi) {
        var stored = pickForm(await getStorage(storageApi).get(KEYS));
        if (hasFormValues(stored)) {
            await writeBackup(stored, cookiesApi);
            return stored;
        }
        var backup = await readBackup(cookiesApi);
        if (hasFormValues(backup)) {
            await getStorage(storageApi).set(backup);
            return backup;
        }
        return stored;
    }

    async function saveForm(partial, storageApi, cookiesApi) {
        var storage = getStorage(storageApi);
        var current = pickForm(await storage.get(KEYS));
        var next = pickForm({
            regexHost: partial.regexHost != null ? partial.regexHost : current.regexHost,
            regexNames: partial.regexNames != null ? partial.regexNames : current.regexNames,
            preferredLanguage: partial.preferredLanguage != null ? partial.preferredLanguage : current.preferredLanguage
        });
        await storage.set(partial);
        await writeBackup(next, cookiesApi);
        return next;
    }

    return {
        COOKIE_NAME: COOKIE_NAME,
        COOKIE_URL: COOKIE_URL,
        KEYS: KEYS,
        hasFormValues: hasFormValues,
        serializeForm: serializeForm,
        parseForm: parseForm,
        loadForm: loadForm,
        saveForm: saveForm
    };
})();

if (typeof module !== "undefined" && module.exports) {
    module.exports = CookieSyncForm;
}
