var defaultHost = ".*\\.mycompany\\.com";
var defaultNames = ["sessionid.*"].join('\n');

var hostsArray = [];
var namesArray = [];

async function updateRegexpes() {
    const [regexNames, regexHost] = await Promise.all([
        chrome.storage.local.get("regexNames"),
        chrome.storage.local.get("regexHost")
    ]);
    namesArray = (regexNames.regexNames || defaultNames).split("\n");
    hostsArray = (regexHost.regexHost || defaultHost).split("\n");
}

chrome.runtime.onConnect.addListener(port => {
    console.log("CookieSync: onConnect");
    port.onMessage.addListener(async (m) => {
        console.log("CookieSync: onMessage");
        if (m.updateHost) {
            await chrome.storage.local.set({"regexHost": m.updateHost});
            updateRegexpes();
        }
        if (m.updateRegexNames) {
            await chrome.storage.local.set({"regexNames": m.updateRegexNames});
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

// 监听来自popup的消息，处理手动同步请求
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
});

chrome.cookies.onChanged.addListener((changeInfo) => {
    if (changeInfo.removed) {
        return;
    }
    const cookie = changeInfo.cookie;
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

updateRegexpes();

console.log("CookieSync: installed service worker");
