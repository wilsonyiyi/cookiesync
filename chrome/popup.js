var defaultHost = ".*\\.mycompany\\.com";
var defaultNames =  ["sessionid.*"].join('\n');

var myPort = chrome.runtime.connect({name:"port-from-cs"});
myPort.onMessage.addListener(function(m) {
    document.querySelector("#warning").innerText=m.message
});

chrome.storage.local.get("regexNames", function(res) {
    regexNames = (res.regexNames || defaultNames);
    document.querySelector(".regexnames").value=regexNames;
});

chrome.storage.local.get("regexHost", function(res) {
    regexHost = (res.regexHost || defaultHost);
    document.querySelector(".regexhost").value=regexHost;
});

window.onload= function() {
    var hostArea = document.querySelector(".regexhost");
    hostArea.onkeyup = hostArea.onchange = function(){
        v = hostArea.value.trim()
        myPort.postMessage({updateHost: v});
    }
    var namesArea = document.querySelector(".regexnames");
    namesArea.onkeyup = namesArea.onchange = function(){
        v = namesArea.value.trim()
        myPort.postMessage({updateRegexNames: v});
    }

    const syncButton = document.getElementById('syncButton');
    if (syncButton) {
        syncButton.addEventListener('click', function() {
            const originalText = syncButton.textContent;
            syncButton.textContent = 'Syncing...';
            syncButton.disabled = true;
            document.querySelector("#warning").innerText = "";

            chrome.runtime.sendMessage({manualSync: true}, function(result) {
                syncButton.textContent = originalText;
                syncButton.disabled = false;
                if (chrome.runtime.lastError) {
                    document.querySelector("#warning").innerText = chrome.runtime.lastError.message;
                    return;
                }
                if (!result || result.error) {
                    document.querySelector("#warning").innerText = (result && result.error) || "Sync failed";
                    return;
                }
                syncButton.textContent = `Synced ${result.copied}`;
                setTimeout(() => {
                    syncButton.textContent = originalText;
                }, 2000);
            });
        });
    }
}