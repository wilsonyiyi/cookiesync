const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../chrome/cookie-manager-api.js");
const ctx = M.context("https://app.example.com/dashboard", "0");
const base = {
    name: "sid",
    value: "old",
    domain: "app.example.com",
    path: "/",
    storeId: "0",
    hostOnly: true,
    session: true,
    secure: true,
    httpOnly: true,
    sameSite: "lax",
};
function fixture(initial = [base], options = {}) {
    let data = structuredClone(initial),
        writes = [];
    const api = {
        async getAll(filter) {
            return structuredClone(
                data.filter(
                    (c) =>
                        (!filter.name || c.name === filter.name) &&
                        (!filter.path || c.path === filter.path) &&
                        (!filter.storeId || c.storeId === filter.storeId) &&
                        (!filter.domain ||
                            c.domain.replace(/^\./, "") === filter.domain) &&
                        (!filter.url ||
                            new URL(filter.url).hostname ===
                                c.domain.replace(/^\./, "")) &&
                        (filter.partitionKey
                            ? !filter.partitionKey.topLevelSite ||
                              c.partitionKey?.topLevelSite ===
                                  filter.partitionKey.topLevelSite
                            : !c.partitionKey),
                ),
            );
        },
        async get(filter) {
            return options.ambiguous
                ? { ...base, domain: ".example.com" }
                : structuredClone(
                      data.find(
                          (c) =>
                              c.name === filter.name &&
                              new URL(filter.url).pathname === c.path &&
                              JSON.stringify(c.partitionKey) ===
                                  JSON.stringify(filter.partitionKey),
                      ),
                  );
        },
        async set(d) {
            writes.push(d);
            if (options.failSet) throw Error("blocked");
            const c = {
                ...d,
                domain: d.domain || new URL(d.url).hostname,
                hostOnly: !d.domain,
                session: d.expirationDate === undefined,
            };
            delete c.url;
            data = data.filter((x) => M.identity(x) !== M.identity(c));
            data.push(c);
            return structuredClone(c);
        },
        async remove(d) {
            if (options.failRemove) throw Error("blocked");
            data = data.filter(
                (c) =>
                    !(
                        c.name === d.name &&
                        c.path === new URL(d.url).pathname &&
                        JSON.stringify(c.partitionKey) ===
                            JSON.stringify(d.partitionKey)
                    ),
            );
            return d;
        },
    };
    return { api, manager: M.create(api, ctx), data: () => data, writes };
}
test("same identity update writes once, retains secure and HttpOnly", async () => {
    const f = fixture();
    const c = await f.manager.save({ ...base, value: "new" }, base);
    assert.equal(c.value, "new");
    assert.equal(f.data().length, 1);
    assert.equal(f.writes[0].secure, true);
    assert.equal(f.writes[0].httpOnly, true);
    assert.equal(f.writes[0].domain, undefined);
});
test("write rejection preserves original", async () => {
    const f = fixture([base], { failSet: true });
    await assert.rejects(
        f.manager.save({ ...base, name: "renamed" }, base),
        /blocked/,
    );
    assert.deepEqual(f.data(), [base]);
});
test("rename creates first then removes original", async () => {
    const f = fixture();
    await f.manager.save({ ...base, name: "renamed" }, base);
    assert.equal(f.data().length, 1);
    assert.equal(f.data()[0].name, "renamed");
});
test("rename cleanup failure reports partial outcome and preserves both", async () => {
    const f = fixture([base], { failRemove: true });
    await assert.rejects(
        f.manager.save({ ...base, name: "renamed" }, base),
        /renamePartial/,
    );
    assert.equal(f.data().length, 2);
});
test("collision refuses to overwrite another row", async () => {
    const f = fixture([base, { ...base, name: "other" }]);
    await assert.rejects(
        f.manager.save({ ...base, name: "other" }, base),
        /collision/,
    );
    assert.equal(f.writes.length, 0);
});
test("ambiguous domain removal is refused", async () => {
    const f = fixture([base], { ambiguous: true });
    await assert.rejects(f.manager.remove(base), /ambiguous/);
    assert.equal(f.data().length, 1);
});
test("deletion selects exact path and retains same-name sibling", async () => {
    const other = { ...base, path: "/dashboard" };
    const f = fixture([base, other]);
    await f.manager.remove(other);
    assert.deepEqual(f.data(), [base]);
});
test("stale website values are not overwritten", async () => {
    const f = fixture([{ ...base, value: "changed" }]);
    await assert.rejects(
        f.manager.save({ ...base, value: "edit" }, base),
        /stale/,
    );
    assert.equal(f.writes.length, 0);
});
test("partition and store are part of identity and survive writes", async () => {
    const c = {
        ...base,
        partitionKey: {
            topLevelSite: "https://example.com",
            hasCrossSiteAncestor: true,
        },
    };
    assert.notEqual(M.identity(c), M.identity(base));
    assert.notEqual(M.identity(base), M.identity({ ...base, storeId: "1" }));
    const f = fixture([base, c]);
    assert.equal((await f.manager.list()).length, 2);
    await f.manager.save({ ...c, value: "partition edit" }, c);
    assert.deepEqual(f.writes[0].partitionKey, c.partitionKey);
    assert.equal(f.data().find((x) => !x.partitionKey).value, "old");
});
test("import validates all entries before any write and refuses foreign domains/stores", () => {
    const f = fixture();
    for (const c of [
        { ...base, domain: "other.com" },
        { ...base, storeId: "1" },
        { ...base, session: false, expirationDate: 1 },
        { ...base, secure: false, sameSite: "no_restriction" },
        { ...base, path: "bad" },
    ])
        assert.throws(() => f.manager.parseImport(JSON.stringify([c])));
    assert.equal(f.writes.length, 0);
});
test("minimal JSON and export roundtrip support session cookies", async () => {
    const f = fixture([]);
    const items = f.manager.parseImport('[{"name":"hello","value":"world"}]');
    const r = await f.manager.importItems(items);
    assert.equal(r.succeeded, 1);
    assert.equal(f.data()[0].session, true);
    assert.equal(f.data()[0].domain, "app.example.com");
    assert.equal(f.manager.parseImport(JSON.stringify(f.data())).length, 1);
});
test("invalid types, duplicate identities and malformed JSON are rejected", () => {
    const f = fixture();
    for (const v of [
        "{}",
        "[]",
        "invalid",
        JSON.stringify([base, base]),
        JSON.stringify([{ ...base, secure: "true" }]),
    ])
        assert.throws(() => f.manager.parseImport(v));
});
test("batch waits, reports partial failures and continues", async () => {
    const f = fixture();
    const seen = [];
    const r = await f.manager.batch(
        [{ name: "a" }, { name: "b" }, { name: "c" }],
        async (c) => {
            await new Promise((resolve) => setTimeout(resolve, 2));
            seen.push(c.name);
            if (c.name === "b") throw Error("write");
        },
    );
    assert.deepEqual(seen, ["a", "b", "c"]);
    assert.equal(r.succeeded, 2);
    assert.deepEqual(r.errors, [{ name: "b", error: "write" }]);
});
test("host-only and domain cookies remain distinct", () => {
    assert.notEqual(
        M.identity(base),
        M.identity({ ...base, domain: ".app.example.com", hostOnly: false }),
    );
});
test("partition deletion retains the unpartitioned cookie", async () => {
    const c = {
        ...base,
        partitionKey: {
            topLevelSite: "https://example.com",
            hasCrossSiteAncestor: false,
        },
    };
    const f = fixture([base, c]);
    await f.manager.remove(c);
    assert.deepEqual(f.data(), [base]);
});
test("prefix and partition constraints reject invalid writes", () => {
    for (const c of [
        { ...base, name: "__Host-token", path: "/x" },
        { ...base, name: "__Secure-token", secure: false },
        { ...base, partitionKey: { topLevelSite: "not-a-site" } },
        {
            ...base,
            partitionKey: {
                topLevelSite: "https://example.com",
                hasCrossSiteAncestor: "yes",
            },
        },
    ])
        assert.throws(() => M.validate(c, ctx));
});
