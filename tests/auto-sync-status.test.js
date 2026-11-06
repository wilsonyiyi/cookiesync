const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function eventTarget() {
  return {addListener() {}};
}

function loadServiceWorker(setCookie) {
  const writes = [];
  const messages = [];
  const context = {
    console: {log() {}, warn() {}},
    importScripts() {},
    CookieSyncForm: {
      COOKIE_NAME: "cookiesync_form",
      async loadForm() {
        return {regexHost: ".*\\.example\\.com", regexNames: "^session_id$"};
      },
      async saveForm() {},
      async applyIncomingBackup() {
        return {restored: false, form: {}};
      },
      hasFormValues() {
        return false;
      },
      serializeBackup() {
        return "";
      },
      isLocalhostUrl() {
        return false;
      }
    },
    CookieSyncUpdate: {
      STORAGE_KEY: "updateCheck",
      MIN_BACKOFF_MS: 300000,
      shouldSkipFetch() {
        return true;
      },
      remainingDelayMs() {
        return 300000;
      }
    },
    chrome: {
      storage: {
        local: {
          async get() {
            return {};
          },
          async set(value) {
            writes.push(value);
          }
        }
      },
      cookies: {
        set: setCookie,
        async getAll() {
          return [];
        },
        onChanged: eventTarget()
      },
      runtime: {
        lastError: null,
        getManifest() {
          return {version: "1.5.0"};
        },
        onConnect: eventTarget(),
        onInstalled: eventTarget(),
        onStartup: eventTarget(),
        onMessage: {addListener(listener) { messages.push(listener); }}
      },
      alarms: {
        async clear() {},
        create() {},
        onAlarm: eventTarget()
      },
      tabs: {
        onUpdated: eventTarget()
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../chrome/service_worker.js"), "utf8"),
    context
  );
  return {context, writes, messages};
}

test("automatic cookie sync stores the latest successful sync time", async () => {
  const startedAt = Date.now();
  const {context, writes} = loadServiceWorker(async () => ({name: "session_id"}));

  await context.syncChangedCookie({
    name: "session_id",
    value: "mock-value",
    path: "/",
    httpOnly: true,
    secure: true
  });

  const state = writes.at(-1).lastSyncStatus;
  assert.equal(state.type, "success");
  assert.equal(state.copied, 1);
  assert.equal(state.failed, 0);
  assert.equal(state.error, "");
  assert.ok(state.timestamp >= startedAt);
});

test("automatic cookie sync stores the latest failure time", async () => {
  const {context, writes} = loadServiceWorker(async () => {
    throw new Error("mock copy failure");
  });

  await context.syncChangedCookie({
    name: "session_id",
    value: "mock-value",
    path: "/"
  });

  const state = writes.at(-1).lastSyncStatus;
  assert.equal(state.type, "error");
  assert.equal(state.copied, 0);
  assert.equal(state.failed, 1);
  assert.equal(state.error, "mock copy failure");
  assert.equal(typeof state.timestamp, "number");
});

test("popup observes background sync status changes", () => {
  const popup = fs.readFileSync(path.join(__dirname, "../chrome/popup.js"), "utf8");
  assert.match(popup, /changes\[lastSyncKey\]/);
  assert.match(popup, /applyStoredSyncState\(changes\[lastSyncKey\]\.newValue\)/);
});


test("config import acknowledges persistence and refreshed background matchers", async () => {
  const {context, messages} = loadServiceWorker(async () => ({}));
  const form = {regexHost: "^demo\\.example$", regexNames: "^sample$"};
  let saved = false;
  context.CookieSyncForm.parseSharePayload = () => form;
  context.CookieSyncForm.saveForm = async (value) => {
    assert.equal(value, form);
    await new Promise(resolve => setImmediate(resolve));
    saved = true;
  };
  context.CookieSyncForm.loadForm = async () => {
    assert.equal(saved, true);
    return form;
  };
  const response = await new Promise(resolve => {
    assert.equal(messages[0]({importConfig: {}}, {}, resolve), true);
  });
  assert.equal(response.ok, true);
  assert.equal(context.hostsArray[0], form.regexHost);
  assert.equal(context.namesArray[0], form.regexNames);
  context.CookieSyncForm.saveForm = async () => { throw Error("storage rejected"); };
  const failure = await new Promise(resolve => messages[0]({importConfig:{}}, {}, resolve));
  assert.equal(failure.ok, false);
});

test('rapid configuration edits stay ordered and recover after a failed write',async()=>{
  const {context,messages}=loadServiceWorker(async()=>({}));
  let stored={regexHost:'',regexNames:''};
  const seen=[];
  context.CookieSyncForm.saveForm=async value=>{
    await new Promise(resolve=>setTimeout(resolve,value.regexHost==='first'?15:0));
    if(value.regexHost==='fail')throw Error('write failed');
    stored=value;seen.push(value.regexHost);
  };
  context.CookieSyncForm.loadForm=async()=>stored;
  const send=regexHost=>new Promise(resolve=>messages[0]({updateConfig:{regexHost,regexNames:'cookie'}},{},resolve));
  const responses=await Promise.all([send('first'),send('fail'),send('last')]);
  assert.deepEqual(seen,['first','last']);
  assert.deepEqual(responses.map(r=>r.ok),[true,false,true]);
  assert.equal(context.hostsArray[0],'last');
});
