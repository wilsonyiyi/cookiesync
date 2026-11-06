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
test('config import waits for acknowledged save before changing UI or reporting success',async()=>{
    let complete, request;
    const p=popup(m=>{request=m;return new Promise(resolve=>complete=resolve)});
    const pending=p.context.importConfigFile({text:async()=>payload});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(p.button.disabled,true);
    assert.equal(p.calls.filled.length,0);
    assert.equal(p.calls.toast.length,0);
    assert.equal(request.importConfig.regexNames,'^demo$');
    complete({ok:true});await pending;
    assert.equal(p.calls.filled.length,2);
    assert.deepEqual(p.calls.closed,[false]);
    assert.equal(p.calls.toast.length,1);
    assert.equal(p.button.disabled,false);
});
test('read, parse and storage failures keep settings open with retry feedback',async()=>{
    for(const mode of ['read','parse','save','disconnect']) {
        let writes=0;
        const p=popup(async()=>{writes++;if(mode==='disconnect')throw Error('disconnected');return {ok:false}});
        await p.context.importConfigFile({text:async()=>{if(mode==='read')throw Error('read');return mode==='parse'?'invalid':payload}});
        assert.equal(writes,['save','disconnect'].includes(mode)?1:0);
        assert.equal(p.calls.filled.length,0);
        assert.equal(p.calls.closed.length,0);
        assert.equal(p.calls.toast.length,0);
        assert.ok(p.calls.warnings.at(-1));
        assert.equal(p.button.disabled,false);
    }
});

test('import does not dispatch synthetic edits through a disconnected editor port', async () => {
    const p=popup(async()=>({ok:true}));
    const elements = new Map();
    p.context.document.getElementById = id => {
        if(id==='importButton')return p.button;
        if(!elements.has(id))elements.set(id,{value:'',dispatchEvent(){throw Error('Attempting to use a disconnected port object')}});
        return elements.get(id);
    };
    const source=fs.readFileSync('chrome/popup.js','utf8');
    vm.runInContext(source.slice(source.indexOf('function fillEditor('),source.indexOf('\nfunction exportConfig(')),p.context);
    p.context.updateEditorMeta=()=>{};
    await p.context.importConfigFile({text:async()=>payload});
    assert.equal(elements.get('regexhost').value,'^example\\.com$');
    assert.equal(elements.get('regexnames').value,'^demo$');
    assert.equal(p.calls.toast.length,1);
});

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
