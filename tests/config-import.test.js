const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const form = require('../chrome/form-cache');
const payload = JSON.stringify(form.buildSharePayload({regexHost:'^example\\.com$',regexNames:'^demo$'}));
function popup(sendMessage) {
    const button = {disabled:false};
    const calls = {warnings:[],filled:[],closed:[],toast:[]};
    const context = {chrome:{runtime:{sendMessage}}, CookieSyncForm:form,
        document:{getElementById:()=>button},window:{PopupToast:{show:v=>calls.toast.push(v)}}};
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('chrome/popup.js','utf8').replace(/initialize\(\);\s*$/, ''),context);
    context.setWarning=v=>calls.warnings.push(v);
    context.fillEditor=(...args)=>calls.filled.push(args);
    context.setSettingsOpen=v=>calls.closed.push(v);
    return {context,calls,button};
}
test('manual rule edits handle messaging failure and recover on the next edit', async () => {
    let fail=true, request;
    const p=popup(async message=>{request=message;if(fail)throw Error('disconnected');return {ok:true}});
    const handlers={};
    const editor={value:'',addEventListener:(event,fn)=>handlers[event]=fn};
    p.context.document.getElementById=()=>editor;
    p.context.updateEditorMeta=()=>{};
    p.context.readVisibleForm=()=>({regexHost:'^demo$',regexNames:'^cookie$'});
    p.context.setupEditor({initialValue:'^old$',defaultValue:''});
    await handlers.input();
    assert.ok(p.calls.warnings.at(-1));
    fail=false;
    await handlers.input();
    assert.equal(request.updateConfig.regexHost,'^demo$');
    assert.equal(p.calls.warnings.at(-1),'');
});


const {createImporter} = require('../chrome/config-import');
test('persistent import reads and saves without toolbar popup state', async () => {
    const states=[];
    let finishRead, finishSave;
    const importer=createImporter({parse:form.parseSharePayload,save:()=>new Promise(r=>finishSave=r),onState:s=>states.push(s)});
    const pending=importer({text:()=>new Promise(r=>finishRead=r)});
    assert.equal(states.at(-1).type,'reading');
    // The originating toolbar popup need not exist during the file read.
    finishRead(payload);
    await new Promise(r=>setImmediate(r));
    assert.equal(states.at(-1).type,'saving');
    finishSave({ok:true});await pending;
    assert.deepEqual(states.at(-1),{type:'success',hosts:1,names:1});
});
test('cancel, invalid file, read failure and save failure remain retryable',async()=>{
    const states=[];
    let fail=true;
    const importer=createImporter({parse:form.parseSharePayload,save:async()=>({ok:!fail}),onState:s=>states.push(s)});
    await importer(undefined);assert.equal(states.length,0);
    await importer({text:async()=>{throw Error('read')}});assert.equal(states.at(-1).type,'readFailed');
    await importer({text:async()=>'{bad json'});assert.equal(states.at(-1).type,'invalid');
    await importer({text:async()=>payload});assert.equal(states.at(-1).type,'saveFailed');
    fail=false;await importer({text:async()=>payload});assert.equal(states.at(-1).type,'success');
});
test('toolbar import delegates window creation without invoking a file picker',async()=>{
    let request, listener;
    const p=popup(async message=>{request=message;return {ok:true}});
    const elements={
        exportButton:{addEventListener(){}},
        importButton:{disabled:false,addEventListener(event,fn){listener=fn}}
    };
    p.context.document.getElementById=id=>elements[id];
    p.context.setupShareActions();await listener();
    assert.equal(request.openConfigImport,true);
    assert.equal(elements.importButton.disabled,false);
    assert.equal(p.calls.warnings.length,0);
});
