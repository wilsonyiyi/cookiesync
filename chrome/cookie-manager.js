/* Popup-only UI. The sync home remains mounted while managing cookies. */
(function () {
    "use strict";
    const root = document.getElementById("cookieManager");
    const entry = document.getElementById("cookieManagerButton");
    const apiModel = window.CookieManagerAPI;
    const $ = (s, r = root) => r.querySelector(s);
    const $$ = (s, r = root) => [...r.querySelectorAll(s)];
    const escape = (s) =>
        String(s ?? "").replace(
            /[&<>"']/g,
            (c) =>
                ({
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#39;",
                })[c],
        );
    const paths = {
        cookie: "M21 12a5 5 0 0 1-5-5 5 5 0 0 1-5-5 10 10 0 1 0 10 10ZM7 9h.01M8 16h.01M14 16h.01",
        arrow: "M9 5l7 7-7 7",
        search: "M15 15l5 5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
        plus: "M12 5v14M5 12h14",
        save: "M5 3.5h11.5l4 4V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5ZM8 3.5v5h8v-5M8 20.5v-7h8v7",
        trash: "M4.5 6.5h15M9 6.5V4.8A1.3 1.3 0 0 1 10.3 3.5h3.4A1.3 1.3 0 0 1 15 4.8v1.7M6.5 6.5l.8 12.6a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12.6M10 10v7M14 10v7",
        down: "M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4",
        up: "M12 15V3m-4 4 4-4 4 4M4 17v4h16v-4",
        refresh:
            "M20 7A9 9 0 0 0 5 5L2 8m0-5v5h5M4 17a9 9 0 0 0 15 2l3-3m0 5v-5h-5",
        close: "m6 6 12 12M6 18 18 6",
        check: "m5 12 4 4 10-10",
        calendar: "M3 5h18v16H3ZM7 3v4M17 3v4M3 11h18",
    };
    const icon = (name) =>
        `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${paths[name]}"/></svg>`;
    const messages = {
        zh: {
            title: "Cookie 管理",
            back: "同步",
            search: "搜索 Cookie 名称",
            details: "详情",
            more: "详细属性",
            less: "收起属性",
            add: "新增",
            clear: "清空",
            import: "导入",
            export: "导出",
            save: "保存",
            remove: "删除",
            refresh: "刷新",
            close: "关闭",
            cancel: "取消",
            loading: "正在读取 Cookie…",
            unavailable: "此页面无需管理 Cookie",
            unavailableHint: "请在 HTTP / HTTPS 网站页面中打开",
            loadFailed: "暂时无法读取 Cookie",
            retry: "重试",
            empty: "当前页面没有 Cookie",
            noMatch: "没有匹配的 Cookie",
            local: "当前页面",
            syncHint: "自动同步保持运行",
            discard: "存在未保存的编辑。放弃更改？",
            discardTitle: "放弃编辑",
            confirm: "确认",
            saved: "Cookie 已保存",
            deleted: "Cookie 已删除",
            clearTitle: "清空当前页面 Cookie",
            clearBody:
                "将删除当前页面 {host} 下列出的 {count} 个 Cookie（包含被搜索隐藏的条目）。其他站点不受影响。",
            deleteBody: "删除 {name}？",
            imported: "成功 {ok} 个，失败 {failed} 个。",
            importHint:
                "粘贴 Cookie JSON 数组或选择文件。仅允许当前页面域名范围；相同 Cookie 将被覆盖。",
            preview: "检查内容",
            importConfirm:
                "将向 {host} 导入 {count} 个 Cookie；同名、同路径、同分区条目会被覆盖。",
            choose: "选择 JSON 文件",
            exportHint:
                "导出当前页面的 {count} 个 Cookie。文件包含 Cookie 值，请妥善保存。",
            download: "下载 JSON",
            expiration: "Expiration（本地时间）",
            dateHint: "YYYY-MM-DD HH:mm:ss",
            advancedMeta: "存储 {store}",
            partitionMeta: "分区：{site}",
            errorPrefix: "操作失败：",
            errors: {
                unsupported:
                    "此页面不支持 Cookie 管理，请切换到 HTTP/HTTPS 网站。",
                invalid: "Cookie 字段格式不正确。",
                domain: "域名必须属于当前页面，不可写入其他站点。",
                store: "导入文件的存储区与当前页面不同。",
                path: "Path 必须以 / 开头，且不含控制字符、分号、? 或 #。",
                expiry: "请填写有效的未来过期时间；会话 Cookie 请勾选 Session。",
                secure: "SameSite=None 或 __Secure- Cookie 必须启用 Secure。",
                prefix: "__Host- Cookie 必须启用 Secure、Host Only 且 Path 为 /。",
                partition: "分区属性无效或无法变更。",
                stale: "Cookie 已被网站更新或删除。请刷新列表后重新编辑。",
                write: "浏览器未确认写入。",
                verify: "写入后的数据验证失败，请刷新查看实际状态。",
                ambiguous:
                    "存在同名 Cookie，无法安全定位删除目标。未删除，请使用 Chrome 开发者工具处理。",
                remove: "未确认删除成功，请刷新查看。",
                collision: "目标 Cookie 已存在，请编辑原有条目。",
                renamePartial:
                    "新 Cookie 已写入，但旧 Cookie 未成功删除。请刷新后检查两条记录。",
                large: "文件不能超过 2 MB。",
                json: "请输入非空 JSON 数组，最多 1000 个 Cookie。",
                duplicate: "导入数据中包含重复 Cookie。",
            },
        },
        en: {
            title: "Cookie Manager",
            back: "Sync",
            search: "Search cookie names",
            details: "Details",
            more: "Details",
            less: "Hide details",
            add: "Add",
            clear: "Clear",
            import: "Import",
            export: "Export",
            save: "Save",
            remove: "Delete",
            refresh: "Refresh",
            close: "Close",
            cancel: "Cancel",
            loading: "Loading cookies…",
            unavailable: "No cookies to manage here",
            unavailableHint: "Open Cookie Manager on an HTTP / HTTPS website",
            loadFailed: "Unable to load cookies",
            retry: "Retry",
            empty: "No cookies for this page",
            noMatch: "No matching cookies",
            local: "Current page",
            syncHint: "Auto-sync stays active",
            discard: "Discard unsaved changes?",
            discardTitle: "Unsaved changes",
            confirm: "Confirm",
            saved: "Cookie saved",
            deleted: "Cookie deleted",
            clearTitle: "Clear page cookies",
            clearBody:
                "Delete all {count} listed cookies for {host}, including search-hidden rows? Other sites are not affected.",
            deleteBody: "Delete {name}?",
            imported: "Succeeded: {ok}. Failed: {failed}.",
            importHint:
                "Paste a cookie JSON array or select a file. Only the current page domain scope is allowed. Existing matching cookies will be overwritten.",
            preview: "Review",
            importConfirm:
                "Import {count} cookies into {host}? Cookies with the same identity will be overwritten.",
            choose: "Choose JSON file",
            exportHint:
                "Export {count} cookies for this page. The file contains cookie values; keep it private.",
            download: "Download JSON",
            expiration: "Expiration (local time)",
            dateHint: "YYYY-MM-DD HH:mm:ss",
            advancedMeta: "Store {store}",
            partitionMeta: "Partition: {site}",
            errorPrefix: "Operation failed: ",
            errors: {
                unsupported: "Open an HTTP/HTTPS page to manage its cookies.",
                invalid: "Invalid cookie fields.",
                domain: "The domain must belong to the current page.",
                store: "The imported cookie store differs from this page.",
                path: "Path must start with / and contain no control characters, semicolon, ? or #.",
                expiry: "Enter a valid future expiration time, or enable Session.",
                secure: "SameSite=None and __Secure- cookies require Secure.",
                prefix: "__Host- cookies require Secure, Host Only and Path=/.",
                partition: "Invalid partition key or partition change.",
                stale: "The website changed or deleted this cookie. Refresh before editing.",
                write: "The browser did not confirm the write.",
                verify: "Write verification failed. Refresh to inspect the actual state.",
                ambiguous:
                    "Ambiguous cookie identity. Nothing was deleted; use Chrome DevTools to resolve it.",
                remove: "Deletion was not confirmed. Refresh to inspect.",
                collision:
                    "The target cookie already exists. Edit that row instead.",
                renamePartial:
                    "The new cookie was written but the original could not be deleted. Refresh and inspect both.",
                large: "Maximum file size: 2 MB.",
                json: "Provide a non-empty JSON array with at most 1000 cookies.",
                duplicate: "Duplicate cookie identities in the import.",
            },
        },
    };
    let lang = "en",
        ctx,
        manager,
        cookies = [],
        query = "",
        all = false,
        busy = false,
        ready = false,
        loadError = null;
    let open = new Set(),
        advanced = new Set(),
        drafts = new Map(),
        modalReturn,
        confirmAction,
        serial = 0;
    const t = (key, params = {}) =>
        (messages[lang][key] || key).replace(
            /\{(\w+)\}/g,
            (_, k) => params[k] ?? "",
        );
    const errorText = (error) =>
        messages[lang].errors[error.message || error] ||
        error.message ||
        String(error);
    const keyOf = (c) => apiModel.identity(c);
    function notice(text, error = false) {
        window.PopupToast.show(text, { error });
    }
    function setBusy(value) {
        busy = value;
        root.classList.toggle("busy", value);
        root.setAttribute("aria-busy", String(value));
        $$("button").forEach((b) => {
            b.disabled = value || b.dataset.disabled === "true";
        });
    }
    async function run(fn) {
        if (busy) return;
        setBusy(true);
        try {
            await fn();
        } catch (error) {
            if (!ready) {
                loadError = error;
                notice("");
                render();
            } else {
                notice(t("errorPrefix") + errorText(error), true);
            }
        } finally {
            setBusy(false);
        }
    }
    function shell() {
        window.PopupToast.clear();
        root.innerHTML = `<header class="cm-head"><button class="cm-back" data-action="back">${icon("arrow")}${t("back")}</button><h2>${t("title")}</h2><button class="cm-icon cm-refresh" data-action="refresh" aria-label="${t("refresh")}">${icon("refresh")}</button></header><div class="cm-search">${icon("search")}<input type="search" aria-label="${t("search")}" placeholder="${t("search")}" autocomplete="off"><label class="cm-check"><input type="checkbox" data-all>${t("details")}</label></div><div class="cm-list"></div><footer class="cm-foot">${[
            ["add", "plus"],
            ["import", "down"],
            ["export", "up"],
            ["clear", "trash"],
        ]
            .map(
                ([a, i]) =>
                    `<button data-action="${a}">${icon(i)}${t(a)}</button>`,
            )
            .join(
                "",
            )}</footer><div class="cm-subfoot"><span>${t("local")}</span><span>${t("syncHint")}</span></div><div class="cm-overlay" hidden><section class="cm-dialog" role="dialog" aria-modal="true" aria-labelledby="cmDialogTitle"><header class="cm-dialog-head"><h3 id="cmDialogTitle"></h3><button class="cm-icon" data-action="close" aria-label="${t("close")}">${icon("close")}</button></header><div class="cm-dialog-body"></div></section></div>`;
        $(".cm-search>input").value = query;
        $("[data-all]").checked = all;
    }
    function dateString(seconds) {
        if (!Number.isFinite(seconds)) return "";
        const d = new Date(seconds * 1000),
            pad = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
    function dateSeconds(value) {
        const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
            value,
        );
        if (!m) return NaN;
        const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
        if (
            d.getFullYear() !== +m[1] ||
            d.getMonth() !== +m[2] - 1 ||
            d.getDate() !== +m[3] ||
            d.getHours() !== +m[4] ||
            d.getMinutes() !== +m[5] ||
            d.getSeconds() !== +(m[6] || 0)
        )
            return NaN;
        return d.getTime() / 1000;
    }
    function select(value) {
        const id = "cm-options-" + ++serial;
        return `<div class="cm-select"><input type="hidden" name="sameSite" value="${escape(value)}"><button type="button" class="cm-select-trigger" aria-label="SameSite" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}"><span>${escape({ no_restriction: "None", strict: "Strict", lax: "Lax", unspecified: "Unspecified" }[value])}</span>${icon("arrow")}</button><div class="cm-options" id="${id}" role="listbox" aria-label="SameSite" hidden>${[
            ["unspecified", "Unspecified"],
            ["no_restriction", "None"],
            ["strict", "Strict"],
            ["lax", "Lax"],
        ]
            .map(
                ([v, label]) =>
                    `<button type="button" role="option" tabindex="-1" data-option="${v}" aria-selected="${v === value}"><span>${label}</span>${icon("check")}</button>`,
            )
            .join("")}</div></div>`;
    }
    function fields(c, expanded, isNew) {
        return `<label class="cm-field">Name<input name="name" value="${escape(c.name)}" autocomplete="off" spellcheck="false"></label><label class="cm-field">Value<textarea name="value" spellcheck="false">${escape(c.value)}</textarea></label>${isNew ? "" : `<div class="cm-moreline"><span class="cm-meta">${escape(t("advancedMeta", { store: c.storeId }))}${c.partitionKey ? " · " + escape(t("partitionMeta", { site: c.partitionKey.topLevelSite })) : ""}</span><button type="button" class="cm-more" data-action="more">${t(expanded ? "less" : "more")}${icon("arrow")}</button></div>`}<div class="cm-advanced" ${expanded ? "" : "hidden"}><label class="cm-field">Domain<input name="domain" value="${escape(c.domain)}" spellcheck="false"></label><div class="cm-pair"><label class="cm-field">Path<input name="path" value="${escape(c.path)}" spellcheck="false"></label><div class="cm-field">SameSite${select(c.sameSite || "unspecified")}</div></div><label class="cm-field">${t("expiration")}<span class="cm-date">${icon("calendar")}<input type="text" name="expiration" placeholder="${t("dateHint")}" value="${escape(c.expirationText ?? dateString(c.expirationDate))}" ${c.session ? "disabled" : ""} spellcheck="false"></span></label><div class="cm-flags">${[
            ["hostOnly", "Host Only"],
            ["session", "Session"],
            ["secure", "Secure"],
            ["httpOnly", "HttpOnly"],
        ]
            .map(
                ([key, label]) =>
                    `<label class="cm-check"><input type="checkbox" name="${key}" ${c[key] ? "checked" : ""}>${label}</label>`,
            )
            .join("")}</div></div>`;
    }
    function read(form, original) {
        const f = new FormData(form),
            session = f.has("session");
        return {
            ...original,
            name: String(f.get("name") || ""),
            value: String(f.get("value") || ""),
            domain: String(f.get("domain") || ""),
            path: String(f.get("path") || ""),
            sameSite: f.get("sameSite"),
            expirationText: form.elements.expiration.value,
            expirationDate: session
                ? undefined
                : dateSeconds(form.elements.expiration.value),
            session,
            hostOnly: f.has("hostOnly"),
            secure: f.has("secure"),
            httpOnly: f.has("httpOnly"),
        };
    }
    function render() {
        const list = $(".cm-list"),
            scroll = list.scrollTop;
        root.classList.toggle("is-unavailable", Boolean(loadError));
        [".cm-search", ".cm-foot", ".cm-subfoot", ".cm-refresh"].forEach(
            (selector) => {
                $(selector).hidden = Boolean(loadError);
            },
        );
        if (loadError) {
            const unsupported = loadError.message === "unsupported";
            list.innerHTML = `<div class="cm-unavailable" role="status"><span class="cm-unavailable-icon">${icon("cookie")}</span><h3>${t(unsupported ? "unavailable" : "loadFailed")}</h3><p>${escape(unsupported ? t("unavailableHint") : errorText(loadError))}</p>${unsupported ? "" : `<button class="cm-retry" data-action="refresh">${icon("refresh")}${t("retry")}</button>`}</div>`;
            return;
        }
        const rows = cookies
            .map((c, index) => ({ c, index }))
            .filter(({ c }) =>
                c.name.toLowerCase().includes(query.toLowerCase()),
            );
        list.innerHTML =
            rows
                .map(({ c, index }) => {
                    const key = keyOf(c),
                        d = drafts.get(key) || c,
                        expanded = all || advanced.has(key),
                        isOpen = open.has(key);
                    return `<article class="cm-item ${isOpen ? "is-open" : ""}" data-index="${index}"><div class="cm-row"><button class="cm-toggle" data-action="toggle" aria-expanded="${isOpen}" title="${escape(c.name)} · ${escape(c.domain)}${escape(c.path)}"><span class="cm-name">${escape(c.name) || "(empty)"}</span><svg class="cm-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths.arrow}"/></svg></button>${`<button class="cm-icon cm-save" data-action="save" data-disabled="${!drafts.has(key)}" ${drafts.has(key) ? "" : "disabled"} aria-label="${t("save")} ${escape(c.name)}">${icon("save")}</button>`}<button class="cm-icon cm-delete" data-action="delete" aria-label="${t("remove")} ${escape(c.name)}">${icon("trash")}</button></div><div class="cm-collapse" ${isOpen ? "" : "hidden inert"}>${isOpen ? `<form class="cm-editor" novalidate>${fields(d, expanded, false)}</form>` : ""}</div></article>`;
                })
                .join("") ||
            `<div class="cm-empty">${t(ready ? (cookies.length ? "noMatch" : "empty") : "loading")}</div>`;
        list.scrollTop = scroll;
        $$(".cm-foot button").forEach((b) => {
            b.dataset.disabled = String(
                !ready ||
                    (["clear", "export"].includes(b.dataset.action) &&
                        !cookies.length),
            );
            b.disabled = busy || b.dataset.disabled === "true";
        });
    }
    const disclosures = new WeakMap();
    function animateDisclosure(panel, opening) {
        const previous = disclosures.get(panel);
        const fromHeight = panel.hidden
            ? 0
            : panel.getBoundingClientRect().height;
        const children = [...panel.children];
        const starts = children.map((child) => ({
            opacity: panel.hidden ? 0 : Number(getComputedStyle(child).opacity),
            transform: panel.hidden
                ? "translateY(-6px)"
                : getComputedStyle(child).transform,
        }));
        previous?.forEach((animation) => animation.cancel());
        panel.hidden = false;
        panel.inert = !opening;
        panel.style.height = "auto";
        const toHeight = opening ? panel.scrollHeight : 0;
        panel.style.overflow = "hidden";
        const options = {
            duration: matchMedia("(prefers-reduced-motion: reduce)").matches
                ? 0
                : 240,
            easing: "cubic-bezier(.22,.65,.25,1)",
            fill: "both",
        };
        const heightAnimation = panel.animate(
            [{ height: fromHeight + "px" }, { height: toHeight + "px" }],
            options,
        );
        const animations = [
            heightAnimation,
            ...children.map((child, index) =>
                child.animate(
                    [
                        starts[index],
                        {
                            opacity: opening ? 1 : 0,
                            transform: opening
                                ? "translateY(0)"
                                : "translateY(-6px)",
                        },
                    ],
                    options,
                ),
            ),
        ];
        disclosures.set(panel, animations);
        heightAnimation.onfinish = () => {
            if (disclosures.get(panel) !== animations) return;
            panel.hidden = !opening;
            panel.style.height = "";
            panel.style.overflow = "";
            animations.forEach((animation) => animation.cancel());
            disclosures.delete(panel);
        };
    }
    function toggleRow(row, cookie) {
        const key = keyOf(cookie),
            opening = !open.has(key);
        const panel = $(".cm-collapse", row);
        if (opening && !panel.firstElementChild) {
            panel.innerHTML = `<form class="cm-editor" novalidate>${fields(drafts.get(key) || cookie, all || advanced.has(key), false)}</form>`;
        }
        opening ? open.add(key) : open.delete(key);
        row.classList.toggle("is-open", opening);
        $("[data-action=toggle]", row).setAttribute(
            "aria-expanded",
            String(opening),
        );
        animateDisclosure(panel, opening);
    }
    function animateDetails(row, expanded) {
        const panel = $(".cm-advanced", row);
        if (!panel) return;
        const button = $("[data-action=more]", row);
        button.innerHTML = t(expanded ? "less" : "more") + icon("arrow");
        button.setAttribute("aria-expanded", String(expanded));
        animateDisclosure(panel, expanded);
    }
    async function refresh() {
        loadError = null;
        ready = false;
        render();
        const next = await manager.list();
        cookies = next;
        drafts.clear();
        ready = true;
        notice("");
        render();
    }
    function closeMenus() {
        $$(".cm-options").forEach((n) => (n.hidden = true));
        $$(".cm-select-trigger").forEach((n) =>
            n.setAttribute("aria-expanded", "false"),
        );
    }
    function closeModal() {
        $(".cm-overlay").hidden = true;
        confirmAction = null;
        modalReturn?.focus();
    }
    function modal(title, html, action) {
        modalReturn = document.activeElement;
        $("#cmDialogTitle").textContent = title;
        $(".cm-dialog-body").innerHTML = html;
        $(".cm-overlay").hidden = false;
        confirmAction = action;
        $(
            ".cm-dialog input:not([type=hidden]):not([disabled]), .cm-dialog textarea, .cm-dialog button",
        )?.focus();
    }
    function confirm(title, text, action, dangerous = false) {
        modal(
            title,
            `<p>${escape(text)}</p><div class="cm-dialog-actions"><button data-action="close">${t("cancel")}</button><button class="${dangerous ? "cm-danger" : "cm-primary"}" data-action="confirm">${t("confirm")}</button></div>`,
            async () => {
                closeModal();
                await action();
            },
        );
    }
    function guard(action) {
        if (drafts.size) confirm(t("discardTitle"), t("discard"), action);
        else action();
    }
    function summary(result) {
        const text = t("imported", {
            ok: result.succeeded,
            failed: result.errors.length,
        });
        const errors = result.errors
            .slice(0, 5)
            .map((e) => e.name + ": " + errorText(e.error))
            .join("\n");
        notice(text + (errors ? "\n" + errors : ""), !!result.errors.length);
    }
    async function enter() {
        loadError = null;
        ready = false;
        if (!document.getElementById("syncHome").hidden) {
            root.parentElement.style.setProperty(
                "--cm-popup-height",
                root.parentElement.getBoundingClientRect().height + "px",
            );
        }
        document.getElementById("syncHome").hidden = true;
        root.hidden = false;
        root.parentElement.classList.add("is-managing");
        shell();
        render();
        $(".cm-back").focus();
        await run(async () => {
            if (!ctx) {
                const [tab] = await chrome.tabs.query({
                    active: true,
                    currentWindow: true,
                });
                const stores = await chrome.cookies.getAllCookieStores();
                const store = stores.find((s) => s.tabIds.includes(tab?.id));
                if (!tab?.url || !/^https?:/.test(tab.url) || !store)
                    throw Error("unsupported");
                ctx = apiModel.context(tab.url, store.id);
                manager = apiModel.create(chrome.cookies, ctx);
            }
            await refresh();
        });
    }
    function leave() {
        window.PopupToast.clear();
        root.hidden = true;
        root.parentElement.classList.remove("is-managing");
        document.getElementById("syncHome").hidden = false;
        entry.focus();
    }
    function importDialog() {
        modal(
            t("import"),
            `<p>${t("importHint")}</p><textarea class="cm-json" aria-label="JSON" spellcheck="false"></textarea><input type="file" accept="application/json,.json" hidden id="cmImportFile"><p class="cm-error" role="alert"></p><div class="cm-dialog-actions"><button data-action="choose">${t("choose")}</button><button class="cm-primary" data-action="preview">${t("preview")}</button></div>`,
        );
    }
    function download() {
        const blob = new Blob([JSON.stringify(cookies, null, 2)], {
                type: "application/json",
            }),
            url = URL.createObjectURL(blob),
            a = document.createElement("a");
        a.href = url;
        a.download = "cookies-" + ctx.hostname + ".json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        closeModal();
    }
    root.addEventListener("input", (e) => {
        if (e.target.matches(".cm-search>input")) {
            query = e.target.value;
            render();
            return;
        }
        const form = e.target.closest(".cm-editor");
        if (!form) return;
        const c = cookies[Number(form.closest("[data-index]").dataset.index)];
        if (e.target.name === "session")
            form.elements.expiration.disabled = e.target.checked;
        drafts.set(keyOf(c), read(form, c));
        const button = $("[data-action=save]", form.closest(".cm-item"));
        button.dataset.disabled = "false";
        button.disabled = busy;
    });
    root.addEventListener("change", async (e) => {
        if (e.target.matches("[data-all]")) {
            all = e.target.checked;
            if (!all) advanced.clear();
            $$(".cm-item.is-open").forEach((row) => animateDetails(row, all));
        }
        if (e.target.id === "cmImportFile") {
            const file = e.target.files[0];
            if (!file) return;
            try {
                if (file.size > 2 * 1024 * 1024) throw Error("large");
                $(".cm-json").value = await file.text();
            } catch (error) {
                $(".cm-error").textContent = errorText(error);
            }
        }
        if (e.target.name === "session" && e.target.closest("#cmNewForm"))
            $("#cmNewForm").elements.expiration.disabled = e.target.checked;
    });
    root.addEventListener("submit", (e) => {
        e.preventDefault();
    });
    root.addEventListener("click", async (e) => {
        const button = e.target.closest("button");
        if (!button) {
            closeMenus();
            return;
        }
        if (busy) return;
        if (button.matches(".cm-select-trigger")) {
            const menu = $(".cm-options", button.parentElement),
                opening = menu.hidden;
            closeMenus();
            menu.hidden = !opening;
            button.setAttribute("aria-expanded", String(opening));
            if (opening) $("[aria-selected=true]", menu)?.focus();
            return;
        }
        if (button.dataset.option) {
            const parent = button.closest(".cm-select"),
                input = $("input", parent);
            input.value = button.dataset.option;
            $(".cm-select-trigger span", parent).textContent = $(
                "span",
                button,
            ).textContent;
            $$("[role=option]", parent).forEach((o) =>
                o.setAttribute("aria-selected", String(o === button)),
            );
            closeMenus();
            $(".cm-select-trigger", parent).focus();
            input.dispatchEvent(new Event("input", { bubbles: true }));
            return;
        }
        closeMenus();
        const action = button.dataset.action,
            row = button.closest("[data-index]"),
            c = row ? cookies[Number(row.dataset.index)] : null,
            key = c ? keyOf(c) : null;
        if (action === "back")
            guard(() => {
                drafts.clear();
                leave();
            });
        if (action === "refresh")
            guard(() => (manager ? run(refresh) : enter()));
        if (action === "toggle") {
            toggleRow(row, c);
            if (e.detail === 0) $("[data-action=toggle]", row).focus();
        }
        if (action === "more") {
            if (all) {
                all = false;
                $("[data-all]").checked = false;
                advanced = new Set(open);
                advanced.delete(key);
            } else advanced.has(key) ? advanced.delete(key) : advanced.add(key);
            animateDetails(row, advanced.has(key));
        }
        if (action === "save")
            await run(async () => {
                const written = await manager.save(
                    read($(".cm-editor", row), c),
                    c,
                );
                drafts.delete(key);
                const index = cookies.indexOf(c);
                cookies[index] = written;
                open.delete(key);
                open.add(keyOf(written));
                render();
                notice(t("saved"));
            });
        if (action === "delete")
            confirm(
                t("remove"),
                t("deleteBody", { name: c.name }),
                () =>
                    run(async () => {
                        await manager.remove(c);
                        cookies = cookies.filter((x) => x !== c);
                        drafts.delete(key);
                        render();
                        notice(t("deleted"));
                    }),
                true,
            );
        if (action === "clear")
            confirm(
                t("clearTitle"),
                t("clearBody", { host: ctx.hostname, count: cookies.length }),
                () =>
                    run(async () => {
                        const result = await manager.batch(
                            [...cookies],
                            manager.remove,
                        );
                        await refresh();
                        summary(result);
                    }),
                true,
            );
        if (action === "close") closeModal();
        if (action === "confirm" && confirmAction) await confirmAction();
        if (action === "add") {
            const initial = {
                name: "",
                value: "",
                domain: ctx.hostname,
                path: "/",
                hostOnly: true,
                session: true,
                secure: new URL(ctx.url).protocol === "https:",
                httpOnly: false,
                sameSite: "lax",
                storeId: ctx.storeId,
            };
            modal(
                t("add"),
                `<form id="cmNewForm" novalidate>${fields(initial, true, true)}<p class="cm-error" role="alert"></p><div class="cm-dialog-actions"><button type="button" data-action="close">${t("cancel")}</button><button type="button" class="cm-primary" data-action="create">${t("add")}</button></div></form>`,
            );
        }
        if (action === "create")
            await run(async () => {
                try {
                    await manager.save(
                        read($("#cmNewForm"), { storeId: ctx.storeId }),
                    );
                    closeModal();
                    await refresh();
                    notice(t("saved"));
                } catch (error) {
                    $(".cm-error").textContent = errorText(error);
                }
            });
        if (action === "import") guard(importDialog);
        if (action === "choose") $("#cmImportFile").click();
        if (action === "preview") {
            try {
                const items = manager.parseImport($(".cm-json").value);
                confirm(
                    t("import"),
                    t("importConfirm", {
                        host: ctx.hostname,
                        count: items.length,
                    }),
                    () =>
                        run(async () => {
                            const result = await manager.importItems(items);
                            await refresh();
                            summary(result);
                        }),
                );
            } catch (error) {
                $(".cm-error").textContent = errorText(error);
            }
        }
        if (action === "export")
            modal(
                t("export"),
                `<p>${t("exportHint", { count: cookies.length })}</p><div class="cm-dialog-actions"><button data-action="close">${t("cancel")}</button><button class="cm-primary" data-action="download">${t("download")}</button></div>`,
            );
        if (action === "download") download();
    });
    root.addEventListener("keydown", (e) => {
        const select = e.target.closest(".cm-select");
        if (
            select &&
            ["ArrowDown", "ArrowUp", "Home", "End", "Escape", "Tab"].includes(
                e.key,
            )
        ) {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                closeMenus();
                $(".cm-select-trigger", select).focus();
                return;
            }
            if (e.key === "Tab") {
                closeMenus();
                return;
            }
            e.preventDefault();
            const options = $$("[role=option]", select);
            closeMenus();
            $(".cm-options", select).hidden = false;
            $(".cm-select-trigger", select).setAttribute(
                "aria-expanded",
                "true",
            );
            const index = options.indexOf(document.activeElement),
                next =
                    e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? options.length - 1
                          : (index +
                                (e.key === "ArrowDown"
                                    ? 1
                                    : options.length - 1) +
                                options.length) %
                            options.length;
            options[next].focus();
            return;
        }
        if (!$(".cm-overlay").hidden) {
            if (e.key === "Escape" && !busy) {
                e.preventDefault();
                closeModal();
            }
            if (e.key === "Tab") {
                const focusable = $$(
                    "button:not(:disabled),input:not([type=hidden]):not(:disabled),textarea",
                    $(".cm-dialog"),
                ).filter((x) => x.getClientRects().length);
                const first = focusable[0],
                    last = focusable.at(-1);
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        }
    });
    entry.addEventListener("click", enter);
    window.CookieManager = {
        setLanguage(language) {
            lang = language === "zh" ? "zh" : "en";
            entry.querySelector("span").textContent = t("title");
            entry.setAttribute("aria-label", t("title"));
            entry.title = t("title");
            root.setAttribute("aria-label", t("title"));
            if (!root.hidden) {
                shell();
                render();
            }
        },
    };
    window.CookieManager.setLanguage("en");
})();
