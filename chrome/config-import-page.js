(() => {
    const lang = new URLSearchParams(location.search).get("lang") === "zh" ? "zh" : "en";
    const copy = {
        en: {
            title: "Import configuration", hint: "Choose a CookieSync configuration JSON file.",
            chooseLabel: "Choose JSON file", note: "Your file stays on this device.", close: "Close", done: "Done",
            reading: "Reading file…", saving: "Saving configuration…", readFailed: "Could not read the file. Please select it again.",
            invalid: "This is not a valid CookieSync configuration file.", saveFailed: "Could not save configuration. Please try again.",
            success: "Imported {hosts} source rules and {names} cookie-name rules. You can close this window."
        },
        zh: {
            title: "导入配置", hint: "选择 CookieSync 导出的 JSON 配置文件。",
            chooseLabel: "选择 JSON 文件", note: "文件仅在本机读取。", close: "关闭", done: "完成",
            reading: "正在读取文件…", saving: "正在保存配置…", readFailed: "无法读取文件，请重新选择。",
            invalid: "这不是有效的 CookieSync 配置文件。", saveFailed: "配置保存失败，请重试。",
            success: "已导入 {hosts} 条来源规则、{names} 条 Cookie 名称规则。现在可以关闭此窗口。"
        }
    }[lang];
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = "CookieSync · " + copy.title;
    for (const id of ["title", "hint", "chooseLabel", "note", "close"]) document.getElementById(id).textContent = copy[id];
    const choose = document.getElementById("choose"), file = document.getElementById("file"), status = document.getElementById("status");
    const importFile = CookieSyncConfigImport.createImporter({
        parse: CookieSyncForm.parseSharePayload,
        save: form => chrome.runtime.sendMessage({importConfig: CookieSyncForm.buildSharePayload(form)}),
        onState(state) {
            choose.disabled = state.type === "reading" || state.type === "saving";
            status.dataset.state = state.type;
            status.textContent = copy[state.type].replace("{hosts}", state.hosts).replace("{names}", state.names);
            document.getElementById("close").textContent = state.type === "success" ? copy.done : copy.close;
        }
    });
    choose.addEventListener("click", () => file.click());
    file.addEventListener("change", () => {
        const selected = file.files[0];
        file.value = "";
        importFile(selected);
    });
    document.getElementById("close").addEventListener("click", () => window.close());
})();
