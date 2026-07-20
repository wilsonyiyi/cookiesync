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
    txarea = document.querySelector(".regexhost");
    txarea.onkeyup = txarea.onchange = function(){
        v = txarea.value.trim()
        myPort.postMessage({updateHost: v});
    }
    txarea = document.querySelector(".regexnames");
    txarea.onkeyup = txarea.onchange = function(){
        v = txarea.value.trim()
        myPort.postMessage({updateRegexNames: v});
    }
}