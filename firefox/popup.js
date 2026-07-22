var defaultHost = ".*\\.mycompany\\.com";
var defaultNames =  ["sessionid.*"].join('\n');

var myPort = browser.runtime.connect({name:"port-from-cs"});
myPort.onMessage.addListener(function(m) {
    document.querySelector("#warning").innerText=m.message
});

browser.storage.local.get("regexNames", function(res) {
    regexNames = (res.regexNames || defaultNames);
    document.querySelector(".regexnames").value=regexNames;
});

browser.storage.local.get("regexHost", function(res) {
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
}