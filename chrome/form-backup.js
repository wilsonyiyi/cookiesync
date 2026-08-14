var STORAGE_KEY = "cookiesync_form";

function readValue() {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
        return null;
    }
}

function writeValue(value) {
    try {
        if (value == null || value === "") {
            localStorage.removeItem(STORAGE_KEY);
        } else {
            localStorage.setItem(STORAGE_KEY, value);
        }
    } catch (error) {}
}

chrome.runtime.sendMessage({formBackup: readValue()}, function() {
    void chrome.runtime.lastError;
});

chrome.runtime.onMessage.addListener(function(message, _sender, sendResponse) {
    if (message.getFormBackup) {
        sendResponse({value: readValue()});
        return;
    }
    if (Object.prototype.hasOwnProperty.call(message, "setFormBackup")) {
        writeValue(message.setFormBackup);
        sendResponse({ok: true});
    }
});
