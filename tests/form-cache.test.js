const assert = require("node:assert/strict");
const test = require("node:test");
const formCache = require("../chrome/form-cache");

function mockStorage(initial) {
  const data = Object.assign({}, initial);
  return {
    async get(keys) {
      const out = {};
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
        out[key] = data[key];
      });
      return out;
    },
    async set(partial) {
      Object.assign(data, partial);
    },
    data
  };
}

function mockCookies(initialValue) {
  let value = initialValue || null;
  return {
    async get() {
      return value ? {value} : null;
    },
    async set(details) {
      value = details.value;
      return details;
    },
    getValue() {
      return value;
    }
  };
}

test("serializes and parses form backup cookies", () => {
  const encoded = formCache.serializeForm({
    regexHost: ".*\\.foo\\.com",
    regexNames: "session_id",
    preferredLanguage: "zh"
  });
  assert.deepEqual(formCache.parseForm(encoded), {
    regexHost: ".*\\.foo\\.com",
    regexNames: "session_id",
    preferredLanguage: "zh"
  });
  assert.equal(formCache.parseForm("not-json"), null);
});

test("restores form values from localhost cookie when storage is empty", async () => {
  const storage = mockStorage({});
  const cookies = mockCookies(formCache.serializeForm({
    regexHost: "auth.example.com",
    regexNames: "^token$"
  }));

  const form = await formCache.loadForm(storage, cookies);
  assert.equal(form.regexHost, "auth.example.com");
  assert.equal(form.regexNames, "^token$");
  assert.equal(storage.data.regexHost, "auth.example.com");
});

test("keeps storage values and refreshes the backup cookie", async () => {
  const storage = mockStorage({
    regexHost: "stored.example.com",
    regexNames: "sid"
  });
  const cookies = mockCookies();

  const form = await formCache.loadForm(storage, cookies);
  assert.equal(form.regexHost, "stored.example.com");
  assert.deepEqual(formCache.parseForm(cookies.getValue()), {
    regexHost: "stored.example.com",
    regexNames: "sid",
    preferredLanguage: ""
  });
});

test("saveForm writes both storage and backup cookie", async () => {
  const storage = mockStorage({regexHost: "old.com", regexNames: "old"});
  const cookies = mockCookies();

  await formCache.saveForm({regexHost: "new.com"}, storage, cookies);
  assert.equal(storage.data.regexHost, "new.com");
  assert.equal(formCache.parseForm(cookies.getValue()).regexHost, "new.com");
  assert.equal(formCache.parseForm(cookies.getValue()).regexNames, "old");
});

test("builds and parses a shareable config file", () => {
  const payload = formCache.buildSharePayload({
    regexHost: ".*\\.corp\\.com",
    regexNames: "^sid$\n^token$",
    preferredLanguage: "zh"
  });

  assert.equal(payload.app, "cookiesync");
  assert.equal(payload.version, 1);
  assert.equal(payload.preferredLanguage, undefined);
  assert.deepEqual(formCache.parseSharePayload(JSON.stringify(payload)), {
    regexHost: ".*\\.corp\\.com",
    regexNames: "^sid$\n^token$"
  });
});

test("rejects invalid share files", () => {
  assert.equal(formCache.parseSharePayload("{"), null);
  assert.equal(formCache.parseSharePayload({app: "other", version: 1, regexHost: "a.com"}), null);
  assert.equal(formCache.parseSharePayload({app: "cookiesync", version: 1, regexHost: "", regexNames: ""}), null);
});
