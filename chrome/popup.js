var defaultHost = ".*\\.example\\.com";
var defaultNames = ["sessionid.*"].join("\n");
var languageKey = "preferredLanguage";
var lastSyncKey = "lastSyncStatus";
var currentLanguage = "en";
var buttonState = {type: "idle", copied: 0};
var syncState = {type: "ready", copied: 0, failed: 0, timestamp: 0, error: ""};
var updateState = null;
var updateCheckInFlight = false;
var buttonResetTimer = null;

var translations = {
    en: {
        subtitle: "Sync cookies to localhost",
        hostTitle: "Cookie Sources",
        hostDescription: "Match cookies from these domains (regex supported)",
        nameTitle: "Cookie Names",
        nameDescription: "Only sync matching cookie names (regex supported)",
        onePerLine: "One regular expression per line",
        syncNow: "Sync Now",
        syncSubtitle: "Copy matching cookies to localhost",
        syncing: "Syncing...",
        syncingSubtitle: "Finding matching cookies",
        synced: "Synced {count} cookies",
        syncedOne: "Synced 1 cookie",
        syncedSubtitle: "Cookies are available on localhost",
        syncFailed: "Sync failed",
        partialFailure: "{count} matching cookies could not be copied.",
        tryAgain: "Check the error and try again",
        ready: "Ready",
        notSyncedYet: "Not synced yet",
        active: "Active",
        lastSynced: "Last synced {time}",
        justNow: "just now",
        oneMinuteAgo: "1 min ago",
        minutesAgo: "{count} min ago",
        hoursAgo: "{count} hr ago",
        cookiesSynced: "{count} cookies synced",
        oneCookieSynced: "1 cookie synced",
        cookiesFailed: "{count} cookies failed",
        oneCookieFailed: "1 cookie failed",
        viewDetails: "View details",
        howItWorks: "How it works",
        update: "Update",
        checkForUpdate: "Check for updates",
        checkingUpdate: "Checking for updates",
        langToggle: "中文",
        switchLanguage: "切换到中文"
    },
    zh: {
        subtitle: "将 Cookie 同步到 localhost",
        hostTitle: "Cookie 来源",
        hostDescription: "匹配这些域名下的 Cookie（支持正则）",
        nameTitle: "Cookie 名称",
        nameDescription: "仅同步名称匹配的 Cookie（支持正则）",
        onePerLine: "每行填写一条正则表达式",
        syncNow: "立即同步",
        syncSubtitle: "将匹配的 Cookie 复制到 localhost",
        syncing: "同步中...",
        syncingSubtitle: "正在查找匹配的 Cookie",
        synced: "已同步 {count} 个 Cookie",
        syncedOne: "已同步 1 个 Cookie",
        syncedSubtitle: "Cookie 已可在 localhost 使用",
        syncFailed: "同步失败",
        partialFailure: "{count} 个匹配的 Cookie 复制失败。",
        tryAgain: "请检查错误信息后重试",
        ready: "准备就绪",
        notSyncedYet: "尚未同步",
        active: "运行中",
        lastSynced: "上次同步：{time}",
        justNow: "刚刚",
        oneMinuteAgo: "1 分钟前",
        minutesAgo: "{count} 分钟前",
        hoursAgo: "{count} 小时前",
        cookiesSynced: "已同步 {count} 个 Cookie",
        oneCookieSynced: "已同步 1 个 Cookie",
        cookiesFailed: "{count} 个 Cookie 失败",
        oneCookieFailed: "1 个 Cookie 失败",
        viewDetails: "查看详情",
        howItWorks: "工作原理",
        update: "更新",
        checkForUpdate: "检查更新",
        checkingUpdate: "正在检查更新",
        langToggle: "English",
        switchLanguage: "Switch to English"
    }
};

function normalizeLanguage(language) {
    return language && language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function t(key, params) {
    var message = translations[currentLanguage][key] || translations.en[key] || key;
    if (!params) {
        return message;
    }
    return message.replace(/\{(\w+)\}/g, function(_, token) {
        return params[token] == null ? "" : params[token];
    });
}

function getRelativeTime(timestamp) {
    var elapsedMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
    if (elapsedMinutes < 1) {
        return t("justNow");
    }
    if (elapsedMinutes === 1) {
        return t("oneMinuteAgo");
    }
    if (elapsedMinutes < 60) {
        return t("minutesAgo", {count: elapsedMinutes});
    }
    return t("hoursAgo", {count: Math.floor(elapsedMinutes / 60)});
}

var howItWorksUrls = {
    en: "https://github.com/wilsonyiyi/cookiesync#how-it-works",
    zh: "https://github.com/wilsonyiyi/cookiesync/blob/main/README.zh-CN.md#%E5%B7%A5%E4%BD%9C%E5%8E%9F%E7%90%86"
};

function applyLanguage(language) {
    currentLanguage = normalizeLanguage(language);
    document.documentElement.lang = currentLanguage === "zh" ? "zh-CN" : "en";

    document.querySelectorAll("[data-i18n]").forEach(function(node) {
        node.textContent = t(node.dataset.i18n);
    });

    var howItWorksLink = document.getElementById("howItWorksLink");
    if (howItWorksLink) {
        howItWorksLink.href = howItWorksUrls[currentLanguage] || howItWorksUrls.en;
    }

    var langLabel = document.getElementById("langLabel");
    var langToggle = document.getElementById("langToggle");
    if (langLabel) {
        langLabel.textContent = t("langToggle");
    }
    if (langToggle) {
        langToggle.setAttribute("aria-label", t("switchLanguage"));
    }

    renderButton();
    renderStatus();
    renderUpdateLink();
    renderVersionChecking();
}

function setLanguage(language) {
    applyLanguage(language);
    chrome.storage.local.set({[languageKey]: currentLanguage});
}

function setWarning(message) {
    var warning = document.getElementById("warning");
    if (!warning) {
        return;
    }
    warning.textContent = message || "";
    warning.classList.toggle("is-visible", Boolean(message));
}

function renderButton() {
    var syncButton = document.getElementById("syncButton");
    var label = document.getElementById("syncButtonLabel");
    var subtitle = document.getElementById("syncButtonSubtitle");
    if (!syncButton || !label || !subtitle) {
        return;
    }

    syncButton.classList.toggle("is-syncing", buttonState.type === "syncing");
    syncButton.disabled = buttonState.type === "syncing";

    if (buttonState.type === "syncing") {
        label.textContent = t("syncing");
        subtitle.textContent = t("syncingSubtitle");
        return;
    }
    if (buttonState.type === "success") {
        label.textContent = buttonState.copied === 1
            ? t("syncedOne")
            : t("synced", {count: buttonState.copied});
        subtitle.textContent = t("syncedSubtitle");
        return;
    }
    if (buttonState.type === "error") {
        label.textContent = t("syncFailed");
        subtitle.textContent = t("tryAgain");
        return;
    }

    label.textContent = t("syncNow");
    subtitle.textContent = t("syncSubtitle");
}

function renderStatus() {
    var card = document.getElementById("statusCard");
    var title = document.getElementById("statusTitle");
    var meta = document.getElementById("statusMeta");
    var badge = document.getElementById("statusBadge");
    var badgeText = document.getElementById("statusBadgeText");
    var badgePath = badge && badge.querySelector("path");
    if (!card || !title || !meta || !badge || !badgeText) {
        return;
    }

    card.className = "status-card is-" + syncState.type;
    badge.hidden = true;

    if (syncState.type === "syncing") {
        title.textContent = t("syncing");
        meta.textContent = t("syncingSubtitle");
        return;
    }
    if (syncState.type === "success") {
        title.textContent = t("active");
        meta.textContent = t("lastSynced", {time: getRelativeTime(syncState.timestamp)});
        badgeText.textContent = syncState.copied === 1
            ? t("oneCookieSynced")
            : t("cookiesSynced", {count: syncState.copied});
        if (badgePath) {
            badgePath.setAttribute("d", "m5 12 4 4L19 6");
        }
        badge.hidden = false;
        return;
    }
    if (syncState.type === "error") {
        title.textContent = t("syncFailed");
        meta.textContent = syncState.failed === 1
            ? t("oneCookieFailed")
            : t("cookiesFailed", {count: syncState.failed || 1});
        badgeText.textContent = t("viewDetails");
        if (badgePath) {
            badgePath.setAttribute("d", "M8 8l8 8M16 8l-8 8");
        }
        badge.hidden = false;
        return;
    }

    title.textContent = t("ready");
    meta.textContent = t("notSyncedYet");
}

function setSyncState(nextState, persist) {
    syncState = Object.assign({type: "ready", copied: 0, failed: 0, timestamp: 0, error: ""}, nextState);
    renderStatus();
    if (persist) {
        chrome.storage.local.set({[lastSyncKey]: syncState});
    }
}

function setButtonState(type, copied) {
    buttonState = {type: type, copied: copied || 0};
    renderButton();
}

function getPatternCount(value) {
    return value.split(/\r?\n/).filter(function(line) {
        return line.trim().length > 0;
    }).length;
}

function updateEditorMeta(textarea, countNode, lineNumbers) {
    var count = getPatternCount(textarea.value);
    var lineCount = Math.max(1, textarea.value.split(/\r?\n/).length);
    var numbers = [];
    for (var index = 1; index <= lineCount; index += 1) {
        numbers.push(index);
    }
    countNode.textContent = String(count);
    countNode.setAttribute("aria-label", count + " patterns");
    lineNumbers.textContent = numbers.join("\n");
    lineNumbers.scrollTop = textarea.scrollTop;
}

function setupEditor(options) {
    var textarea = document.getElementById(options.textareaId);
    var countNode = document.getElementById(options.countId);
    var lineNumbers = document.getElementById(options.lineNumbersId);

    function updateAndPersist() {
        updateEditorMeta(textarea, countNode, lineNumbers);
        var value = textarea.value.trim();
        var message = {};
        message[options.messageKey] = value;
        options.port.postMessage(message);
    }

    textarea.addEventListener("input", updateAndPersist);
    textarea.addEventListener("change", updateAndPersist);
    textarea.addEventListener("scroll", function() {
        lineNumbers.scrollTop = textarea.scrollTop;
    });

    chrome.storage.local.get(options.storageKey, function(result) {
        textarea.value = result[options.storageKey] || options.defaultValue;
        updateEditorMeta(textarea, countNode, lineNumbers);
    });
}

function runManualSync() {
    if (buttonResetTimer) {
        clearTimeout(buttonResetTimer);
    }
    setWarning("");
    setButtonState("syncing");
    setSyncState({type: "syncing"}, false);

    chrome.runtime.sendMessage({manualSync: true}, function(result) {
        if (chrome.runtime.lastError) {
            var runtimeMessage = chrome.runtime.lastError.message;
            setWarning(runtimeMessage);
            setButtonState("error");
            setSyncState({type: "error", failed: 1, timestamp: Date.now(), error: runtimeMessage}, true);
            return;
        }
        if (!result || result.error) {
            var errorMessage = (result && result.error) || t("syncFailed");
            setWarning(errorMessage);
            setButtonState("error");
            setSyncState({type: "error", failed: (result && result.failed) || 1, timestamp: Date.now(), error: errorMessage}, true);
            return;
        }
        if (result.failed > 0) {
            var partialFailureMessage = t("partialFailure", {count: result.failed});
            setWarning(partialFailureMessage);
            setButtonState("error");
            setSyncState({
                type: "error",
                copied: result.copied || 0,
                failed: result.failed,
                timestamp: Date.now(),
                error: partialFailureMessage
            }, true);
            return;
        }

        var completedAt = Date.now();
        setButtonState("success", result.copied);
        setSyncState({type: "success", copied: result.copied, failed: result.failed || 0, timestamp: completedAt}, true);
        buttonResetTimer = setTimeout(function() {
            setButtonState("idle");
        }, 1500);
    });
}

function renderUpdateLink() {
    var link = document.getElementById("updateLink");
    if (!link) {
        return;
    }
    if (!CookieSyncUpdate.hasVisibleUpdate(updateState, getInstalledVersion())) {
        link.hidden = true;
        link.removeAttribute("href");
        return;
    }
    link.href = updateState.releaseUrl;
    link.hidden = false;
}

function getInstalledVersion() {
    var manifest = chrome.runtime.getManifest ? chrome.runtime.getManifest() : null;
    return manifest && manifest.version ? manifest.version : "";
}

function applyStoredUpdate(cache) {
    var currentVersion = getInstalledVersion();
    if (!cache || cache.currentVersion !== CookieSyncUpdate.normalizeVersion(currentVersion)) {
        updateState = null;
        renderUpdateLink();
        return;
    }
    updateState = cache;
    renderUpdateLink();
}

function renderVersionChecking() {
    var versionNode = document.getElementById("version");
    if (!versionNode) {
        return;
    }
    versionNode.classList.toggle("is-checking", updateCheckInFlight);
    versionNode.setAttribute("aria-busy", updateCheckInFlight ? "true" : "false");
    versionNode.setAttribute("aria-label", t(updateCheckInFlight ? "checkingUpdate" : "checkForUpdate"));
}

function checkForUpdate(force) {
    if (force) {
        if (updateCheckInFlight) {
            return;
        }
        updateCheckInFlight = true;
        renderVersionChecking();
    }
    var startedAt = Date.now();
    chrome.storage.local.get(CookieSyncUpdate.STORAGE_KEY, function(result) {
        applyStoredUpdate(result[CookieSyncUpdate.STORAGE_KEY]);
        chrome.runtime.sendMessage({checkUpdate: true, force: Boolean(force)}, function(response) {
            void chrome.runtime.lastError;
            function finish() {
                if (force) {
                    updateCheckInFlight = false;
                    renderVersionChecking();
                }
                if (response && response.state) {
                    applyStoredUpdate(response.state);
                }
            }
            if (!force) {
                finish();
                return;
            }
            var remaining = Math.max(0, 400 - (Date.now() - startedAt));
            setTimeout(finish, remaining);
        });
    });
}

function initialize() {
    var port = chrome.runtime.connect({name: "port-from-cs"});
    port.onMessage.addListener(function(message) {
        setWarning(message.message);
    });

    setupEditor({
        textareaId: "regexhost",
        countId: "hostCount",
        lineNumbersId: "hostLineNumbers",
        storageKey: "regexHost",
        messageKey: "updateHost",
        defaultValue: defaultHost,
        port: port
    });
    setupEditor({
        textareaId: "regexnames",
        countId: "nameCount",
        lineNumbersId: "nameLineNumbers",
        storageKey: "regexNames",
        messageKey: "updateRegexNames",
        defaultValue: defaultNames,
        port: port
    });

    var langToggle = document.getElementById("langToggle");
    langToggle.addEventListener("click", function() {
        setLanguage(currentLanguage === "zh" ? "en" : "zh");
    });

    document.getElementById("syncButton").addEventListener("click", runManualSync);

    var versionNode = document.getElementById("version");
    var installedVersion = getInstalledVersion();
    if (installedVersion) {
        versionNode.textContent = "v" + installedVersion;
    }
    versionNode.addEventListener("click", function() {
        checkForUpdate(true);
    });

    chrome.storage.onChanged.addListener(function(changes, area) {
        if (area === "local" && changes[CookieSyncUpdate.STORAGE_KEY]) {
            applyStoredUpdate(changes[CookieSyncUpdate.STORAGE_KEY].newValue);
        }
    });

    chrome.storage.local.get([languageKey, lastSyncKey], function(result) {
        var browserLanguage = chrome.i18n && chrome.i18n.getUILanguage
            ? chrome.i18n.getUILanguage()
            : navigator.language;
        if (result[lastSyncKey] && (result[lastSyncKey].type === "success" || result[lastSyncKey].type === "error")) {
            syncState = result[lastSyncKey];
            if (syncState.type === "error" && syncState.error) {
                setWarning(syncState.error);
            }
        }
        applyLanguage(result[languageKey] || browserLanguage);
        checkForUpdate();
    });

    setInterval(function() {
        if (syncState.type === "success") {
            renderStatus();
        }
    }, 30000);
}

initialize();
