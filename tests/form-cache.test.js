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

function mockBackup(initialValue) {
  let value = initialValue || null;
  let legacyCleared = false;
  return {
    async read() {
      return formCache.parseBackup(value);
    },
    async write(data) {
      value = formCache.hasFormValues(data) ? formCache.serializeBackup(data) : null;
    },
    async clearLegacyCookie() {
      legacyCleared = true;
    },
    getValue() {
      return value;
    },
    wasLegacyCleared() {
      return legacyCleared;
    }
  };
}

test("serializes and parses JSON localStorage backups", () => {
  const encoded = formCache.serializeBackup({
    regexHost: ".*\\.foo\\.com",
    regexNames: "session_id",
    preferredLanguage: "zh"
  });
  assert.deepEqual(formCache.parseBackup(encoded), {
    regexHost: ".*\\.foo\\.com",
    regexNames: "session_id",
    preferredLanguage: "zh"
  });
  assert.equal(formCache.parseBackup("not-json"), null);
});

test("parses legacy encoded cookie backups", () => {
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
  assert.deepEqual(formCache.parseBackup(encoded), {
    regexHost: ".*\\.foo\\.com",
    regexNames: "session_id",
    preferredLanguage: "zh"
  });
});

test("restores form values from localStorage backup when storage is empty", async () => {
  const storage = mockStorage({});
  const backup = mockBackup(formCache.serializeBackup({
    regexHost: "auth.example.com",
    regexNames: "^token$"
  }));

  const form = await formCache.loadForm(storage, backup);
  assert.equal(form.regexHost, "auth.example.com");
  assert.equal(form.regexNames, "^token$");
  assert.equal(storage.data.regexHost, "auth.example.com");
  assert.equal(backup.wasLegacyCleared(), true);
});

test("keeps storage values and refreshes the localStorage backup", async () => {
  const storage = mockStorage({
    regexHost: "stored.example.com",
    regexNames: "sid"
  });
  const backup = mockBackup();

  const form = await formCache.loadForm(storage, backup);
  assert.equal(form.regexHost, "stored.example.com");
  assert.deepEqual(formCache.parseBackup(backup.getValue()), {
    regexHost: "stored.example.com",
    regexNames: "sid",
    preferredLanguage: ""
  });
  assert.equal(backup.wasLegacyCleared(), true);
});

test("saveForm writes both storage and localStorage backup", async () => {
  const storage = mockStorage({regexHost: "old.com", regexNames: "old"});
  const backup = mockBackup();

  await formCache.saveForm({regexHost: "new.com"}, storage, backup);
  assert.equal(storage.data.regexHost, "new.com");
  assert.equal(formCache.parseBackup(backup.getValue()).regexHost, "new.com");
  assert.equal(formCache.parseBackup(backup.getValue()).regexNames, "old");
  assert.equal(backup.wasLegacyCleared(), true);
});

test("applyIncomingBackup restores empty storage from the page value", async () => {
  const storage = mockStorage({});
  const backup = mockBackup();
  const result = await formCache.applyIncomingBackup(
    formCache.serializeBackup({regexHost: "page.example.com", regexNames: "sid"}),
    storage,
    backup
  );

  assert.equal(result.restored, true);
  assert.equal(result.form.regexHost, "page.example.com");
  assert.equal(storage.data.regexHost, "page.example.com");
  assert.equal(backup.wasLegacyCleared(), true);
});

test("applyIncomingBackup prefers storage over the page backup", async () => {
  const storage = mockStorage({regexHost: "stored.example.com", regexNames: "sid"});
  const backup = mockBackup();
  const result = await formCache.applyIncomingBackup(
    formCache.serializeBackup({regexHost: "page.example.com", regexNames: "other"}),
    storage,
    backup
  );

  assert.equal(result.restored, false);
  assert.equal(result.form.regexHost, "stored.example.com");
  assert.equal(formCache.parseBackup(backup.getValue()).regexHost, "stored.example.com");
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
