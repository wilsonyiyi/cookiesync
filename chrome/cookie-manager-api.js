/* Cookie operations used by the popup. No cookie values are persisted or logged. */
(function (root) {
    "use strict";
    const fail = (code) => {
        throw new Error(code);
    };
    const host = (d) =>
        String(d || "")
            .replace(/^\./, "")
            .toLowerCase();
    const partition = (c) =>
        c.partitionKey
            ? [
                  c.partitionKey.topLevelSite,
                  Boolean(c.partitionKey.hasCrossSiteAncestor),
              ]
            : null;
    const identity = (c) =>
        JSON.stringify([
            host(c.domain),
            Boolean(c.hostOnly),
            c.name,
            c.path || "/",
            c.storeId,
            partition(c),
        ]);
    const snapshot = (c) =>
        JSON.stringify([
            identity(c),
            c.value,
            c.hostOnly,
            c.secure,
            c.httpOnly,
            c.sameSite,
            c.session,
            c.expirationDate,
        ]);
    function context(url, storeId) {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol) || !storeId)
            fail("unsupported");
        return { url: parsed.href, hostname: parsed.hostname, storeId };
    }
    function validate(c, ctx) {
        if (!c || typeof c.name !== "string" || typeof c.value !== "string")
            fail("invalid");
        if (
            /[\x00-\x20\x7f;=]/.test(c.name) ||
            /[\x00-\x1f\x7f;]/.test(c.value)
        )
            fail("invalid");
        if (
            typeof c.domain !== "string" ||
            !c.domain ||
            /[\s/:?#@]/.test(c.domain)
        )
            fail("domain");
        const domain = host(c.domain);
        if (
            ctx.hostname !== domain &&
            (c.hostOnly || !ctx.hostname.endsWith("." + domain))
        )
            fail("domain");
        if (c.storeId && c.storeId !== ctx.storeId) fail("store");
        if (
            typeof c.path !== "string" ||
            !c.path.startsWith("/") ||
            /[\x00-\x1f\x7f;?#]/.test(c.path)
        )
            fail("path");
        for (const key of ["hostOnly", "session", "secure", "httpOnly"])
            if (typeof c[key] !== "boolean") fail("invalid");
        if (
            !["unspecified", "no_restriction", "lax", "strict"].includes(
                c.sameSite,
            )
        )
            fail("invalid");
        if (
            !c.session &&
            (!Number.isFinite(c.expirationDate) ||
                c.expirationDate <= Date.now() / 1000)
        )
            fail("expiry");
        if (c.sameSite === "no_restriction" && !c.secure) fail("secure");
        if (c.name.startsWith("__Secure-") && !c.secure) fail("secure");
        if (
            c.name.startsWith("__Host-") &&
            (!c.secure || !c.hostOnly || c.path !== "/")
        )
            fail("prefix");
        if (c.partitionKey) {
            if (
                typeof c.partitionKey !== "object" ||
                typeof c.partitionKey.topLevelSite !== "string"
            )
                fail("partition");
            const site = new URL(c.partitionKey.topLevelSite);
            if (
                !["http:", "https:"].includes(site.protocol) ||
                site.origin !== c.partitionKey.topLevelSite ||
                !c.secure
            )
                fail("partition");
            if (
                c.partitionKey.hasCrossSiteAncestor !== undefined &&
                typeof c.partitionKey.hasCrossSiteAncestor !== "boolean"
            )
                fail("partition");
        }
        return { ...c, storeId: ctx.storeId };
    }
    function details(c) {
        const result = {
            url: (c.secure ? "https://" : "http://") + host(c.domain) + c.path,
            name: c.name,
            value: c.value,
            path: c.path,
            secure: c.secure,
            httpOnly: c.httpOnly,
            sameSite: c.sameSite,
            storeId: c.storeId,
        };
        if (!c.hostOnly) result.domain = c.domain;
        if (!c.session) result.expirationDate = c.expirationDate;
        if (c.partitionKey) result.partitionKey = { ...c.partitionKey };
        return result;
    }
    function selector(c) {
        const { url, name, storeId, partitionKey } = details(c);
        return {
            url,
            name,
            storeId,
            ...(partitionKey ? { partitionKey } : {}),
        };
    }
    function create(api, ctx) {
        async function list() {
            const filter = { url: ctx.url, storeId: ctx.storeId };
            const plain = await api.getAll(filter);
            // Empty partition filter enumerates partitioned cookies; retain their exact key.
            const partitioned = await api.getAll({
                ...filter,
                partitionKey: {},
            });
            return [
                ...new Map(
                    [...plain, ...partitioned].map((c) => [identity(c), c]),
                ).values(),
            ];
        }
        async function find(c) {
            const matches = await api.getAll({
                domain: host(c.domain),
                name: c.name,
                path: c.path,
                storeId: c.storeId,
                ...(c.partitionKey ? { partitionKey: c.partitionKey } : {}),
            });
            return matches.find((x) => identity(x) === identity(c));
        }
        async function unchanged(c) {
            const live = await find(c);
            if (!live || snapshot(live) !== snapshot(c)) fail("stale");
            return live;
        }
        async function set(c) {
            const result = await api.set(details(c));
            if (!result) fail("write");
            const live = await find(result);
            if (
                !live ||
                live.value !== c.value ||
                live.secure !== c.secure ||
                live.httpOnly !== c.httpOnly ||
                live.hostOnly !== c.hostOnly ||
                live.session !== c.session ||
                live.sameSite !== c.sameSite ||
                identity(live) !== identity(c)
            )
                fail("verify");
            return live;
        }
        async function remove(c) {
            await unchanged(c);
            // Chrome chooses by URL/name, not exact domain. Refuse ambiguous deletion.
            const chosen = await api.get(selector(c));
            if (!chosen || identity(chosen) !== identity(c)) fail("ambiguous");
            const result = await api.remove(selector(c));
            if (!result || (await find(c))) fail("remove");
        }
        async function save(input, original) {
            const next = validate(input, ctx);
            if (original) {
                await unchanged(original);
                if (
                    JSON.stringify(partition(next)) !==
                    JSON.stringify(partition(original))
                )
                    fail("partition");
            }
            const changed = !original || identity(original) !== identity(next);
            if (changed && (await find(next))) fail("collision");
            if (original && changed) {
                const chosen = await api.get(selector(original));
                if (!chosen || identity(chosen) !== identity(original))
                    fail("ambiguous");
            }
            const written = await set(next);
            if (original && changed) {
                try {
                    await remove(original);
                } catch (_) {
                    throw new Error("renamePartial");
                }
            }
            return written;
        }
        async function batch(items, action) {
            const result = { succeeded: 0, errors: [] };
            for (const item of items) {
                try {
                    await action(item);
                    result.succeeded++;
                } catch (error) {
                    result.errors.push({
                        name: item.name,
                        error: error.message,
                    });
                }
            }
            return result;
        }
        function parseImport(text) {
            if (text.length > 2 * 1024 * 1024) fail("large");
            let items;
            try {
                items = JSON.parse(text);
            } catch (_) {
                fail("json");
            }
            if (!Array.isArray(items) || !items.length || items.length > 1000)
                fail("json");
            const seen = new Set();
            return items.map((item) => {
                if (!item || typeof item !== "object" || Array.isArray(item))
                    fail("invalid");
                const c = validate(
                    {
                        name: item.name,
                        value: item.value,
                        domain: item.domain || ctx.hostname,
                        path: item.path === undefined ? "/" : item.path,
                        hostOnly:
                            item.hostOnly === undefined
                                ? !String(item.domain || "").startsWith(".")
                                : item.hostOnly,
                        session:
                            item.session === undefined
                                ? item.expirationDate === undefined
                                : item.session,
                        secure:
                            item.secure === undefined
                                ? new URL(ctx.url).protocol === "https:"
                                : item.secure,
                        httpOnly:
                            item.httpOnly === undefined ? false : item.httpOnly,
                        sameSite: item.sameSite || "unspecified",
                        expirationDate: item.expirationDate,
                        storeId: item.storeId,
                        partitionKey: item.partitionKey,
                    },
                    ctx,
                );
                if (seen.has(identity(c))) fail("duplicate");
                seen.add(identity(c));
                return c;
            });
        }
        async function importItems(items) {
            return batch(items, async (c) => {
                const existing = await find(c);
                await save(c, existing);
            });
        }
        return { list, save, remove, batch, parseImport, importItems };
    }
    const exported = { create, context, identity, snapshot, details, validate };
    if (typeof module !== "undefined" && module.exports)
        module.exports = exported;
    else root.CookieManagerAPI = exported;
})(globalThis);
