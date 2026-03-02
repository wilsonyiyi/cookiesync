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
    input = document.querySelector(".regexhost");
    input.onkeyup = input.onchange = function(){
        v = input.value.trim()
        myPort.postMessage({updateHost: v});
    }
    txarea = document.querySelector(".regexnames");
    txarea.onkeyup = txarea.onchange = function(){
        v = txarea.value.trim()
        myPort.postMessage({updateRegexNames: v});
    }

    const syncButton = document.getElementById('syncButton');
    if (syncButton) {
        syncButton.addEventListener('click', async function() {
            try {
                chrome.runtime.sendMessage({manualSync: true});
                
                const originalText = syncButton.textContent;
                syncButton.textContent = 'Syncing...';
                syncButton.disabled = true;

                setTimeout(() => {
                    syncButton.textContent = originalText;
                    syncButton.disabled = false;
                }, 2000);
                
            } catch (error) {
                console.error('Error triggering manual sync:', error);
                document.querySelector("#warning").innerText = "Sync failed: " + error.message;
            }
        });
    }
}