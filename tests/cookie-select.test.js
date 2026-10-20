const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const scmuiUrl = "https://scmui-test05.dongfangfuli.com/backend/goodsCenter/scm-goods-web/strategy/selection/scene-config/list";
const gatewayUrl = "https://openapi-gateway-stage.ocjfuli.com/api/demo";

function eventTarget() {
    return {addListener() {}};
}

function loadServiceWorker(chromeOverrides) {
    const context = {
        console: {log() {}, warn() {}},
        importScripts() {},
        CookieSyncForm: {
            COOKIE_NAME: "cookiesync_form",
            async loadForm() {
                return {
                    regexHost: ".*\\.dongfangfuli\\.com\n.*\\.ocjfuli\\.com",
                    regexNames: "JSESSIONID\nworksheet-tk-test05\nsso_session_id_.*\nWB_FE_WORKBENCH_TEST05"
                };
            },
            async saveForm() {},
            async applyIncomingBackup() {
                return {restored: false, form: {}};
            },
            hasFormValues() {
                return false;
            },
            serializeBackup() {
                return "";
            },
            isLocalhostUrl(url) {
                try {
                    return new URL(url).hostname === "localhost";
                } catch (error) {
                    return false;
                }
            }
        },
        CookieSyncUpdate: {
            STORAGE_KEY: "updateCheck",
            MIN_BACKOFF_MS: 300000,
            shouldSkipFetch() {
                return true;
            },
            remainingDelayMs() {
                return 300000;
            }
        },
        chrome: Object.assign({
            storage: {
                local: {
                    async get() {
                        return {};
                    },
                    async set() {}
                }
            },
            cookies: {
                async set(details) {
                    return details;
                },
                async getAll() {
                    return [];
                },
                async remove() {},
                onChanged: eventTarget()
            },
            runtime: {
                lastError: null,
                getManifest() {
                    return {version: "1.5.2"};
                },
                onConnect: eventTarget(),
                onInstalled: eventTarget(),
                onStartup: eventTarget(),
                onMessage: eventTarget()
            },
            alarms: {
                async clear() {},
                create() {},
                onAlarm: eventTarget()
            },
            tabs: {
                async query() {
                    return [];
                },
                onUpdated: eventTarget()
            }
        }, chromeOverrides),
        URL,
        Map,
        Promise
    };
    vm.createContext(context);
    vm.runInContext(
        fs.readFileSync(path.join(__dirname, "../chrome/service_worker.js"), "utf8"),
        context
    );
    return context;
}

function sourceCookies() {
    return [
        {
            name: "JSESSIONID",
            value: "gateway-old",
            domain: "openapi-gateway-stage.ocjfuli.com",
            hostOnly: true,
            path: "/",
            secure: false,
            httpOnly: true
        },
        {
            name: "JSESSIONID",
            value: "scmui-new",
            domain: "scmui-test05.dongfangfuli.com",
            hostOnly: true,
            path: "/",
            secure: false,
            httpOnly: false
        },
        {
            name: "worksheet-tk-test05",
            value: "worksheet",
            domain: ".dongfangfuli.com",
            hostOnly: false,
            path: "/",
            secure: false,
            httpOnly: false
        },
        {
            name: "sso_session_id_test_v1",
            value: "sso",
            domain: ".ocjfuli.com",
            hostOnly: false,
            path: "/",
            secure: true,
            httpOnly: false
        }
    ];
}

test("manual sync keeps the JSESSIONID from the page being used", async () => {
    const context = loadServiceWorker();
    await context.regexpesReady;

    const chosen = context.chooseCookiesToSync(sourceCookies(), [scmuiUrl, gatewayUrl]);
    const byName = Object.fromEntries(chosen.map((cookie) => [cookie.name, cookie.value]));

    assert.equal(byName.JSESSIONID, "scmui-new");
    assert.equal(byName["worksheet-tk-test05"], "worksheet");
    assert.equal(byName.sso_session_id_test_v1, "sso");
    assert.equal(chosen.filter((cookie) => cookie.name === "JSESSIONID").length, 1);
});

test("a later matching JSESSIONID does not replace the active site", async () => {
    const context = loadServiceWorker();
    await context.regexpesReady;
    const cookies = sourceCookies().reverse();

    const chosen = context.chooseCookiesToSync(cookies, [scmuiUrl]);
    const session = chosen.find((cookie) => cookie.name === "JSESSIONID");

    assert.equal(session.value, "scmui-new");
    assert.equal(session.httpOnly, false);
});

test("ambiguous JSESSIONID is not copied when no source page is open", async () => {
    const context = loadServiceWorker();
    await context.regexpesReady;

    const chosen = context.chooseCookiesToSync(sourceCookies(), []);
    assert.equal(chosen.some((cookie) => cookie.name === "JSESSIONID"), false);
    assert.equal(chosen.find((cookie) => cookie.name === "sso_session_id_test_v1").value, "sso");
});

test("cookie changes from another host are ignored while the source page is open", async () => {
    const context = loadServiceWorker();
    context.chrome.tabs.query = async (query) => {
        if (query && query.active) {
            return [{id: 2, url: scmuiUrl, active: true, lastAccessed: 20}];
        }
        return [
            {id: 1, url: gatewayUrl, active: false, lastAccessed: 10},
            {id: 2, url: scmuiUrl, active: true, lastAccessed: 20},
            {id: 3, url: "http://localhost:9002/strategy/selection/union/list", active: false, lastAccessed: 30}
        ];
    };
    context.chrome.cookies.getAll = async () => sourceCookies();
    await context.regexpesReady;

    const gateway = sourceCookies()[0];
    const scmui = sourceCookies()[1];
    assert.equal(await context.cookieForChange(gateway), null);
    assert.equal((await context.cookieForChange(scmui)).value, "scmui-new");
});

test("replacing localhost JSESSIONID removes the old HttpOnly cookie first", async () => {
    const calls = [];
    const context = loadServiceWorker();
    context.chrome.cookies.getAll = async () => [{
        name: "JSESSIONID",
        value: "old-httponly",
        domain: "localhost",
        path: "/",
        secure: false,
        httpOnly: true
    }];
    context.chrome.cookies.remove = async (details) => {
        calls.push(["remove", details]);
    };
    context.chrome.cookies.set = async (details) => {
        calls.push(["set", details]);
        return details;
    };

    await context.copyCookieToLocalhost({
        name: "JSESSIONID",
        value: "scmui-new",
        domain: "scmui-test05.dongfangfuli.com",
        path: "/",
        httpOnly: false,
        secure: false
    });

    assert.deepEqual(calls.map((call) => call[0]), ["remove", "set"]);
    assert.equal(calls[0][1].name, "JSESSIONID");
    assert.match(calls[0][1].url, /^http:\/\/localhost\/?$/);
    assert.equal(calls[1][1].value, "scmui-new");
    assert.equal(calls[1][1].httpOnly, false);
});
