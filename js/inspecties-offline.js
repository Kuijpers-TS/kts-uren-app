        // =====================================================================
        // OFFLINE INSPECTIES · IndexedDB + sync-outbox
        // =====================================================================
        // Doel: een monteur kan een inspectie op kantoor "voorbereiden voor
        // offline" (inspectie + vragen + plattegronden/tekeningen lokaal), op
        // locatie zonder bereik invullen (antwoorden lokaal opgeslagen), en
        // zodra er weer verbinding is synct de app de antwoorden automatisch
        // naar Supabase.
        //
        // Twee IndexedDB-stores:
        //   'inspecties'  (key: id)   -> { id, insp, answers, counts, dirty,
        //                                   preparedAt, syncedAt }
        //   'documenten'  (key: path) -> { path, blob, type, name }
        // -----------------------------------------------------------------

        let _inspOfflineDB = null;
        const INSP_DB_NAME = 'kts-inspecties';
        const INSP_DB_VERSION = 1;

        function _inspIdbOpen() {
            return new Promise((resolve, reject) => {
                if (_inspOfflineDB) return resolve(_inspOfflineDB);
                if (!('indexedDB' in window)) return reject(new Error('IndexedDB niet beschikbaar'));
                const req = indexedDB.open(INSP_DB_NAME, INSP_DB_VERSION);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('inspecties')) db.createObjectStore('inspecties', { keyPath: 'id' });
                    if (!db.objectStoreNames.contains('documenten')) db.createObjectStore('documenten', { keyPath: 'path' });
                };
                req.onsuccess = (e) => { _inspOfflineDB = e.target.result; resolve(_inspOfflineDB); };
                req.onerror = () => reject(req.error);
            });
        }
        function _inspIdb(store, mode, fn) {
            return _inspIdbOpen().then(db => new Promise((resolve, reject) => {
                const tx = db.transaction(store, mode);
                const req = fn(tx.objectStore(store));
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            }));
        }
        const inspIdbGet = (store, key) => _inspIdb(store, 'readonly', s => s.get(key));
        const inspIdbGetAll = (store) => _inspIdb(store, 'readonly', s => s.getAll());
        const inspIdbPut = (store, val) => _inspIdb(store, 'readwrite', s => s.put(val));
        const inspIdbDel = (store, key) => _inspIdb(store, 'readwrite', s => s.delete(key));

        // Antwoord-tellingen (zelfde logica als inspAnswer/inspSaveTemplate).
        function inspCountAnswers(answers) {
            const vals = Object.values(answers || {});
            return {
                answered_questions: vals.filter(a => a && a.value !== undefined && a.value !== '').length,
                passed_questions: vals.filter(a => a && a.value === 'goed').length,
                failed_questions: vals.filter(a => a && a.value === 'fout').length,
            };
        }

        // Set met id's van inspecties die offline klaarstaan · gevuld bij het
        // laden van de lijst zodat de badge synchroon te renderen is.
        window._inspPreparedIds = new Set();
        async function inspLoadPreparedIds() {
            try {
                const all = await inspIdbGetAll('inspecties');
                window._inspPreparedIds = new Set((all || []).filter(b => b.preparedAt).map(b => b.id));
            } catch (e) { window._inspPreparedIds = new Set(); }
            return window._inspPreparedIds;
        }
        function inspIsPrepared(id) { return window._inspPreparedIds && window._inspPreparedIds.has(id); }

        // ---- Voorbereiden voor offline ----
        async function inspPrepareOffline(inspectionId) {
            if (!navigator.onLine) { showToast('⚠️ Verbind eerst met internet om voor te bereiden'); return; }
            const sb = getSupabase();
            if (!sb) { showToast('⚠️ Niet verbonden'); return; }
            showToast('⏳ Offline voorbereiden...', 4000);
            try {
                // 1. Inspectie + template (met documenten) ophalen
                let { data: insp, error } = await sb.from('inspections')
                    .select('*, inspection_templates(name, sections, location, installation, asset, frequency, category, plattegrond_path, documents)')
                    .eq('id', inspectionId).single();
                if (error && /plattegrond_path|documents|column/.test(error.message || '')) {
                    ({ data: insp, error } = await sb.from('inspections')
                        .select('*, inspection_templates(name, sections, location, installation, asset, frequency, category)')
                        .eq('id', inspectionId).single());
                }
                if (error || !insp) throw error || new Error('Inspectie niet gevonden');

                // 2. Documenten downloaden en lokaal opslaan
                const tpl = insp.inspection_templates || {};
                const docs = (typeof inspTemplateDocs === 'function') ? inspTemplateDocs(tpl) : [];
                let okDocs = 0;
                for (const d of docs) {
                    if (!d || !d.path) continue;
                    try {
                        const { data: blob, error: dErr } = await sb.storage.from('inspections').download(d.path);
                        if (dErr || !blob) continue;
                        await inspIdbPut('documenten', { path: d.path, blob, type: d.type || 'plattegrond', name: d.name || d.path.split('/').pop() });
                        okDocs++;
                    } catch (e) { /* dit document overslaan, rest gaat door */ }
                }

                // 3. Bundle opslaan (bestaande lokale antwoorden niet overschrijven
                //    als die nog niet gesynct zijn)
                const bestaand = await inspIdbGet('inspecties', inspectionId);
                const answers = (bestaand && bestaand.dirty) ? bestaand.answers : (insp.answers || {});
                await inspIdbPut('inspecties', {
                    id: inspectionId,
                    insp,
                    answers,
                    counts: inspCountAnswers(answers),
                    dirty: bestaand ? !!bestaand.dirty : false,
                    preparedAt: new Date().toISOString(),
                    syncedAt: (bestaand && bestaand.syncedAt) || new Date().toISOString(),
                });
                window._inspPreparedIds.add(inspectionId);
                const docTxt = docs.length ? ` · ${okDocs}/${docs.length} document${docs.length === 1 ? '' : 'en'}` : '';
                showToast('✓ Klaar voor offline' + docTxt);
                if (typeof inspLoadUserInspections === 'function') inspLoadUserInspections();
            } catch (err) {
                showToast('❌ Offline voorbereiden mislukt: ' + (err.message || err));
            }
        }

        // ---- Lokale bundle ophalen ----
        function inspGetOfflineBundle(id) { return inspIdbGet('inspecties', id); }

        // ---- Antwoorden lokaal opslaan (vanuit inspAnswer) ----
        // dirty=true betekent: nog niet naar Supabase gesynct.
        async function inspPersistAnswersLocal(dirty) {
            const st = window._inspActive;
            if (!st || !st.id) return;
            try {
                const bestaand = await inspIdbGet('inspecties', st.id);
                const insp = (bestaand && bestaand.insp) || st.insp || { id: st.id };
                await inspIdbPut('inspecties', {
                    id: st.id,
                    insp,
                    answers: st.answers,
                    counts: inspCountAnswers(st.answers),
                    dirty: !!dirty,
                    preparedAt: bestaand ? bestaand.preparedAt : null,
                    syncedAt: dirty ? (bestaand && bestaand.syncedAt) || null : new Date().toISOString(),
                });
            } catch (e) { /* lokaal opslaan faalde · in-memory state blijft intact */ }
        }

        // ---- Lokaal document ophalen als object-URL (of null) ----
        async function inspGetLocalDocUrl(path) {
            try {
                const rec = await inspIdbGet('documenten', path);
                if (rec && rec.blob) return URL.createObjectURL(rec.blob);
            } catch (e) { /* val terug op download */ }
            return null;
        }

        // ---- Sync-outbox: alle 'dirty' inspecties naar Supabase pushen ----
        let _inspSyncBezig = false;
        async function inspSyncOffline(stil) {
            if (_inspSyncBezig || !navigator.onLine) return;
            const sb = getSupabase();
            if (!sb) return;
            let bundles;
            try { bundles = await inspIdbGetAll('inspecties'); } catch (e) { return; }
            const vuil = (bundles || []).filter(b => b.dirty);
            if (vuil.length === 0) return;
            _inspSyncBezig = true;
            let ok = 0;
            for (const b of vuil) {
                try {
                    const c = b.counts || inspCountAnswers(b.answers);
                    const { error } = await sb.from('inspections').update({
                        answers: b.answers,
                        answered_questions: c.answered_questions,
                        passed_questions: c.passed_questions,
                        failed_questions: c.failed_questions,
                    }).eq('id', b.id);
                    if (error) throw error;
                    b.dirty = false;
                    b.syncedAt = new Date().toISOString();
                    await inspIdbPut('inspecties', b);
                    ok++;
                } catch (e) { /* laat dirty staan · volgende keer opnieuw proberen */ }
            }
            _inspSyncBezig = false;
            if (ok > 0) {
                showToast('✓ ' + ok + ' inspectie' + (ok === 1 ? '' : 's') + ' gesynchroniseerd');
                if (typeof inspLoadUserInspections === 'function') inspLoadUserInspections();
            }
        }

        // Sync zodra we weer online komen, en eenmalig kort na het laden.
        window.addEventListener('online', () => { setTimeout(() => inspSyncOffline(), 1500); });
        window.addEventListener('load', () => { setTimeout(() => { if (navigator.onLine) inspSyncOffline(true); }, 4000); });
