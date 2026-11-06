/* File reads belong to the persistent import window, never the toolbar popup. */
(function(root) {
    function createImporter({parse, save, onState}) {
        let busy = false;
        return async function importFile(file) {
            if (!file || busy) return;
            busy = true;
            onState({type: "reading"});
            try {
                let raw;
                try { raw = await file.text(); }
                catch (error) { onState({type: "readFailed"}); return; }
                const form = parse(raw);
                if (!form) { onState({type: "invalid"}); return; }
                onState({type: "saving"});
                const result = await save(form);
                if (!result || !result.ok) { onState({type: "saveFailed"}); return; }
                const count = value => value.split(/\r?\n/).filter(line => line.trim()).length;
                onState({type: "success", hosts: count(form.regexHost), names: count(form.regexNames)});
            } catch (error) {
                onState({type: "saveFailed"});
            } finally { busy = false; }
        };
    }
    if (typeof module !== "undefined" && module.exports) module.exports = {createImporter};
    else root.CookieSyncConfigImport = {createImporter};
})(globalThis);
