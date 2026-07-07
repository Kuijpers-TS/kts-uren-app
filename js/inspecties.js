        // =========================================================
        // ===== INSPECTIE MODULE (apart blok, later te splitsen) =
        // =========================================================

        // ----- Inspectie Templates laden & tonen -----
        let _inspTemplates = [];

        async function inspLoadTemplates() {
            const sb = getSupabase();
            if (!sb) return;
            const container = document.getElementById('insp-template-list');
            if (!container) return;
            container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.85rem">Laden...</div>';

            try {
                let query = sb.from('inspection_templates').select('*').order('created_at', { ascending: false });
                // Vangnet tegen zwerf-testdata · test-modus zelf is uitgefaseerd
                query = query.or('is_test.eq.false,is_test.is.null');
                const { data, error } = await query;
                if (error) throw error;
                _inspTemplates = data || [];

                if (_inspTemplates.length === 0) {
                    if (!container.classList.contains('insp-module')) container.classList.add('insp-module');
                    container.innerHTML = `
                        <div class="insp-empty-state" style="padding:48px 20px">
                            <div class="icon" style="font-size:32px">○</div>
                            <div style="font-size:14px;color:var(--insp-ink-500);font-weight:500">Nog geen inspectie-formulieren</div>
                            <div style="font-size:12px;color:var(--insp-ink-400);margin-top:6px">Klik op '+ Nieuw formulier' om te beginnen, of importeer uit Excel</div>
                        </div>`;
                    return;
                }

                // Wikkel container met insp-module class voor design-systeem
                if (!container.classList.contains('insp-module')) container.classList.add('insp-module');
                container.innerHTML = '<div class="insp-entry-list">' + _inspTemplates.map(t => {
                    const sections = t.sections || [];
                    const totalQuestions = sections.reduce((sum, s) => sum + (s.questions || []).length, 0);
                    const statusLabel = t.is_active ? 'Actief' : 'Inactief';
                    const statusClass = t.is_active ? 'is-afgerond' : 'is-archief';
                    const entryClass = 'insp-entry insp-entry-clickable ' + (t.is_active ? 'is-afgerond' : 'is-archief');
                    return `
                        <div class="${entryClass}" onclick="inspOpenTemplateEditor('${t.id}')">
                            <div class="insp-entry-head">
                                <div style="flex:1;min-width:0">
                                    <div class="insp-entry-meta">${escapeHtml(t.category || 'algemeen').toUpperCase()}${t.frequency ? ' · ' + escapeHtml(t.frequency).toUpperCase() : ''}</div>
                                    <div class="insp-entry-title">${escapeHtml(t.name || 'Naamloos')}</div>
                                    ${t.location || t.installation ? `<div style="font-size:12px;color:var(--insp-ink-500);margin-top:4px">${t.location ? escapeHtml(t.location) : ''}${t.location && t.installation ? ' · ' : ''}${escapeHtml(t.installation || '')}</div>` : ''}
                                </div>
                                <span class="insp-status-pill ${statusClass}">${statusLabel}</span>
                            </div>
                            <div class="insp-entry-progress" style="margin-top:8px">
                                <span class="insp-tag">${sections.length} sectie${sections.length === 1 ? '' : 's'}</span>
                                <span class="insp-tag">${totalQuestions} vragen</span>
                            </div>
                        </div>`;
                }).join('') + '</div>';
            } catch (err) {
                container.innerHTML = `<div style="text-align:center;padding:20px;color:#ef4444;font-size:0.85rem">Fout: ${err.message}</div>`;
            }
        }

        // ----- Inspectie Template Editor -----
        // ===== EXCEL EXPORT VAN TEMPLATES =====
        async function inspExportTemplatesExcel() {
            if (!window.XLSX) { showToast('⚠️ Excel library nog niet geladen'); return; }
            const sb = getSupabase();
            if (!sb) return;
            const { data: tpls, error } = await sb.from('inspection_templates')
                .select('*').order('name');
            if (error || !tpls || tpls.length === 0) {
                showToast('⚠️ Geen templates gevonden');
                return;
            }

            // Sheet 1: Templates (metadata)
            const tplRows = tpls.map(t => ({
                'Template naam': t.name || '',
                'Asset code (default)': t.asset || '',
                'Categorie': t.category || '',
                'Frequentie': t.frequency || '',
                'Locatie': t.location || '',
                'Beschrijving': t.description || ''
            }));

            // Sheet 2: Vragen (plat per template)
            const qRows = [];
            tpls.forEach(t => {
                (t.sections || []).forEach((sec, si) => {
                    (sec.questions || []).forEach((q, qi) => {
                        qRows.push({
                            'Template naam': t.name || '',
                            'Sectie volgorde': (si + 1) * 10,
                            'Sectie titel': sec.title || '',
                            'Vraag volgorde': (qi + 1) * 10,
                            'Vraagtekst': q.text || '',
                            'Type': q.type || 'goed_fout',
                            'Component': q.component || '',
                            'Discipline': q.discipline || '',
                            'Eenheid': q.unit || '',
                            'Permit vereist': q.permit_required ? 'ja' : 'nee',
                            'Verplicht': q.required === false ? 'nee' : 'ja'
                        });
                    });
                });
            });

            // Sheet 3: Instructies
            const instRows = [
                { 'Instructies': 'KTS Inspectie Templates · Excel import/export' },
                { 'Instructies': '' },
                { 'Instructies': 'WERKWIJZE VRAGEN AANPASSEN:' },
                { 'Instructies': '1. Open sheet \'Vragen\'' },
                { 'Instructies': '2. Pas \'Vraagtekst\' aan, of voeg/verwijder rijen' },
                { 'Instructies': '3. Hou \'Template naam\' en \'Sectie titel\' consistent' },
                { 'Instructies': '4. Sectie volgorde 10/20/30 ipv 1/2/3 voor makkelijk tussenvoegen' },
                { 'Instructies': '' },
                { 'Instructies': 'VRAAGTYPES:' },
                { 'Instructies': 'goed_fout · Goed/Fout/Nvt knoppen' },
                { 'Instructies': 'conditiescore · NEN 2767 schaal 1 (uitstekend) t/m 6 (zeer slecht)' },
                { 'Instructies': 'meting · numeriek invoerveld met eenheid' },
                { 'Instructies': 'tekst · vrij tekstveld' },
                { 'Instructies': '' },
                { 'Instructies': 'IMPORT: Beheer → Formulieren → 📥 Importeren uit Excel' },
            ];

            const wb = XLSX.utils.book_new();
            const ws1 = XLSX.utils.json_to_sheet(instRows);
            ws1['!cols'] = [{ wch: 80 }];
            XLSX.utils.book_append_sheet(wb, ws1, 'Instructies');
            const ws2 = XLSX.utils.json_to_sheet(tplRows);
            ws2['!cols'] = [{ wch: 50 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 28 }, { wch: 40 }];
            XLSX.utils.book_append_sheet(wb, ws2, 'Templates');
            const ws3 = XLSX.utils.json_to_sheet(qRows);
            ws3['!cols'] = [{ wch: 40 }, { wch: 8 }, { wch: 28 }, { wch: 8 }, { wch: 60 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 9 }];
            XLSX.utils.book_append_sheet(wb, ws3, 'Vragen');

            const today = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(wb, `KTS_Inspectie_Templates_${today}.xlsx`);
            showToast('✓ Excel geexporteerd');
        }

        // ===== EXCEL IMPORT VAN TEMPLATES =====
        async function inspImportTemplatesExcel(input) {
            if (!window.XLSX) { showToast('⚠️ Excel library nog niet geladen'); return; }
            const file = input.files && input.files[0];
            if (!file) return;

            try {
                const buffer = await file.arrayBuffer();
                const wb = XLSX.read(buffer, { type: 'array' });

                // Verplichte sheets
                if (!wb.Sheets['Templates'] || !wb.Sheets['Vragen']) {
                    showToast('⚠️ Excel mist sheet "Templates" of "Vragen"');
                    input.value = '';
                    return;
                }

                const tplRows = XLSX.utils.sheet_to_json(wb.Sheets['Templates'], { defval: '' });
                const qRows = XLSX.utils.sheet_to_json(wb.Sheets['Vragen'], { defval: '' });

                if (tplRows.length === 0) {
                    showToast('⚠️ Geen templates in Excel gevonden');
                    input.value = '';
                    return;
                }

                // Bouw templates op
                const templatesByName = {};
                tplRows.forEach(r => {
                    const name = String(r['Template naam'] || '').trim();
                    if (!name) return;
                    templatesByName[name] = {
                        name: name,
                        asset: String(r['Asset code (default)'] || '').trim(),
                        category: String(r['Categorie'] || '').trim(),
                        frequency: String(r['Frequentie'] || '').trim(),
                        location: String(r['Locatie'] || '').trim(),
                        description: String(r['Beschrijving'] || '').trim(),
                        sections: []
                    };
                });

                // Voeg vragen toe, gegroepeerd per (template, sectie)
                const sectionsByKey = {}; // key: tplName::secOrder
                qRows.forEach(r => {
                    const tplName = String(r['Template naam'] || '').trim();
                    const secOrder = parseInt(r['Sectie volgorde']) || 0;
                    const secTitle = String(r['Sectie titel'] || '').trim();
                    const qOrder = parseInt(r['Vraag volgorde']) || 0;
                    const qText = String(r['Vraagtekst'] || '').trim();
                    const qType = String(r['Type'] || 'goed_fout').trim();
                    const component = String(r['Component'] || '').trim();
                    const discipline = String(r['Discipline'] || '').trim();
                    const unit = String(r['Eenheid'] || '').trim();
                    const permit = String(r['Permit vereist'] || 'nee').toLowerCase().trim();
                    const required = String(r['Verplicht'] || 'ja').toLowerCase().trim();

                    if (!tplName || !qText) return;
                    if (!templatesByName[tplName]) {
                        // Template ontbreekt in Templates-sheet · overslaan
                        return;
                    }

                    const secKey = `${tplName}::${secOrder}::${secTitle}`;
                    if (!sectionsByKey[secKey]) {
                        sectionsByKey[secKey] = {
                            tplName, secOrder, secTitle,
                            questions: []
                        };
                    }
                    const question = {
                        text: qText,
                        type: qType,
                        component: component || undefined,
                        discipline: discipline || undefined,
                        permit_required: permit === 'ja',
                        required: required !== 'nee'
                    };
                    if (unit) question.unit = unit;
                    sectionsByKey[secKey].questions.push({ qOrder, question });
                });

                // Sorteer secties per template + vragen per sectie
                const sectionsList = Object.values(sectionsByKey);
                sectionsList.forEach(s => {
                    s.questions.sort((a, b) => a.qOrder - b.qOrder);
                });
                sectionsList.sort((a, b) => a.secOrder - b.secOrder);

                sectionsList.forEach(s => {
                    if (templatesByName[s.tplName]) {
                        templatesByName[s.tplName].sections.push({
                            id: 's' + s.secOrder,
                            title: s.secTitle,
                            questions: s.questions.map(q => q.question)
                        });
                    }
                });

                // Check tegen bestaande templates
                const sb = getSupabase();
                const { data: existing } = await sb.from('inspection_templates').select('id, name');
                const existingByName = {};
                (existing || []).forEach(t => { existingByName[t.name] = t.id; });

                const tplsArray = Object.values(templatesByName).filter(t => t.sections.length > 0);
                if (tplsArray.length === 0) {
                    showToast('⚠️ Geen geldige templates met vragen gevonden in Excel');
                    input.value = '';
                    return;
                }

                // Preview-bevestiging
                const confirmText =
                    `${tplsArray.length} template${tplsArray.length === 1 ? '' : 's'} importeren?\n\n` +
                    tplsArray.map(t => {
                        const isExisting = existingByName[t.name];
                        const totalQ = t.sections.reduce((s, sec) => s + sec.questions.length, 0);
                        return `${isExisting ? '↻' : '+'} ${t.name}\n   ${t.sections.length} secties, ${totalQ} vragen ${isExisting ? '[bijwerken]' : '[nieuw]'}`;
                    }).join('\n\n') +
                    '\n\n⚠️ Bijwerken vervangt de hele template (alle secties + vragen).';
                const simpleConfirm = await confirmAsync(confirmText);
                if (!simpleConfirm) {
                    input.value = '';
                    return;
                }

                // Upsert per template · is_test + created_by meesturen zoals de
                // editor-flow dat ook doet, anders verdwijnen geimporteerde
                // templates in test-modus (is_test default false) en ontbreekt
                // de audit-trail.
                let successCount = 0, errCount = 0;
                let importAuthUid = null;
                try {
                    importAuthUid = (await sb.auth.getUser()).data.user?.id || null;
                } catch (e) { /* anonieme client · created_by blijft leeg */ }
                for (const t of tplsArray) {
                    const payload = {
                        name: t.name,
                        asset: t.asset || null,
                        category: t.category || null,
                        frequency: t.frequency || null,
                        location: t.location || null,
                        description: t.description || null,
                        sections: t.sections,
                        is_active: true
                    };
                    let result;
                    if (existingByName[t.name]) {
                        // UPDATE: is_test/created_by NIET aanraken · anders flipt een
                        // re-import in test-modus een productie-template naar test
                        result = await sb.from('inspection_templates').update(payload).eq('id', existingByName[t.name]);
                    } else {
                        const insertPayload = { ...payload };
                        if (importAuthUid) insertPayload.created_by = importAuthUid;
                        result = await sb.from('inspection_templates').insert(insertPayload);
                    }
                    if (result.error) {
                        console.error('Import error voor', t.name, result.error);
                        errCount++;
                    } else {
                        successCount++;
                    }
                }

                input.value = '';
                if (errCount === 0) {
                    showToast(`✓ ${successCount} template${successCount === 1 ? '' : 's'} geïmporteerd`);
                } else {
                    showToast(`⚠️ ${successCount} OK, ${errCount} fout · check console`);
                }
                // Lijst herladen
                if (typeof inspLoadTemplates === 'function') inspLoadTemplates();
            } catch (err) {
                console.error('Import fout:', err);
                showToast('❌ Import mislukt: ' + friendlyError(err));
                input.value = '';
            }
        }

        function inspOpenTemplateEditor(templateId) {
            const existing = templateId ? _inspTemplates.find(t => t.id === templateId) : null;
            const sections = existing ? (existing.sections || []) : [];

            const categorieOptions = ['algemeen','commissioning','onderhoud','keuring','veiligheid']
                .map(c => `<option value="${c}" ${existing && existing.category === c ? 'selected' : ''}>${c.charAt(0).toUpperCase() + c.slice(1)}</option>`).join('');

            const frequencyOptions = ['','6 maandelijks','1 jaarlijks','2 jaarlijks','4 jaarlijks','5 jaarlijks','10 jaarlijks','25 jaarlijks']
                .map(f => `<option value="${f}" ${existing && existing.frequency === f ? 'selected' : ''}>${f || '-- Geen --'}</option>`).join('');

            // Toewijzing: welke engineers zien dit formulier. Leeg = iedereen.
            const _assignUsers = (typeof getFilteredUsers === 'function' ? getFilteredUsers() : (window._adminUsers || []))
                .slice().sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || ''));
            const _assigned = (existing && Array.isArray(existing.assigned_user_ids)) ? existing.assigned_user_ids : [];
            const assignHtml = _assignUsers.length === 0
                ? '<div style="font-size:0.78rem;color:var(--muted)">Geen medewerkers gevonden</div>'
                : _assignUsers.map(u => `<label style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border:1px solid var(--app-line);border-radius:20px;font-size:0.8rem;cursor:pointer;background:var(--app-surface)"><input type="checkbox" value="${u.id}" ${_assigned.includes(u.id) ? 'checked' : ''} onchange="inspToggleAssigned('${u.id}', this.checked)">${escapeHtml(u.name || u.email || 'Onbekend')}</label>`).join('');

            const content = `
                <div class="form-group" style="margin-bottom:10px">
                    <label>Naam formulier *</label>
                    <input type="text" id="insp-tpl-name" value="${existing ? escapeHtml(existing.name || '') : ''}" placeholder="Bijv. Specialistisch onderhoud motor L1" style="width:100%;padding:8px;border:2px solid var(--app-line);border-radius:8px;font-size:0.85rem">
                </div>
                <div class="form-group" style="margin-bottom:10px">
                    <label>Beschrijving</label>
                    <textarea id="insp-tpl-desc" placeholder="Uitgebreide beschrijving van het taakplan..." style="width:100%;padding:8px;border:2px solid var(--app-line);border-radius:8px;font-size:0.85rem;min-height:60px">${existing ? existing.description || '' : ''}</textarea>
                </div>
                <div style="display:flex;gap:8px;margin-bottom:10px">
                    <div class="form-group" style="flex:1">
                        <label>Categorie</label>
                        <select id="insp-tpl-cat" style="width:100%;padding:8px;border:2px solid var(--app-line);border-radius:8px;font-size:0.85rem">${categorieOptions}</select>
                    </div>
                    <div class="form-group" style="flex:1">
                        <label>Frequentie</label>
                        <select id="insp-tpl-freq" style="width:100%;padding:8px;border:2px solid var(--app-line);border-radius:8px;font-size:0.85rem">${frequencyOptions}</select>
                    </div>
                </div>
                <div style="display:flex;gap:8px;margin-bottom:10px">
                    <div class="form-group" style="flex:1">
                        <label>Locatie</label>
                        <input type="text" id="insp-tpl-location" value="${existing ? escapeHtml(existing.location || '') : ''}" placeholder="Bijv. Pompgroepen Den Oever" style="width:100%;padding:8px;border:2px solid var(--app-line);border-radius:8px;font-size:0.85rem">
                    </div>
                    <div class="form-group" style="flex:1">
                        <label>Installatie</label>
                        <input type="text" id="insp-tpl-install" value="${existing ? escapeHtml(existing.installation || '') : ''}" placeholder="Bijv. Pompinstallatie (gemaalpomp)" style="width:100%;padding:8px;border:2px solid var(--app-line);border-radius:8px;font-size:0.85rem">
                    </div>
                </div>
                <div class="form-group" style="margin-bottom:14px">
                    <label>Asset</label>
                    <input type="text" id="insp-tpl-asset" value="${existing ? escapeHtml(existing.asset || '') : ''}" placeholder="Bijv. Gemaalpomp" style="width:100%;padding:8px;border:2px solid var(--app-line);border-radius:8px;font-size:0.85rem">
                </div>

                <div class="form-group" style="margin-bottom:14px">
                    <label>👤 Zichtbaar voor <span style="font-weight:400;color:var(--muted);font-size:0.75rem">(niemand aangevinkt = iedereen ziet het)</span></label>
                    <div id="insp-tpl-assigned" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">${assignHtml}</div>
                </div>

                <div class="form-group" style="margin-bottom:14px">
                    <label>🗺️ Plattegronden &amp; tekeningen <span style="font-weight:400;color:var(--muted);font-size:0.75rem">(optioneel · te openen tijdens het invullen)</span></label>
                    <div id="insp-tpl-docs-list" style="display:flex;flex-direction:column;gap:6px;margin:6px 0"></div>
                    <label for="insp-tpl-doc-file" class="btn btn-sm" style="cursor:pointer;background:var(--app-info-soft);color:var(--app-info);border:1px solid var(--app-info-line)">📁 Document toevoegen</label>
                    <input type="file" id="insp-tpl-doc-file" accept="image/*,application/pdf" onchange="inspUploadDocument(this)" style="display:none">
                </div>

                <div style="border-top:2px solid var(--border);padding-top:12px;margin-top:4px">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                        <div style="font-weight:700;font-size:0.85rem">Secties & Vragen</div>
                        <button class="btn btn-sm" onclick="inspAddSection()" style="font-size:0.75rem">+ Sectie</button>
                    </div>
                    <div id="insp-tpl-sections" style="display:flex;flex-direction:column;gap:12px">
                        ${sections.length === 0 ? '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.8rem">Voeg een sectie toe om te beginnen</div>' : ''}
                    </div>
                </div>
            `;

            const modal = document.getElementById('admin-modal');
            const titleEl = document.getElementById('admin-modal-title');
            const fieldsEl = document.getElementById('admin-modal-fields');
            const saveBtn = document.getElementById('admin-modal-save');
            const delBtn = document.getElementById('admin-modal-delete');

            if (modal && titleEl && fieldsEl) {
                titleEl.textContent = existing ? 'Formulier bewerken' : 'Nieuw inspectie-formulier';
                fieldsEl.innerHTML = content;
                if (saveBtn) {
                    saveBtn.style.display = 'inline-flex';
                    saveBtn.textContent = 'Opslaan';
                    saveBtn.onclick = () => inspSaveTemplate(templateId);
                }
                if (delBtn) {
                    delBtn.style.display = existing ? 'inline-flex' : 'none';
                    delBtn.onclick = () => inspDeleteTemplate(templateId);
                }
                modal.classList.add('active');

                // Render bestaande secties
                if (sections.length > 0) {
                    window._inspTplSections = JSON.parse(JSON.stringify(sections));
                    inspRenderSections();
                } else {
                    window._inspTplSections = [];
                }

                // Documenten-state initialiseren. Nieuwe lijst 'documents', met
                // fallback op de oude enkele plattegrond_path (voor formulieren
                // die nog niet via de nieuwe migratie zijn opgeslagen).
                let _docs = (existing && Array.isArray(existing.documents)) ? JSON.parse(JSON.stringify(existing.documents)) : [];
                if (_docs.length === 0 && existing && existing.plattegrond_path) {
                    _docs = [{ path: existing.plattegrond_path, type: 'plattegrond', name: (existing.plattegrond_path || '').split('/').pop() }];
                }
                window._inspTplDocuments = _docs;
                inspRenderDocsList();

                // Toewijzing-state (welke engineers zien dit formulier)
                window._inspTplAssigned = _assigned.slice();
            }
        }

        // Vink een engineer aan/uit bij de zichtbaarheid van het formulier.
        function inspToggleAssigned(userId, checked) {
            const set = new Set(window._inspTplAssigned || []);
            if (checked) set.add(userId); else set.delete(userId);
            window._inspTplAssigned = [...set];
        }

        // ===== DOCUMENTEN (plattegronden & tekeningen) BIJ FORMULIER =====
        // Elk document: { path, type: 'plattegrond'|'tekening', name }. Upload gaat
        // direct naar de inspections-bucket (map plattegronden/); de lijst komt pas
        // op het template te staan bij Opslaan. Vereist migratie-plattegrond.sql
        // (bucket + policies) en migratie-inspectie-documenten.sql (kolom documents).
        function _inspDocIcon(type) { return type === 'tekening' ? '📐' : '🗺️'; }
        function _inspDocWoord(type) { return type === 'tekening' ? 'Tekening' : 'Plattegrond'; }

        function inspRenderDocsList() {
            const list = document.getElementById('insp-tpl-docs-list');
            if (!list) return;
            const docs = window._inspTplDocuments || [];
            if (docs.length === 0) {
                list.innerHTML = '<div style="font-size:0.8rem;color:var(--muted)">Nog geen documenten gekoppeld</div>';
                return;
            }
            list.innerHTML = docs.map((d, i) => {
                const isPdf = /\.pdf$/i.test(d.path || '');
                const naam = escapeHtml(d.name || (d.path || '').split('/').pop());
                return `
                <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--app-line);border-radius:8px;background:var(--app-surface)">
                    <select onchange="inspSetDocType(${i}, this.value)" style="padding:5px 6px;border:1px solid var(--app-line);border-radius:6px;font-size:0.78rem;background:var(--app-surface);color:var(--text)">
                        <option value="plattegrond" ${d.type !== 'tekening' ? 'selected' : ''}>Plattegrond</option>
                        <option value="tekening" ${d.type === 'tekening' ? 'selected' : ''}>Tekening</option>
                    </select>
                    <span style="flex:1;min-width:0;font-size:0.78rem;color:var(--app-ink-700);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${naam}">${naam}${isPdf ? ' (PDF)' : ''}</span>
                    <button type="button" class="btn btn-sm btn-secondary app-btn app-btn-secondary" onclick="inspShowDocument('${d.path}','${d.type || 'plattegrond'}')" title="Bekijken" style="padding:4px 8px">👁️</button>
                    <button type="button" class="btn btn-sm" onclick="inspRemoveDocument(${i})" title="Verwijderen" style="padding:4px 8px;background:var(--app-alert-soft);color:var(--app-alert);border:1px solid var(--app-alert-line)">✕</button>
                </div>`;
            }).join('');
        }

        function inspSetDocType(i, type) {
            const docs = window._inspTplDocuments || [];
            if (docs[i]) docs[i].type = (type === 'tekening' ? 'tekening' : 'plattegrond');
        }

        async function inspUploadDocument(input) {
            const file = input.files && input.files[0];
            if (!file) return;
            const sb = getSupabase();
            if (!sb) { showToast('⚠️ Niet verbonden'); return; }
            if (file.size > 15 * 1024 * 1024) { showToast('⚠️ Bestand te groot (max 15 MB)'); input.value = ''; return; }

            const ext = ((file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '')) || 'png';
            const path = `plattegronden/${crypto.randomUUID()}.${ext}`;
            showToast('⏳ Document uploaden...');
            const { error } = await sb.storage.from('inspections')
                .upload(path, file, { contentType: file.type || 'application/octet-stream' });
            input.value = '';
            if (error) {
                if (/row-level security|policy|bucket/i.test(error.message || '')) {
                    showToast('⚠️ Upload geblokkeerd · draai eerst migratie-plattegrond.sql');
                } else {
                    showToast('⚠️ Upload mislukt: ' + friendlyError(error));
                }
                return;
            }
            const docs = window._inspTplDocuments || (window._inspTplDocuments = []);
            // Het eerste document is standaard de plattegrond, daarna tekeningen.
            const heeftPlattegrond = docs.some(d => d.type === 'plattegrond');
            docs.push({ path, type: heeftPlattegrond ? 'tekening' : 'plattegrond', name: file.name });
            inspRenderDocsList();
            showToast('✓ Document geüpload · klik op Opslaan om te bevestigen');
        }

        function inspRemoveDocument(i) {
            const docs = window._inspTplDocuments || [];
            docs.splice(i, 1);
            inspRenderDocsList();
            showToast('Document losgekoppeld · klik op Opslaan om te bevestigen');
        }

        // Helper: geeft de documenten-lijst van een template (nieuwe 'documents'
        // kolom, met fallback op de oude enkele plattegrond_path).
        function inspTemplateDocs(tpl) {
            if (tpl && Array.isArray(tpl.documents) && tpl.documents.length) return tpl.documents;
            if (tpl && tpl.plattegrond_path) return [{ path: tpl.plattegrond_path, type: 'plattegrond', name: (tpl.plattegrond_path || '').split('/').pop() }];
            return [];
        }

        // Bouwt de knoppen om documenten te openen tijdens het invullen.
        // variant 'overview' = brede ghost-knoppen, 'compact' = kleine icoon-knoppen.
        function inspDocButtonsHtml(tpl, variant) {
            const docs = inspTemplateDocs(tpl);
            if (!docs.length) return '';
            const tekTotal = docs.filter(d => d.type === 'tekening').length;
            let tekN = 0;
            const knoppen = docs.map(d => {
                const isTek = d.type === 'tekening';
                if (isTek) tekN++;
                const woord = isTek ? ('Tekening' + (tekTotal > 1 ? ' ' + tekN : '')) : 'Plattegrond';
                const icoon = _inspDocIcon(d.type);
                if (variant === 'compact') {
                    return `<button type="button" onclick="inspShowDocument('${d.path}','${d.type || 'plattegrond'}')" title="${woord} bekijken" style="width:32px;height:32px;border-radius:8px;border:1px solid var(--insp-line);background:var(--insp-surface);cursor:pointer;font-size:0.95rem;display:grid;place-items:center">${icoon}</button>`;
                }
                return `<button type="button" class="insp-btn-ghost" style="flex:1;min-width:130px" onclick="inspShowDocument('${d.path}','${d.type || 'plattegrond'}')">${icoon} ${woord}</button>`;
            }).join('');
            if (variant === 'compact') return `<div style="display:flex;gap:6px;flex-wrap:wrap">${knoppen}</div>`;
            return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">${knoppen}</div>`;
        }

        // Viewer: afbeeldingen fullscreen met zoom-knoppen (pagina-zoom staat
        // uit via de viewport-meta, dus +/− knoppen en scrollen om te pannen).
        // PDF's openen in een nieuw tabblad via een blob-URL.
        async function inspShowDocument(path, type) {
            if (!path) { showToast('⚠️ Geen document gekoppeld'); return; }
            const woord = _inspDocWoord(type);
            const icoon = _inspDocIcon(type);

            // 1. Eerst het lokaal opgeslagen bestand proberen (werkt offline).
            let url = null;
            if (typeof inspGetLocalDocUrl === 'function') {
                url = await inspGetLocalDocUrl(path);
            }
            // 2. Niet lokaal? Downloaden uit storage (vereist internet).
            if (!url) {
                const sb = getSupabase();
                if (!sb) { showToast('⚠️ Niet verbonden'); return; }
                if (!navigator.onLine) { showToast('⚠️ Document niet offline beschikbaar · bereid de inspectie voor met internet'); return; }
                showToast('⏳ ' + woord + ' laden...', 1500);
                const { data: blob, error } = await sb.storage.from('inspections').download(path);
                if (error || !blob) { showToast('⚠️ Laden mislukt: ' + (error && friendlyError(error) || 'onbekend')); return; }
                url = URL.createObjectURL(blob);
            }

            if (/\.pdf$/i.test(path)) {
                window.open(url, '_blank');
                return;
            }

            document.getElementById('plattegrond-overlay')?.remove();
            let zoom = 1;
            const overlay = document.createElement('div');
            overlay.id = 'plattegrond-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;z-index:10005;background:rgba(10,22,40,0.97);display:flex;flex-direction:column';
            const knop = 'width:42px;height:42px;border-radius:10px;border:1px solid rgba(255,255,255,0.35);background:rgba(255,255,255,0.12);color:white;font-size:1.2rem;font-weight:700;cursor:pointer;display:grid;place-items:center';
            overlay.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;flex-shrink:0">
                    <div style="color:white;font-weight:700;font-size:0.9rem">${icoon} ${woord}</div>
                    <div style="display:flex;gap:8px">
                        <button type="button" id="pg-zoom-out" style="${knop}" aria-label="Uitzoomen">−</button>
                        <button type="button" id="pg-zoom-in" style="${knop}" aria-label="Inzoomen">+</button>
                        <button type="button" id="pg-close" style="${knop}" aria-label="Sluiten">✕</button>
                    </div>
                </div>
                <div id="pg-scroll" style="flex:1;overflow:auto;-webkit-overflow-scrolling:touch">
                    <img id="pg-img" src="${url}" alt="${woord}" style="width:100%;max-width:none;display:block">
                </div>`;
            document.body.appendChild(overlay);
            const img = overlay.querySelector('#pg-img');
            const applyZoom = () => { img.style.width = (zoom * 100) + '%'; };
            overlay.querySelector('#pg-zoom-in').onclick = () => { zoom = Math.min(zoom * 1.4, 8); applyZoom(); };
            overlay.querySelector('#pg-zoom-out').onclick = () => { zoom = Math.max(zoom / 1.4, 1); applyZoom(); };
            overlay.querySelector('#pg-close').onclick = () => { overlay.remove(); URL.revokeObjectURL(url); };
        }

        // Secties renderen in de editor
        function inspRenderSections() {
            const container = document.getElementById('insp-tpl-sections');
            if (!container) return;
            const sections = window._inspTplSections || [];

            if (sections.length === 0) {
                container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.8rem">Voeg een sectie toe om te beginnen</div>';
                return;
            }

            container.innerHTML = sections.map((sec, si) => {
                const questions = (sec.questions || []).map((q, qi) => {
                    const typeLabel = { 'ja_nee': 'Ja/Nee', 'goed_fout': 'Goed/Fout/Nvt', 'goed_matig_slecht': 'Goed/Matig/Slecht', 'conditiescore': 'Conditiescore (1-6)', 'numeriek': 'Numeriek', 'meting': 'Meting', 'tekst': 'Tekst', 'foto': 'Foto', 'handtekening': 'Handtekening', 'selectie': 'Selectie', 'datum': 'Datum' };
                    return `
                        <div style="display:flex;align-items:start;gap:6px;padding:8px;background:var(--app-surface);border-radius:6px;margin-bottom:4px">
                            <div style="flex:1;min-width:0">
                                <div style="font-size:0.8rem;font-weight:500">${q.text || 'Nieuwe vraag'}</div>
                                <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">
                                    <span style="font-size:0.6rem;background:var(--app-info-soft);padding:1px 6px;border-radius:3px">${typeLabel[q.type] || q.type}</span>
                                    ${q.required ? '<span style="font-size:0.6rem;background:var(--app-alert-soft);padding:1px 6px;border-radius:3px">Verplicht</span>' : ''}
                                    ${q.unit ? `<span style="font-size:0.6rem;background:var(--app-bg-deep);padding:1px 6px;border-radius:3px">${q.unit}</span>` : ''}
                                    ${q.component ? `<span style="font-size:0.6rem;background:var(--app-info-soft);padding:1px 6px;border-radius:3px">${q.component}</span>` : ''}
                                    ${q.manufacturer ? `<span style="font-size:0.6rem;background:var(--app-warn-soft);padding:1px 6px;border-radius:3px">${q.manufacturer}</span>` : ''}
                                    ${q.tools ? `<span style="font-size:0.6rem;background:var(--app-ok-soft);padding:1px 6px;border-radius:3px">🔧 ${q.tools}</span>` : ''}
                                </div>
                            </div>
                            <button onclick="inspEditQuestion(${si},${qi})" style="background:none;border:none;cursor:pointer;font-size:0.8rem;padding:4px" title="Bewerken">✏️</button>
                            <button onclick="inspRemoveQuestion(${si},${qi})" style="background:none;border:none;cursor:pointer;font-size:0.8rem;padding:4px" title="Verwijderen">🗑️</button>
                        </div>`;
                }).join('');

                return `
                    <div style="border:2px solid var(--app-line);border-radius:10px;padding:12px">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                            <input type="text" value="${sec.title || ''}" onchange="window._inspTplSections[${si}].title=this.value" placeholder="Sectienaam (bijv. Bekabeling)" style="flex:1;padding:6px 8px;border:2px solid var(--app-line);border-radius:8px;font-size:0.85rem;font-weight:600">
                            <button onclick="inspRemoveSection(${si})" style="background:none;border:none;cursor:pointer;font-size:0.85rem;padding:4px;margin-left:8px" title="Sectie verwijderen">🗑️</button>
                        </div>
                        <div>${questions}</div>
                        <button onclick="inspAddQuestion(${si})" class="btn btn-sm" style="width:100%;margin-top:6px;font-size:0.75rem;background:var(--app-info-soft);color:var(--kts-blue);border:1px dashed var(--kts-blue)">+ Vraag toevoegen</button>
                    </div>`;
            }).join('');
        }

        function inspAddSection() {
            if (!window._inspTplSections) window._inspTplSections = [];
            window._inspTplSections.push({ id: 's' + Date.now(), title: '', questions: [] });
            inspRenderSections();
        }

        function inspRemoveSection(si) {
            window._inspTplSections.splice(si, 1);
            inspRenderSections();
        }

        function inspAddQuestion(si) {
            const q = {
                id: 'q' + Date.now(),
                text: '',
                type: 'ja_nee',
                required: true,
                unit: null,
                component: '',
                asset_tag: '',
                manufacturer: '',
                discipline: '',
                permit_required: false,
                norm_reference: '',
                materials: '',
                tools: '',
                remarks_template: ''
            };
            window._inspTplSections[si].questions.push(q);
            inspEditQuestion(si, window._inspTplSections[si].questions.length - 1);
        }

        function inspRemoveQuestion(si, qi) {
            window._inspTplSections[si].questions.splice(qi, 1);
            inspRenderSections();
        }

        function inspEditQuestion(si, qi) {
            const q = window._inspTplSections[si].questions[qi];
            const typeOptions = [
                ['goed_fout', 'Goed / Fout / Nvt'],
                ['conditiescore', 'Conditiescore 1-6 (NEN 2767)'],
                ['ja_nee', 'Ja / Nee / NVT'],
                ['goed_matig_slecht', 'Goed / Matig / Slecht'],
                ['meting', 'Meting (numeriek)'],
                ['numeriek', 'Numeriek (meetwaarde)'],
                ['tekst', 'Tekst (vrij veld)'],
                ['foto', 'Foto'],
                ['selectie', 'Selectie (dropdown)'],
                ['datum', 'Datum']
            ].map(([v, l]) => `<option value="${v}" ${q.type === v ? 'selected' : ''}>${l}</option>`).join('');

            const html = `
                <div style="padding:12px;background:var(--app-info-soft);border-radius:8px;margin-bottom:10px">
                    <div style="font-weight:600;font-size:0.8rem;color:var(--kts-blue);margin-bottom:8px">Vraag bewerken</div>
                    <div class="form-group" style="margin-bottom:8px">
                        <label style="font-size:0.75rem">Vraagtekst *</label>
                        <textarea id="insp-q-text" style="width:100%;padding:8px;border:2px solid var(--app-line);border-radius:8px;font-size:0.8rem;min-height:50px">${q.text || ''}</textarea>
                    </div>
                    <div style="display:flex;gap:6px;margin-bottom:8px">
                        <div class="form-group" style="flex:1">
                            <label style="font-size:0.75rem">Type</label>
                            <select id="insp-q-type" style="width:100%;padding:6px;border:2px solid var(--app-line);border-radius:8px;font-size:0.8rem">${typeOptions}</select>
                        </div>
                        <div class="form-group" style="flex:1">
                            <label style="font-size:0.75rem">Eenheid (numeriek)</label>
                            <input type="text" id="insp-q-unit" value="${q.unit || ''}" placeholder="°C, bar, mm/s, MΩ" style="width:100%;padding:6px;border:2px solid var(--app-line);border-radius:8px;font-size:0.8rem">
                        </div>
                    </div>
                    <div style="display:flex;gap:6px;margin-bottom:8px">
                        <div class="form-group" style="flex:1">
                            <label style="font-size:0.75rem">Component</label>
                            <input type="text" id="insp-q-component" value="${q.component || ''}" placeholder="Bijv. Aandrijving: Bekabeling" style="width:100%;padding:6px;border:2px solid var(--app-line);border-radius:8px;font-size:0.8rem">
                        </div>
                        <div class="form-group" style="flex:1">
                            <label style="font-size:0.75rem">Asset tag / FMECA</label>
                            <input type="text" id="insp-q-asset-tag" value="${q.asset_tag || ''}" placeholder="1.05.1.1.AR-01.186-.1062-" style="width:100%;padding:6px;border:2px solid var(--app-line);border-radius:8px;font-size:0.8rem">
                        </div>
                    </div>
                    <div style="display:flex;gap:6px;margin-bottom:8px">
                        <div class="form-group" style="flex:1">
                            <label style="font-size:0.75rem">Fabrikant</label>
                            <input type="text" id="insp-q-manufacturer" value="${q.manufacturer || ''}" placeholder="Bijv. ABB, Flowserve" style="width:100%;padding:6px;border:2px solid var(--app-line);border-radius:8px;font-size:0.8rem">
                        </div>
                        <div class="form-group" style="flex:1">
                            <label style="font-size:0.75rem">Discipline</label>
                            <select id="insp-q-discipline" style="width:100%;padding:6px;border:2px solid var(--app-line);border-radius:8px;font-size:0.8rem">
                                <option value="" ${!q.discipline ? 'selected' : ''}>--</option>
                                <option value="WTB" ${q.discipline === 'WTB' ? 'selected' : ''}>WTB</option>
                                <option value="IA&E" ${q.discipline === 'IA&E' ? 'selected' : ''}>IA&E</option>
                            </select>
                        </div>
                    </div>
                    <div style="display:flex;gap:6px;margin-bottom:8px">
                        <div class="form-group" style="flex:1">
                            <label style="font-size:0.75rem">Norm / referentie</label>
                            <input type="text" id="insp-q-norm" value="${q.norm_reference || ''}" placeholder="ISO 2954, MTR-4227" style="width:100%;padding:6px;border:2px solid var(--app-line);border-radius:8px;font-size:0.8rem">
                        </div>
                        <div class="form-group" style="flex:1">
                            <label style="font-size:0.75rem">Gereedschap</label>
                            <input type="text" id="insp-q-tools" value="${q.tools || ''}" placeholder="Momentsleutel, Multimeter" style="width:100%;padding:6px;border:2px solid var(--app-line);border-radius:8px;font-size:0.8rem">
                        </div>
                    </div>
                    <div style="display:flex;gap:6px;margin-bottom:8px">
                        <div class="form-group" style="flex:1">
                            <label style="font-size:0.75rem">Materialen</label>
                            <input type="text" id="insp-q-materials" value="${q.materials || ''}" placeholder="Vet, Filter, Olie" style="width:100%;padding:6px;border:2px solid var(--app-line);border-radius:8px;font-size:0.8rem">
                        </div>
                        <label style="display:flex;align-items:center;gap:6px;padding-top:18px;font-size:0.8rem;cursor:pointer">
                            <input type="checkbox" id="insp-q-required" ${q.required ? 'checked' : ''} style="width:16px;height:16px">
                            Verplicht
                        </label>
                        <label style="display:flex;align-items:center;gap:6px;padding-top:18px;font-size:0.8rem;cursor:pointer">
                            <input type="checkbox" id="insp-q-permit" ${q.permit_required ? 'checked' : ''} style="width:16px;height:16px">
                            Vergunning
                        </label>
                    </div>
                    <div class="form-group" style="margin-bottom:10px">
                        <label style="font-size:0.75rem">Standaard opmerking / instructie</label>
                        <textarea id="insp-q-remarks" style="width:100%;padding:6px;border:2px solid var(--app-line);border-radius:8px;font-size:0.8rem;min-height:40px">${q.remarks_template || ''}</textarea>
                    </div>
                    <div style="display:flex;gap:8px;justify-content:flex-end">
                        <button class="btn btn-sm" onclick="inspRenderSections()" style="font-size:0.75rem">Annuleren</button>
                        <button class="btn btn-primary btn-sm" onclick="inspSaveQuestion(${si},${qi})" style="font-size:0.75rem">✓ Opslaan</button>
                    </div>
                </div>`;

            // Vervang de vraag-weergave door het bewerkformulier
            const container = document.getElementById('insp-tpl-sections');
            const sectionDivs = container.children;
            if (sectionDivs[si]) {
                const questionContainer = sectionDivs[si].querySelector('div:nth-child(2)');
                if (questionContainer && questionContainer.children[qi]) {
                    questionContainer.children[qi].outerHTML = html;
                }
            }
        }

        function inspSaveQuestion(si, qi) {
            const q = window._inspTplSections[si].questions[qi];
            q.text = document.getElementById('insp-q-text')?.value?.trim() || '';
            q.type = document.getElementById('insp-q-type')?.value || 'ja_nee';
            q.unit = document.getElementById('insp-q-unit')?.value?.trim() || null;
            q.component = document.getElementById('insp-q-component')?.value?.trim() || '';
            q.asset_tag = document.getElementById('insp-q-asset-tag')?.value?.trim() || '';
            q.manufacturer = document.getElementById('insp-q-manufacturer')?.value?.trim() || '';
            q.discipline = document.getElementById('insp-q-discipline')?.value || '';
            q.norm_reference = document.getElementById('insp-q-norm')?.value?.trim() || '';
            q.tools = document.getElementById('insp-q-tools')?.value?.trim() || '';
            q.materials = document.getElementById('insp-q-materials')?.value?.trim() || '';
            q.required = document.getElementById('insp-q-required')?.checked || false;
            q.permit_required = document.getElementById('insp-q-permit')?.checked || false;
            q.remarks_template = document.getElementById('insp-q-remarks')?.value?.trim() || '';
            inspRenderSections();
        }

        // ----- Template opslaan -----
        async function inspSaveTemplate(templateId) {
            const name = document.getElementById('insp-tpl-name')?.value?.trim();
            if (!name) { showToast('⚠️ Vul een naam in'); return; }

            const sb = getSupabase();
            if (!sb) return;

            const payload = {
                name,
                description: document.getElementById('insp-tpl-desc')?.value?.trim() || null,
                category: document.getElementById('insp-tpl-cat')?.value || 'algemeen',
                frequency: document.getElementById('insp-tpl-freq')?.value || null,
                location: document.getElementById('insp-tpl-location')?.value?.trim() || null,
                installation: document.getElementById('insp-tpl-install')?.value?.trim() || null,
                asset: document.getElementById('insp-tpl-asset')?.value?.trim() || null,
                sections: window._inspTplSections || [],
                documents: window._inspTplDocuments || [],
                assigned_user_ids: window._inspTplAssigned || [],
                // plattegrond_path blijft gevuld voor achterwaartse compatibiliteit
                // (readers die de oude kolom gebruiken): het eerste plattegrond-
                // document, anders het eerste document, anders null.
                plattegrond_path: (window._inspTplDocuments || []).find(d => d.type === 'plattegrond')?.path
                    || (window._inspTplDocuments || [])[0]?.path || null,
                updated_at: new Date().toISOString()
            };

            try {
                const opslaan = async (data) => templateId
                    ? await sb.from('inspection_templates').update(data).eq('id', templateId)
                    : await sb.from('inspection_templates').insert(data);

                if (!templateId) {
                    payload.created_by = (await sb.auth.getUser()).data.user?.id;
                }
                let { error } = await opslaan(payload);
                // Nieuwe optionele kolommen komen per migratie beschikbaar. Ontbreekt
                // er een (migratie nog niet gedraaid), strip die kolom en probeer
                // opnieuw. Meerdere kunnen ontbreken, vandaar de lus.
                const optioneleKolommen = [
                    { kol: 'assigned_user_ids', sql: 'migratie-formulier-toewijzing.sql', waarschuw: (window._inspTplAssigned || []).length > 0 },
                    { kol: 'documents', sql: 'migratie-inspectie-documenten.sql', waarschuw: (window._inspTplDocuments || []).length > 1 },
                    { kol: 'plattegrond_path', sql: 'migratie-plattegrond.sql', waarschuw: (window._inspTplDocuments || []).length > 0 },
                ];
                const poging = { ...payload };
                for (let r = 0; r < optioneleKolommen.length && error; r++) {
                    const mis = optioneleKolommen.find(o => (o.kol in poging) && new RegExp(o.kol).test(error.message || ''));
                    if (!mis) break;
                    console.warn(mis.kol + '-kolom ontbreekt · draai ' + mis.sql);
                    if (mis.waarschuw) showToast('⚠️ Niet alles opgeslagen · draai ' + mis.sql);
                    delete poging[mis.kol];
                    ({ error } = await opslaan(poging));
                }
                if (error) throw error;
                showToast(templateId ? '✓ Formulier bijgewerkt' : '✓ Formulier aangemaakt');
                document.getElementById('admin-modal').classList.remove('active');
                inspLoadTemplates();
            } catch (err) {
                showToast('❌ Fout: ' + friendlyError(err));
            }
        }

        // ----- Template verwijderen -----
        async function inspDeleteTemplate(templateId) {
            if (!templateId) return;
            if (!await confirmAsync('Weet je zeker dat je dit formulier wilt verwijderen?', true)) return;

            const sb = getSupabase();
            if (!sb) return;

            try {
                const { error } = await sb.from('inspection_templates').delete().eq('id', templateId);
                if (error) throw error;
                showToast('✓ Formulier verwijderd');
                document.getElementById('admin-modal').classList.remove('active');
                inspLoadTemplates();
            } catch (err) {
                showToast('❌ Fout: ' + friendlyError(err));
            }
        }

        // ----- Inspecties laden -----
        async function inspLoadInspections() {
            const sb = getSupabase();
            if (!sb) return;
            const container = document.getElementById('insp-list');
            if (!container) return;
            container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.85rem">Laden...</div>';

            try {
                let query = sb.from('inspections').select('*, inspection_templates(name, category)').order('inspection_date', { ascending: false });

                const templateFilter = document.getElementById('insp-filter-template')?.value;
                const userFilter = document.getElementById('insp-filter-user')?.value;
                const statusFilter = document.getElementById('insp-filter-status')?.value;
                if (templateFilter) query = query.eq('template_id', templateFilter);
                if (userFilter) query = query.eq('user_id', userFilter);
                if (statusFilter) {
                    query = query.eq('status', statusFilter);
                } else {
                    query = query.neq('status', 'archief');
                }

                const { data, error } = await query.limit(50);
                if (error) throw error;

                if (!data || data.length === 0) {
                    container.innerHTML = `
                        <div style="text-align:center;padding:40px 20px">
                            <div style="font-size:2rem;margin-bottom:8px">🔍</div>
                            <div style="color:var(--muted);font-size:0.85rem">Nog geen inspecties uitgevoerd</div>
                        </div>`;
                    return;
                }

                container.innerHTML = data.map(insp => {
                    const tplName = insp.inspection_templates?.name || 'Onbekend formulier';
                    const user = (window._adminUsers || []).find(u => u.id === insp.user_id);
                    const userName = user ? user.name : 'Onbekend';
                    const statusColors = { 'concept': 'var(--app-warn-soft)', 'afgerond': 'var(--app-ok-soft)', 'archief': 'var(--app-idle-soft)', 'goedgekeurd': '#d1fae5', 'afgekeurd': '#fee2e2' };
                    const statusLabels = { 'concept': '📝 Concept', 'afgerond': '✅ Afgerond', 'archief': '📦 Gearchiveerd', 'goedgekeurd': '✅ Goedgekeurd', 'afgekeurd': '❌ Afgekeurd' };
                    const pct = insp.total_questions > 0 ? Math.round(insp.answered_questions / insp.total_questions * 100) : 0;

                    return `
                        <div class="entry-card" style="cursor:pointer" onclick="inspOpenInspection('${insp.id}')" title="Openen om na te lopen of aan te passen">
                            <div style="display:flex;justify-content:space-between;align-items:start;gap:8px">
                                <div style="flex:1;min-width:0">
                                    <div style="font-weight:700;font-size:0.85rem">${tplName}</div>
                                    <div style="font-size:0.72rem;color:var(--muted);margin-top:2px">
                                        ${userName} · ${new Date(insp.inspection_date).toLocaleDateString('nl-NL')}
                                        ${insp.location ? ' · ' + escapeHtml(insp.location) : ''}
                                    </div>
                                    <div style="display:flex;gap:6px;margin-top:6px">
                                        <span style="font-size:0.65rem;background:${statusColors[insp.status] || '#f3f4f6'};padding:2px 8px;border-radius:4px;font-weight:600">${statusLabels[insp.status] || insp.status}</span>
                                        ${insp.total_questions > 0 ? `<span style="font-size:0.65rem;background:var(--app-bg-deep);padding:2px 8px;border-radius:4px">${pct}% ingevuld</span>` : ''}
                                    </div>
                                </div>
                                ${insp.inspection_number ? `<div style="font-size:0.7rem;color:var(--kts-blue);font-weight:600;white-space:nowrap">${insp.inspection_number}</div>` : ''}
                            </div>
                        </div>`;
                }).join('');
            } catch (err) {
                container.innerHTML = `<div style="text-align:center;padding:20px;color:#ef4444;font-size:0.85rem">Fout: ${err.message}</div>`;
            }
        }

        // Admin-flow: nieuwe inspectie aanmaken voor een medewerker.
        // Verschilt van inspStartFromTemplate (monteur-flow) doordat hier de
        // admin ook kiest WIE de inspectie moet doen en op welk project.
        async function inspStartNew() {
            const sb = getSupabase();
            if (!sb) { showToast('⚠️ Niet verbonden'); return; }

            // Templates ophalen · alleen actieve formulieren. Respecteer test-modus
            // net als de formulieren-lijst (is_test), zodat de admin in test-modus
            // test-formulieren ziet en in productie de echte.
            let templates = [];
            try {
                let q = sb.from('inspection_templates')
                    .select('id, name, category, asset, location, installation')
                    .eq('is_active', true);
                // Vangnet tegen zwerf-testdata · test-modus zelf is uitgefaseerd
                q = q.or('is_test.eq.false,is_test.is.null');
                const { data, error } = await q.order('name');
                if (error) throw error;
                templates = data || [];
            } catch (e) {
                showToast('⚠️ Templates laden mislukt: ' + friendlyError(e));
                return;
            }
            if (templates.length === 0) {
                showToast('⚠️ Geen actieve formulieren · maak er een aan via Beheer → Formulieren');
                return;
            }

            // goToAdmin() start loadAdminData() zonder await, dus bij een snelle klik
            // kan de medewerkers/projecten-cache nog leeg zijn. Laad 'm dan eerst zodat
            // we geen misleidende "geen medewerkers/projecten" melding tonen.
            if ((!window._adminUsers || window._adminUsers.length === 0 ||
                 !window._adminProjects || window._adminProjects.length === 0)
                && typeof loadAdminData === 'function') {
                try { await loadAdminData(); } catch (e) { /* fallback hieronder vangt lege cache */ }
            }

            // Actieve medewerkers + projecten uit admin cache. De cache bevat zowel
            // test- als productie-records · filter daarom op test-modus net als de rest
            // van het beheer. getFilteredUsers() doet test/archived/paused filtering al.
            const users = (typeof getFilteredUsers === 'function'
                ? getFilteredUsers()
                : (window._adminUsers || []).filter(u =>
                    u.is_test !== true && !u.archived_at && !u.paused_at)
            ).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            const projects = (window._adminProjects || [])
                .filter(p => (p.is_test !== true))
                .filter(p => p.status === 'active')
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            if (users.length === 0) { showToast('⚠️ Geen actieve medewerkers'); return; }
            if (projects.length === 0) { showToast('⚠️ Geen actieve projecten'); return; }

            // Default datum = vandaag
            const today = toLocalDateStr(new Date());
            // Default project = laatst geselecteerd, anders eerste
            const defaultProjectId = (currentProject && projects.find(p => p.id === currentProject.id))
                ? currentProject.id : projects[0].id;

            // Formulier-optie toont alleen de naam · het categorie-achtervoegsel
            // (" · Piket") maakte lange namen te breed voor het keuzevak en is
            // niet nodig om een formulier te herkennen.
            const tplOptions = templates.map(t =>
                `<option value="${t.id}" data-asset="${escapeHtml(t.asset || '')}">${escapeHtml(t.name)}</option>`
            ).join('');
            const userOptions = users.map(u =>
                `<option value="${u.id}">${escapeHtml(u.name || u.email || 'Onbekend')}</option>`
            ).join('');
            const projOptions = projects.map(p =>
                `<option value="${p.id}" ${p.id === defaultProjectId ? 'selected' : ''}>${escapeHtml(p.project_code || '')} | ${escapeHtml(p.name || '')}</option>`
            ).join('');

            const firstAsset = (templates[0].asset && templates[0].asset.trim()) || 'NSM-PG1';
            const fields = `
                <div class="form-group" style="margin-bottom:12px">
                    <label>Formulier</label>
                    <select id="inew-template">${tplOptions}</select>
                </div>
                <div class="form-group" style="margin-bottom:12px">
                    <label>Medewerker</label>
                    <select id="inew-user">${userOptions}</select>
                </div>
                <div class="form-group" style="margin-bottom:12px">
                    <label>Project</label>
                    <select id="inew-project">${projOptions}</select>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Asset / locatie code</label>
                        <input type="text" id="inew-asset" placeholder="Bijv. NSM-PG1 of NSM-SG1.6" value="${escapeHtml(firstAsset)}">
                    </div>
                    <div class="form-group">
                        <label>Inspectiedatum</label>
                        <input type="date" id="inew-date" value="${today}">
                    </div>
                </div>
                <div style="font-size:0.72rem;color:var(--muted);line-height:1.4;margin-top:4px">
                    De inspectie komt klaar als <b>Concept</b> in de lijst van de gekozen medewerker. De asset-code komt in het inspectienummer (INS-${new Date().getFullYear()}-XXXX-asset) en in de PDF-titel.
                </div>
            `;

            const modal = document.getElementById('admin-modal');
            const titleEl = document.getElementById('admin-modal-title');
            const fieldsEl = document.getElementById('admin-modal-fields');
            const saveBtn = document.getElementById('admin-modal-save');
            const delBtn = document.getElementById('admin-modal-delete');
            if (!modal || !titleEl || !fieldsEl) {
                showToast('⚠️ Modal niet beschikbaar');
                return;
            }
            titleEl.textContent = 'Nieuwe inspectie aanmaken';
            fieldsEl.innerHTML = fields;
            if (saveBtn) {
                saveBtn.style.display = 'inline-flex';
                saveBtn.textContent = 'Aanmaken';
                saveBtn.onclick = inspCreateFromAdmin;
            }
            if (delBtn) delBtn.style.display = 'none';
            modal.classList.add('active');

            // Bij template-wissel: vul asset code automatisch in als het veld leeg is
            // of nog op de oude template-default staat.
            const tplSel = document.getElementById('inew-template');
            const assetEl = document.getElementById('inew-asset');
            let lastSuggestedAsset = firstAsset;
            tplSel.addEventListener('change', function() {
                const opt = tplSel.options[tplSel.selectedIndex];
                const tplAsset = opt?.dataset?.asset?.trim() || '';
                if (!tplAsset) return;
                // Alleen overschrijven als de gebruiker het veld nog niet handmatig wijzigde
                if (!assetEl.value || assetEl.value === lastSuggestedAsset) {
                    assetEl.value = tplAsset;
                    lastSuggestedAsset = tplAsset;
                }
            });
        }

        async function inspCreateFromAdmin() {
            const sb = getSupabase();
            if (!sb) { showToast('⚠️ Niet verbonden'); return; }

            const templateId = document.getElementById('inew-template')?.value;
            const userId = document.getElementById('inew-user')?.value;
            const projectId = document.getElementById('inew-project')?.value;
            const assetRaw = document.getElementById('inew-asset')?.value || '';
            const inspDate = document.getElementById('inew-date')?.value || toLocalDateStr(new Date());

            if (!templateId) { showToast('⚠️ Kies een formulier'); return; }
            if (!userId) { showToast('⚠️ Kies een medewerker'); return; }
            if (!projectId) { showToast('⚠️ Kies een project'); return; }
            const assetCode = assetRaw.trim();
            if (!assetCode) { showToast('⚠️ Asset code is verplicht'); return; }
            const cleanAsset = assetCode.replace(/\s+/g, '_');

            // Haal template op voor location/installation/sections
            const { data: tpl, error: tplErr } = await sb.from('inspection_templates')
                .select('*').eq('id', templateId).single();
            if (tplErr || !tpl) { showToast('⚠️ Template niet gevonden'); return; }

            // Inspectienummer · zelfde patroon als monteur-flow
            const year = parseInt(inspDate.slice(0, 4)) || new Date().getFullYear();
            const { data: lastInsp } = await sb.from('inspections')
                .select('inspection_number')
                .ilike('inspection_number', `INS-${year}-%`)
                .order('created_at', { ascending: false })
                .limit(1);
            let nextSeq = 1;
            if (lastInsp && lastInsp.length > 0) {
                const parts = lastInsp[0].inspection_number.split('-');
                nextSeq = (parseInt(parts[2]) || 0) + 1;
            }
            const inspNumber = `INS-${year}-${String(nextSeq).padStart(4, '0')}-${cleanAsset}`;

            // Tel vragen voor totaal
            const sections = tpl.sections || [];
            let totalQ = 0;
            sections.forEach(s => { totalQ += (s.questions || []).length; });

            // Aanmaken
            const { data: newInsp, error: insErr } = await sb.from('inspections').insert({
                template_id: templateId,
                project_id: projectId,
                user_id: userId,
                inspection_number: inspNumber,
                inspection_date: inspDate,
                location: tpl.location || '',
                installation: tpl.installation || '',
                asset: cleanAsset,
                description: tpl.name + ' · ' + cleanAsset,
                answers: {},
                status: 'concept',
                total_questions: totalQ,
                answered_questions: 0,
                passed_questions: 0,
                failed_questions: 0
            }).select().single();

            if (insErr) { showToast('⚠️ Aanmaken mislukt: ' + friendlyError(insErr)); return; }

            const userName = (window._adminUsers || []).find(u => u.id === userId)?.name || 'medewerker';
            showToast(`✓ Inspectie ${inspNumber} klaargezet voor ${userName}`);
            closeModal('admin-modal');
            inspLoadInspections();
        }

        // ===== INSPECTIE · MONTEUR SCHERM =====

        // Laad beschikbare templates voor de monteur
        async function inspLoadUserTemplates() {
            const sb = getSupabase();
            const list = document.getElementById('insp-user-template-list');
            if (!list) return;
            list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.85rem">Laden...</div>';

            // Probeer met de toewijzing-kolom; valt terug op zonder als de
            // migratie (migratie-formulier-toewijzing.sql) nog niet gedraaid is.
            let templates = null, error = null;
            ({ data: templates, error } = await sb.from('inspection_templates')
                .select('id, name, description, category, frequency, location, installation, asset, assigned_user_ids')
                .eq('is_active', true)
                .order('name'));
            if (error && /assigned_user_ids|column/.test(error.message || '')) {
                ({ data: templates, error } = await sb.from('inspection_templates')
                    .select('id, name, description, category, frequency, location, installation, asset')
                    .eq('is_active', true)
                    .order('name'));
            }

            // Toewijzing: een engineer (niet-admin) ziet alleen formulieren die aan
            // niemand zijn toegewezen (= iedereen) of waar hij zelf bij staat.
            if (templates && currentUser && currentUser.role !== 'admin') {
                templates = templates.filter(t => {
                    const a = t.assigned_user_ids;
                    return !Array.isArray(a) || a.length === 0 || a.includes(currentUser.id);
                });
            }

            if (error || !templates || templates.length === 0) {
                list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.85rem">Geen formulieren beschikbaar</div>';
                return;
            }

            // SVG icons (klein, design-stijl)
            const clipboardIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>';
            const arrowRight = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';

            list.innerHTML = templates.map(t => `
                <button class="insp-tpl-card" onclick="inspStartFromTemplate('${t.id}')">
                    <div class="insp-tpl-icon">${clipboardIcon}</div>
                    <div class="insp-tpl-body">
                        <div class="insp-tpl-name">${escapeHtml(t.name)}</div>
                        ${t.description ? `<div class="insp-tpl-desc">${escapeHtml(t.description)}</div>` : ''}
                        <div class="insp-tpl-tags">
                            ${t.category ? `<span class="insp-tag">${escapeHtml(t.category)}</span>` : ''}
                            ${t.frequency ? `<span class="insp-tag">${escapeHtml(t.frequency)}</span>` : ''}
                            ${t.location ? `<span class="insp-tag">${escapeHtml(t.location)}</span>` : ''}
                        </div>
                    </div>
                    <div class="insp-tpl-arrow">${arrowRight}</div>
                </button>
            `).join('');
        }

        // Laad eigen inspecties van de monteur
        async function inspLoadUserInspections() {
            const sb = getSupabase();
            const list = document.getElementById('insp-user-list');
            if (!list || !currentUser) return;
            list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.85rem">Laden...</div>';

            const statusFilter = document.getElementById('insp-user-filter-status')?.value;

            // Offline-status inladen (voor badge en offline-fallback van de lijst).
            if (typeof inspLoadPreparedIds === 'function') { try { await inspLoadPreparedIds(); } catch (e) {} }
            let offlineBundles = [];
            if (typeof inspIdbGetAll === 'function') { try { offlineBundles = await inspIdbGetAll('inspecties') || []; } catch (e) { offlineBundles = []; } }
            const dirtyIds = new Set(offlineBundles.filter(b => b.dirty).map(b => b.id));

            let inspections = null, error = null;
            if (navigator.onLine && sb) {
                let query = sb.from('inspections')
                    .select('*, inspection_templates(name)')
                    .eq('user_id', currentUser.id)
                    .order('created_at', { ascending: false });
                if (statusFilter) query = query.eq('status', statusFilter);
                else query = query.neq('status', 'archief');
                ({ data: inspections, error } = await query);
            }

            // Offline (of ophalen mislukt): toon de lokaal beschikbare inspecties.
            if (!inspections) {
                inspections = offlineBundles.filter(b => b.insp).map(b => ({
                    ...b.insp,
                    answers: b.answers,
                    answered_questions: (b.counts && b.counts.answered_questions) ?? b.insp.answered_questions,
                    failed_questions: (b.counts && b.counts.failed_questions) ?? b.insp.failed_questions,
                }));
                if (statusFilter) inspections = inspections.filter(i => i.status === statusFilter);
                else inspections = inspections.filter(i => i.status !== 'archief');
                inspections.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
            }

            if (!inspections || inspections.length === 0) {
                list.innerHTML = navigator.onLine
                    ? '<div class="insp-empty-state"><div class="icon">○</div>Geen inspecties gevonden</div>'
                    : '<div class="insp-empty-state"><div class="icon">📴</div>Geen offline inspecties · bereid ze voor met internet</div>';
                return;
            }

            // Action button SVG icons
            const pdfIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
            const copyIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
            const archiveIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>';
            const undoIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>';
            const trashIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';

            list.innerHTML = '<div class="insp-entry-list">' + inspections.map(ins => {
                const templateName = ins.inspection_templates?.name || 'Onbekend';
                const date = ins.inspection_date ? new Date(ins.inspection_date).toLocaleDateString('nl-NL') : '';
                const progress = ins.total_questions > 0 ? Math.round((ins.answered_questions / ins.total_questions) * 100) : 0;
                const failedCount = ins.failed_questions || 0;
                const hasDeviation = failedCount > 0;

                // Status pill
                let pillClass = 'is-concept', pillLabel = 'Concept';
                if (ins.status === 'afgerond') {
                    if (hasDeviation) { pillClass = 'is-alert'; pillLabel = `Afgerond · ${failedCount} afw.`; }
                    else { pillClass = 'is-afgerond'; pillLabel = 'Afgerond'; }
                } else if (ins.status === 'archief') {
                    pillClass = 'is-archief'; pillLabel = 'Gearchiveerd';
                } else if (ins.status === 'goedgekeurd') {
                    pillClass = 'is-afgerond'; pillLabel = 'Goedgekeurd';
                }

                // Entry-card status class (voor accentstreep)
                let entryClass = 'insp-entry insp-entry-clickable is-' + (ins.status || 'concept');
                if (hasDeviation && ins.status === 'afgerond') entryClass += ' has-deviation';

                // Meta-line: nummer · datum · locatie/asset
                const metaParts = [];
                if (ins.inspection_number) metaParts.push(escapeHtml(ins.inspection_number));
                if (date) metaParts.push(date);
                if (ins.asset) metaParts.push(escapeHtml(ins.asset));
                else if (ins.location) metaParts.push(escapeHtml(ins.location));
                const metaLine = metaParts.join(' · ');

                // Actie-knoppen
                const showPdf = (ins.status === 'afgerond' || ins.status === 'archief');
                const showArchive = ins.status === 'afgerond';
                const showUnarchive = ins.status === 'archief';

                // Offline-status van deze inspectie
                const prepared = (typeof inspIsPrepared === 'function') && inspIsPrepared(ins.id);
                const dirty = dirtyIds.has(ins.id);
                const offlineBadge = dirty
                    ? '<span class="insp-status-pill" style="background:var(--app-warn-soft);color:var(--app-warn)">📴 niet gesynct</span>'
                    : (prepared ? '<span class="insp-status-pill" style="background:var(--app-info-soft);color:var(--app-info)">📴 offline klaar</span>' : '');

                const actions = [];
                // Offline-voorbereiden alleen voor concepten (die worden op locatie ingevuld)
                if (ins.status === 'concept' && typeof inspPrepareOffline === 'function') {
                    actions.push(`<button class="insp-action-btn" onclick="event.stopPropagation();inspPrepareOffline('${ins.id}')" title="${prepared ? 'Opnieuw voorbereiden (ververst documenten en data)' : 'Download alles lokaal zodat je offline kunt werken'}">📴 ${prepared ? 'Offline ✓' : 'Offline maken'}</button>`);
                }
                if (showPdf) actions.push(`<button class="insp-action-btn" onclick="event.stopPropagation();inspGeneratePDF('${ins.id}')">${pdfIcon} PDF</button>`);
                actions.push(`<button class="insp-action-btn" onclick="event.stopPropagation();inspCopyForObject('${ins.id}','${ins.template_id}')" title="Kopieer voor ander object">${copyIcon} Kopieer</button>`);
                if (showArchive) actions.push(`<button class="insp-action-btn" onclick="event.stopPropagation();inspArchive('${ins.id}', true)">${archiveIcon} Archiveer</button>`);
                if (showUnarchive) actions.push(`<button class="insp-action-btn" onclick="event.stopPropagation();inspArchive('${ins.id}', false)">${undoIcon} Terug</button>`);
                actions.push(`<button class="insp-action-btn is-danger" onclick="event.stopPropagation();inspDelete('${ins.id}','${escapeHtml(String(templateName).replace(/'/g, "\\'"))}')">${trashIcon} Verwijder</button>`);

                return `
                    <div class="${entryClass}" onclick="inspOpenInspection('${ins.id}')">
                        <div class="insp-entry-head">
                            <div style="flex:1;min-width:0">
                                ${metaLine ? `<div class="insp-entry-meta">${metaLine}</div>` : ''}
                                <div class="insp-entry-title">${escapeHtml(templateName)}</div>
                            </div>
                            <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
                                <span class="insp-status-pill ${pillClass}">${pillLabel}</span>
                                ${offlineBadge}
                            </div>
                        </div>
                        ${ins.total_questions > 0 ? `
                        <div class="insp-entry-progress">
                            <div class="bar"><div class="bar-fill" style="width:${progress}%"></div></div>
                            <div class="pct">${ins.answered_questions}/${ins.total_questions} · ${progress}%</div>
                        </div>` : ''}
                        <div class="insp-entry-actions">
                            ${actions.join('')}
                        </div>
                    </div>
                `;
            }).join('') + '</div>';
        }

        // Inspectie kopiëren voor ander object (zelfde template, antwoorden mee)
        async function inspCopyForObject(sourceInspectionId, templateId) {
            if (!await confirmAsync('Antwoorden van deze inspectie kopiëren naar een nieuwe inspectie voor een ander object?\n\nBijvoorbeeld voor NSM-PG2 als deze NSM-PG1 is. Je kunt daarna de antwoorden waar nodig aanpassen.')) return;
            // Roep inspStartFromTemplate aan met de copyFromInspectionId parameter
            await inspStartFromTemplate(templateId, sourceInspectionId);
        }

        // Inspectie archiveren of terugzetten
        async function inspArchive(inspectionId, archive) {
            const sb = getSupabase();
            if (!sb) return;
            try {
                const newStatus = archive ? 'archief' : 'afgerond';
                const { error } = await sb.from('inspections').update({ status: newStatus }).eq('id', inspectionId);
                if (error) throw error;
                showToast(archive ? '✓ Inspectie gearchiveerd' : '✓ Inspectie teruggezet naar afgerond');
                if (typeof inspLoadUserInspections === 'function') inspLoadUserInspections();
                if (typeof loadInspectiesAdmin === 'function') loadInspectiesAdmin();
            } catch (err) {
                showToast('❌ Fout: ' + friendlyError(err));
            }
        }

        // Inspectie verwijderen (met bevestiging)
        async function inspDelete(inspectionId, templateName) {
            const ok = await confirmAsync(`Weet je zeker dat je deze inspectie wilt verwijderen?\n\n"${templateName}"\n\nDit kan niet ongedaan worden gemaakt.`, true);
            if (!ok) return;
            const sb = getSupabase();
            if (!sb) return;
            try {
                const { error } = await sb.from('inspections').delete().eq('id', inspectionId);
                if (error) throw error;
                showToast('✓ Inspectie verwijderd');
                if (typeof inspLoadUserInspections === 'function') inspLoadUserInspections();
                if (typeof loadInspectiesAdmin === 'function') loadInspectiesAdmin();
            } catch (err) {
                showToast('❌ Verwijderen mislukt: ' + friendlyError(err));
            }
        }

        // Start nieuwe inspectie vanuit een template
        async function inspStartFromTemplate(templateId, copyFromInspectionId) {
            const sb = getSupabase();
            if (!currentUser) {
                showToast('⚠️ Niet ingelogd');
                return;
            }
            // Auto-laad project als nog niet gezet (engineers die direct naar inspecties gaan)
            if (!currentProject) {
                try {
                    // Probeer eerst projecten waar gebruiker aan is toegewezen
                    const { data: userProjects } = await sb.from('user_projects')
                        .select('project_id, projects(*)')
                        .eq('user_id', currentUser.id);
                    if (userProjects && userProjects.length > 0) {
                        currentProject = userProjects[0].projects;
                    } else {
                        // Geen toewijzing: gebruik het placeholder-project i.p.v.
                        // een willekeurig actief project (anders komt de inspectie
                        // onder andermans project te hangen)
                        currentProject = await getPlaceholderProject(sb);
                    }
                } catch(e) { console.warn('Project auto-load mislukt:', e); }

                if (!currentProject) {
                    showToast('⚠️ Selecteer eerst een project bovenin de app');
                    return;
                }
            }

            // Haal template op
            const { data: tpl, error: tplErr } = await sb.from('inspection_templates')
                .select('*')
                .eq('id', templateId)
                .single();

            if (tplErr || !tpl) {
                showToast('⚠️ Formulier niet gevonden');
                return;
            }

            // Vraag om asset/locatie code (verplicht voor Maximo-koppeling)
            // Default: tpl.asset (uit template) of NSM-PG1 (handigste startpunt · wijzig 1 in 2 voor PG2)
            const defaultAsset = tpl.asset && tpl.asset.trim() ? tpl.asset.trim() : 'NSM-PG1';
            const assetCode = await promptAsync(
                'Asset / locatie code',
                'Bijv. NSM-PG1',
                defaultAsset,
                'Komt in de PDF-titel en bestandsnaam zodat de klant de inspectie kan koppelen aan Maximo-werkorders. Bijvoorbeeld NSM-PG1, NSM-PG2, NSM-SG1.6 of NSM-SG1.7.'
            );
            if (assetCode === null) return; // geannuleerd, geen melding
            if (!assetCode.trim()) {
                showToast('⚠️ Asset code is verplicht');
                return;
            }
            const cleanAsset = assetCode.trim().replace(/\s+/g, '_');

            // Eventueel antwoorden kopiëren van bestaande inspectie
            let copiedAnswers = {};
            if (copyFromInspectionId) {
                const { data: src } = await sb.from('inspections').select('answers').eq('id', copyFromInspectionId).single();
                if (src && src.answers) copiedAnswers = JSON.parse(JSON.stringify(src.answers));
            }

            // Genereer inspectienummer met asset code
            const year = new Date().getFullYear();
            const { data: lastInsp } = await sb.from('inspections')
                .select('inspection_number')
                .ilike('inspection_number', `INS-${year}-%`)
                .order('created_at', { ascending: false })
                .limit(1);

            let nextSeq = 1;
            if (lastInsp && lastInsp.length > 0) {
                // Pak het sequentienummer (3e segment) uit "INS-2026-0011" of "INS-2026-0011-NSM_PG1"
                const parts = lastInsp[0].inspection_number.split('-');
                nextSeq = (parseInt(parts[2]) || 0) + 1;
            }
            const inspNumber = `INS-${year}-${String(nextSeq).padStart(4, '0')}-${cleanAsset}`;

            // Tel vragen
            const sections = tpl.sections || [];
            let totalQ = 0;
            sections.forEach(s => { totalQ += (s.questions || []).length; });

            // Tel beantwoorde vragen uit gekopieerde antwoorden
            let answeredCount = 0, passedCount = 0, failedCount = 0;
            Object.values(copiedAnswers).forEach(a => {
                if (a && a.value !== undefined && a.value !== '') {
                    answeredCount++;
                    if (a.value === 'goed') passedCount++;
                    if (a.value === 'fout') failedCount++;
                }
            });

            // Maak inspectie aan
            const { data: newInsp, error: insErr } = await sb.from('inspections').insert({
                template_id: templateId,
                project_id: currentProject.id,
                user_id: currentUser.id,
                inspection_number: inspNumber,
                inspection_date: toLocalDateStr(new Date()),
                location: tpl.location || '',
                installation: tpl.installation || '',
                asset: cleanAsset,
                description: tpl.name + ' · ' + cleanAsset,
                answers: copiedAnswers,
                status: 'concept',
                total_questions: totalQ,
                answered_questions: answeredCount,
                passed_questions: passedCount,
                failed_questions: failedCount
            }).select().single();

            if (insErr) {
                showToast('⚠️ Fout: ' + friendlyError(insErr));
                return;
            }

            showToast('✓ Inspectie ' + inspNumber + ' aangemaakt');
            inspLoadUserInspections();
            // TODO: fase 2 · open het invulformulier
            inspOpenInspection(newInsp.id);
        }

        // ===== INSPECTIE FORMULIER (v2 · snelle UI, sectie-navigatie) =====

        // In-memory state voor het actieve formulier
        window._inspActive = null; // { id, answers, sections, status, totalQ }

        // Open een inspectie (start in overzicht-modus)
        async function inspOpenInspection(inspectionId, sectionIdx) {
            const sb = getSupabase();
            let insp = null, error = null;

            // Online: verse data uit Supabase. Offline: sla dit over.
            if (navigator.onLine && sb) {
                ({ data: insp, error } = await sb.from('inspections')
                    .select('*, inspection_templates(name, sections, location, installation, asset, frequency, category, plattegrond_path, documents)')
                    .eq('id', inspectionId)
                    .single());
                // Fallback: DB zonder documents/plattegrond_path kolom (migraties
                // nog niet gedraaid) mag het openen van inspecties niet blokkeren
                if (error && /plattegrond_path|documents|column/.test(error.message || '')) {
                    ({ data: insp, error } = await sb.from('inspections')
                        .select('*, inspection_templates(name, sections, location, installation, asset, frequency, category)')
                        .eq('id', inspectionId)
                        .single());
                }
            }

            // Lokale offline-kopie ophalen (indien voorbereid of offline ingevuld).
            let bundle = null;
            if (typeof inspGetOfflineBundle === 'function') {
                try { bundle = await inspGetOfflineBundle(inspectionId); } catch (e) { bundle = null; }
            }

            if (insp) {
                // Er zijn nog niet-gesynchroniseerde lokale antwoorden? Die hebben
                // voorrang op de serverdata, anders zou je offline werk verliezen.
                if (bundle && bundle.dirty && bundle.answers) insp.answers = bundle.answers;
            } else if (bundle && bundle.insp) {
                // Offline (of ophalen mislukt): open de lokale kopie.
                insp = bundle.insp;
                insp.answers = bundle.answers || insp.answers || {};
            }

            if (!insp) {
                showToast(navigator.onLine ? '⚠️ Inspectie niet gevonden' : '⚠️ Niet offline beschikbaar · bereid \'m voor met internet');
                return;
            }

            const tpl = insp.inspection_templates || {};
            const sections = tpl.sections || [];
            const answers = insp.answers || {};
            let totalQ = 0;
            sections.forEach(s => { totalQ += (s.questions || []).length; });

            // Sla state op in geheugen
            window._inspActive = { id: inspectionId, answers: JSON.parse(JSON.stringify(answers)), sections, status: insp.status, totalQ, insp, view: typeof sectionIdx === 'number' ? 'section' : 'overview', activeSectionIdx: sectionIdx };

            // Render juiste view
            if (typeof sectionIdx === 'number') {
                inspRenderSectionView(sectionIdx);
            } else {
                inspRenderOverview();
            }
        }

        // Overzicht renderen · grid met alle secties
        // SVG-icon helpers (Plex-stijl)
        function _inspIconCheck() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>'; }
        function _inspIconAlert() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>'; }
        function _inspIconClock() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'; }
        function _inspIconCamera() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>'; }
        function _inspIconGallery() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>'; }
        function _inspIconArrowLeft() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>'; }
        function _inspIconArrowRight() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>'; }
        function _inspIconPlus() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>'; }
        function _inspIconClose() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>'; }

        // Bereken sectie-status in nieuw design-systeem
        function _inspGetSectionStatus(stats) {
            if (stats.total === 0 || stats.done === 0) return { cls: '', icon: null };
            if (stats.done < stats.total) return { cls: 'is-warn', icon: _inspIconClock() };
            // Alle vragen beantwoord
            if (stats.bad > 0) return { cls: 'is-alert', icon: _inspIconAlert() };
            return { cls: 'is-ok', icon: _inspIconCheck() };
        }

        function inspRenderOverview() {
            const state = window._inspActive;
            if (!state) return;
            const { sections, answers, insp } = state;
            const tpl = insp.inspection_templates || {};

            // Bereken sectie-voortgang (afwijking = fout OF conditiescore 4-6)
            const sectionStats = sections.map((sec, si) => {
                const qs = sec.questions || [];
                let done = 0, good = 0, bad = 0;
                qs.forEach((q, qi) => {
                    const a = answers[`s${si}_q${qi}`];
                    if (a && a.value !== undefined && a.value !== '') {
                        done++;
                        if (a.value === 'goed') good++;
                        if (a.value === 'fout') bad++;
                        const sc = Number(a.value);
                        if (!isNaN(sc) && sc >= 4 && sc <= 6) bad++;
                    }
                });
                return { total: qs.length, done, good, bad };
            });

            const totalQ = state.totalQ;
            const totalDone = sectionStats.reduce((s, x) => s + x.done, 0);
            const totalGood = sectionStats.reduce((s, x) => s + x.good, 0);
            const totalBad = sectionStats.reduce((s, x) => s + x.bad, 0);
            // Voor stats: bezig = secties met done > 0 maar niet compleet, open = secties met done == 0
            const sectionsWarn = sectionStats.filter(s => s.done > 0 && s.done < s.total).length;
            const sectionsIdle = sectionStats.filter(s => s.done === 0).length;
            const sectionsOk = sectionStats.filter(s => s.done === s.total && s.bad === 0 && s.total > 0).length;
            const sectionsAlert = sectionStats.filter(s => s.done === s.total && s.bad > 0 && s.total > 0).length;
            const pct = totalQ > 0 ? Math.round((totalDone / totalQ) * 100) : 0;
            const remaining = totalQ - totalDone;

            // Object label (asset code prominent)
            const objectParts = [];
            if (insp.asset) objectParts.push(escapeHtml(insp.asset));
            if (insp.location) objectParts.push(escapeHtml(insp.location));
            if (insp.inspection_number) objectParts.push(escapeHtml(insp.inspection_number));
            const objectLabel = objectParts.join(' · ') || escapeHtml(tpl.name || 'Inspectie');

            // Hero
            const heroHtml = `
                <div class="insp-hero">
                    <div class="insp-object-line">${objectLabel}</div>
                    <h1 class="insp-hero-title">${totalDone} van ${totalQ} vragen beantwoord</h1>
                    <div class="insp-progress-row">
                        <div class="insp-pct">${pct}<span class="insp-pct-unit">%</span></div>
                        <div class="insp-ratio">${remaining} RESTEREND</div>
                    </div>
                    <div class="insp-progressbar">
                        <div class="insp-progressbar-fill" style="width:${pct}%"></div>
                    </div>
                    <div class="insp-progress-stats">
                        <div class="insp-stat is-ok"><span class="insp-stat-dot"></span><strong>${totalGood}</strong> goed</div>
                        <div class="insp-stat is-alert"><span class="insp-stat-dot"></span><strong>${totalBad}</strong> afw.</div>
                        <div class="insp-stat is-warn"><span class="insp-stat-dot"></span><strong>${sectionsWarn}</strong> bezig</div>
                        <div class="insp-stat is-idle"><span class="insp-stat-dot"></span><strong>${sectionsIdle}</strong> open</div>
                    </div>
                    ${inspDocButtonsHtml(tpl, 'overview')}
                </div>`;

            // Sectie-cards
            let cardsHtml = `<div class="insp-sectie-grid">`;
            sections.forEach((sec, si) => {
                const st = sectionStats[si];
                const status = _inspGetSectionStatus(st);
                const sectPct = st.total > 0 ? Math.round((st.done / st.total) * 100) : 0;
                // Code + titel splitsen op de EERSTE " ·" indien aanwezig (rest blijft samen)
                const fullTitle = sec.title || 'Sectie ' + (si + 1);
                let code, title;
                const firstDash = fullTitle.indexOf(' ·');
                if (firstDash > 0 && firstDash < 10) {
                    // Korte code voor de dash (max 10 tekens) · bv "PG1", "PG2"
                    code = fullTitle.substring(0, firstDash);
                    title = fullTitle.substring(firstDash + 3);
                } else {
                    code = 'SECTIE ' + (si + 1);
                    title = fullTitle;
                }
                // Count label
                let countLabel;
                if (status.cls === 'is-alert') {
                    countLabel = `<strong>${st.bad}</strong> AFWIJKING${st.bad === 1 ? '' : 'EN'}`;
                } else {
                    countLabel = `<strong>${st.done}</strong>/${st.total}`;
                }
                const fillStyle = status.cls === 'is-warn' ? `style="width:${sectPct}%"` : '';
                cardsHtml += `
                    <button class="insp-sectie-card ${status.cls}" data-section-id="${si}" onclick="inspOpenSectionView(${si})">
                        <div class="insp-sectie-head">
                            <div>
                                <div class="insp-sectie-code">${escapeHtml(code)}</div>
                                <h3 class="insp-sectie-title">${escapeHtml(title)}</h3>
                            </div>
                            <div class="insp-sectie-status">${status.icon || ''}</div>
                        </div>
                        <div class="insp-sectie-foot">
                            <div class="insp-countpill">${countLabel}</div>
                            <div class="insp-mini-progress">
                                <div class="insp-mini-progress-fill" ${fillStyle}></div>
                            </div>
                        </div>
                    </button>`;
            });
            cardsHtml += `</div>`;

            // CTA
            let ctaHtml = '';
            if (insp.status === 'concept') {
                const allDone = totalDone >= totalQ;
                const ctaLabel = allDone ? 'Inspectie afronden' : `Inspectie afronden  ·  ${remaining} ${remaining === 1 ? 'vraag' : 'vragen'} open`;
                ctaHtml = `
                    <div class="insp-overview-cta">
                        <button id="insp-finish-btn" class="insp-btn-primary" onclick="inspFinish()" ${allDone ? '' : 'disabled'}>${ctaLabel}</button>
                    </div>`;
            } else {
                ctaHtml = `
                    <div class="insp-overview-cta">
                        <div style="text-align:center;color:var(--insp-ok);font-weight:600;font-size:14px;margin-bottom:4px;font-family:var(--insp-font-sans)">Inspectie afgerond</div>
                        <div style="text-align:center;color:var(--insp-ink-400);font-size:11px;margin-bottom:8px;font-family:var(--insp-font-mono);letter-spacing:0.06em;text-transform:uppercase">Wijzigingen automatisch opgeslagen</div>
                        <div style="display:flex;gap:8px">
                            <button class="insp-btn-ghost" style="flex:1" onclick="inspGeneratePDF('${insp.id}')">PDF Rapport</button>
                            <button class="insp-btn-primary" style="flex:1" onclick="inspCloseForm()">Sluiten</button>
                        </div>
                    </div>`;
            }

            const modal = document.getElementById('insp-fill-modal');
            modal.innerHTML = `
                <div class="modal-content insp-modal-content insp-module">
                    <button class="insp-modal-close" onclick="inspCloseForm()" aria-label="Sluiten">${_inspIconClose()}</button>
                    <div class="insp-modal-body">
                        ${heroHtml}
                        ${cardsHtml}
                        ${ctaHtml}
                    </div>
                </div>`;
            modal.classList.add('active');
        }

        // Open één sectie in detailweergave
        function inspOpenSectionView(sectionIdx) {
            if (!window._inspActive) return;
            window._inspActive.view = 'section';
            window._inspActive.activeSectionIdx = sectionIdx;
            inspRenderSectionView(sectionIdx);
        }

        // Terug naar overzicht
        function inspBackToOverview() {
            if (!window._inspActive) return;
            window._inspActive.view = 'overview';
            window._inspActive.activeSectionIdx = null;
            inspRenderOverview();
        }

        // Render één sectie (detail view)
        // NEN labels (gedeeld)
        const _INSP_NEN_LABELS = ['Uitstekend', 'Goed', 'Redelijk', 'Matig', 'Slecht', 'Zeer slecht'];

        function inspRenderSectionView(si) {
            const state = window._inspActive;
            if (!state) return;
            const { sections, answers, insp } = state;
            const tpl = insp.inspection_templates || {};
            const sec = sections[si];
            if (!sec) { inspBackToOverview(); return; }

            // Sectie-stats
            const qs = sec.questions || [];
            let done = 0;
            qs.forEach((q, qi) => {
                const a = answers[`s${si}_q${qi}`];
                if (a && a.value !== undefined && a.value !== '') done++;
            });
            const sectPct = qs.length > 0 ? Math.round((done / qs.length) * 100) : 0;

            // Code + titel splitsen op EERSTE " ·"
            const fullTitle = sec.title || 'Sectie ' + (si + 1);
            const firstDashIdx = fullTitle.indexOf(' ·');
            let secCode, secName;
            if (firstDashIdx > 0 && firstDashIdx < 10) {
                secCode = fullTitle.substring(0, firstDashIdx);
                secName = fullTitle.substring(firstDashIdx + 3);
            } else {
                secCode = 'SECTIE ' + (si + 1);
                secName = fullTitle;
            }

            // Crumb-line: inspectie naam + asset code
            const crumbParts = [];
            if (insp.asset) crumbParts.push(escapeHtml(insp.asset));
            else if (tpl.name) crumbParts.push(escapeHtml(tpl.name));
            crumbParts.push(escapeHtml(secCode));

            // Sticky header
            const headerHtml = `
                <div class="insp-sectie-header">
                    <div class="insp-crumbline">
                        ${crumbParts.map((p, i) => i > 0 ? `<span class="insp-sep">/</span><span>${p}</span>` : `<span>${p}</span>`).join('')}
                    </div>
                    <div class="insp-sectie-header-row">
                        <h2 class="insp-sectie-header-title">${escapeHtml(secName)}</h2>
                        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
                            ${inspDocButtonsHtml(tpl, 'compact')}
                            <div class="insp-pos"><strong>${done}</strong> / ${qs.length}</div>
                        </div>
                    </div>
                    <div class="insp-micro-progress">
                        <div class="insp-micro-progress-fill" style="width:${sectPct}%"></div>
                    </div>
                </div>`;

            // Vragen renderen
            let questionsHtml = '<div class="insp-vragen">';
            qs.forEach((q, qi) => {
                const key = `s${si}_q${qi}`;
                const val = answers[key] || {};
                const numScore = Number(val.value);
                const isHogeScore = !isNaN(numScore) && numScore >= 4 && numScore <= 6;
                const isAfwijking = val.value === 'fout' || isHogeScore;
                const requiresNote = isAfwijking || val.value === 'nvt';

                // Antwoord-component op basis van type
                let answerHtml = '';
                if (q.type === 'goed_fout') {
                    answerHtml = `
                        <div class="insp-triplet" role="radiogroup" aria-label="Antwoord">
                            <button data-state="ok" aria-pressed="${val.value === 'goed' ? 'true' : 'false'}" onclick="inspAnswer('${key}','goed')">${val.value === 'goed' ? _inspIconCheck() : ''} Goed</button>
                            <button data-state="alert" aria-pressed="${val.value === 'fout' ? 'true' : 'false'}" onclick="inspAnswer('${key}','fout')">Fout</button>
                            <button data-state="nvt" aria-pressed="${val.value === 'nvt' ? 'true' : 'false'}" onclick="inspAnswer('${key}','nvt')">N.v.t.</button>
                        </div>`;
                } else if (q.type === 'conditiescore') {
                    let cellsHtml = '';
                    for (let s = 1; s <= 6; s++) {
                        const pressed = val.value === String(s) ? 'true' : 'false';
                        cellsHtml += `<button class="insp-nen-cell" data-score="${s}" aria-pressed="${pressed}" onclick="inspAnswer('${key}','${s}')" title="${s} ·${_INSP_NEN_LABELS[s-1]}"><span class="insp-nen-num">${s}</span><span class="insp-nen-tick"></span></button>`;
                    }
                    let selectedHtml = '';
                    if (val.value && Number(val.value) >= 1 && Number(val.value) <= 6) {
                        const score = Number(val.value);
                        const lbl = _INSP_NEN_LABELS[score - 1];
                        const isDeviation = score >= 4;
                        selectedHtml = `
                            <span class="insp-nen-selected">
                                <span class="insp-nen-selected-dot" style="background: var(--insp-nen-${score})"></span>
                                ${score} ·${lbl}
                                ${isDeviation ? '<span class="insp-nen-deviation">Afwijking</span>' : ''}
                            </span>`;
                    }
                    answerHtml = `
                        <div class="insp-nen">
                            <div class="insp-nen-track" role="radiogroup" aria-label="Conditiescore">${cellsHtml}</div>
                            <div class="insp-nen-meta">
                                <span class="insp-nen-scale">1 GOED → 6 SLECHT</span>
                                ${selectedHtml}
                            </div>
                        </div>`;
                } else if (q.type === 'meting' || q.type === 'numeriek') {
                    const unit = q.unit ? escapeHtml(q.unit) : '';
                    answerHtml = `
                        <div class="insp-meting">
                            <input type="text" inputmode="decimal" id="insp-input-${key}" value="${val.value ? escapeHtml(String(val.value)) : ''}" placeholder="…" onchange="inspAnswer('${key}',this.value)">
                            ${unit ? `<div class="insp-meting-unit">${unit}</div>` : ''}
                        </div>`;
                } else {
                    answerHtml = `<textarea class="insp-notes-input" id="insp-input-${key}" style="min-height:80px" placeholder="…" onchange="inspAnswer('${key}',this.value)">${val.value ? escapeHtml(String(val.value)) : ''}</textarea>`;
                }

                // Extras label
                const photoCount = (val.photos || []).length;
                const hasNote = val.remark && val.remark.trim().length > 0;
                let extrasLabel;
                if (photoCount === 0 && !hasNote) extrasLabel = 'Geen foto · geen opmerking';
                else {
                    const parts = [];
                    if (photoCount > 0) parts.push(`${photoCount} foto${photoCount === 1 ? '' : "'s"}`);
                    if (hasNote) parts.push('opmerking');
                    extrasLabel = parts.join(' · ');
                }
                if (requiresNote && !hasNote) extrasLabel = '⚠ Opmerking vereist bij afwijking';

                // Foto thumbs
                let thumbsHtml = '';
                (val.photos || []).forEach((ph, pi) => {
                    thumbsHtml += `<div class="insp-photo-thumb" style="background-image:url('${ph}')" data-photo-id="${pi}"><button class="insp-photo-remove" aria-label="Foto verwijderen" onclick="event.stopPropagation();inspRemovePhoto('${key}',${pi})">${_inspIconClose()}</button></div>`;
                });

                // Notes input
                const notesPlaceholder = requiresNote ? 'Opmerking vereist bij afwijking…' : 'Opmerking…';
                const notesClass = (requiresNote && !hasNote) ? 'insp-notes-input is-required' : 'insp-notes-input';

                // Component-tag
                const componentTag = q.component ? `<span class="insp-component-tag">${escapeHtml(q.component)}${q.discipline ? ' · ' + escapeHtml(q.discipline) : ''}</span>` : '';

                questionsHtml += `
                    <article class="insp-vraag" data-question-id="${key}">
                        <div class="insp-vraag-head">
                            <div class="insp-vraag-meta">
                                <span class="insp-qnum">VRAAG ${String(qi + 1).padStart(2, '0')} / ${String(qs.length).padStart(2, '0')}</span>
                                ${componentTag}
                            </div>
                            <h3 class="insp-qtext">${escapeHtml(q.text || 'Vraag ' + (qi + 1))}</h3>
                        </div>
                        <div class="insp-answer-zone">${answerHtml}</div>
                        <div class="insp-vraag-extras">
                            <div class="insp-extras-toolbar">
                                <span class="insp-label-tiny">${extrasLabel}</span>
                                <div class="insp-photo-actions">
                                    <label for="insp-camera-${key}" class="insp-photo-btn" title="Foto maken">${_inspIconCamera()}</label>
                                    <input type="file" id="insp-camera-${key}" accept="image/*" capture="environment" onchange="inspAddPhoto('${key}', this)" style="display:none">
                                    <label for="insp-photo-${key}" class="insp-photo-btn" title="Uit galerij">${_inspIconGallery()}</label>
                                    <input type="file" id="insp-photo-${key}" accept="image/*" onchange="inspAddPhoto('${key}', this)" style="display:none">
                                </div>
                            </div>
                            <textarea id="insp-remark-${key}" class="${notesClass}" placeholder="${notesPlaceholder}" onchange="inspAnswerRemark('${key}',this.value)">${val.remark ? escapeHtml(val.remark) : ''}</textarea>
                            <div id="insp-photos-${key}" class="insp-photo-strip" style="${(photoCount > 0 || true) ? '' : 'display:none'}">
                                ${thumbsHtml}
                                <label for="insp-photo-${key}" class="insp-photo-thumb is-add" title="Foto toevoegen">${_inspIconPlus()}</label>
                            </div>
                        </div>
                    </article>`;
            });
            questionsHtml += '</div>';

            // Navigatie tussen secties
            const hasPrev = si > 0;
            const hasNext = si < sections.length - 1;
            const navHtml = `
                <div class="insp-vraag-nav">
                    <button class="insp-nav-btn" onclick="inspOpenSectionView(${si - 1})" ${hasPrev ? '' : 'disabled'}>${_inspIconArrowLeft()} Vorige</button>
                    <button class="insp-nav-btn is-center" onclick="inspBackToOverview()">Overzicht</button>
                    <button class="insp-nav-btn" onclick="inspOpenSectionView(${si + 1})" ${hasNext ? '' : 'disabled'}>Volgende ${_inspIconArrowRight()}</button>
                </div>`;

            const modal = document.getElementById('insp-fill-modal');
            modal.innerHTML = `
                <div class="modal-content insp-modal-content insp-module">
                    <button class="insp-modal-close" onclick="inspCloseForm()" aria-label="Sluiten">${_inspIconClose()}</button>
                    <div class="insp-modal-body">
                        ${headerHtml}
                        ${questionsHtml}
                        ${navHtml}
                    </div>
                </div>`;
            modal.classList.add('active');
        }

        // Scroll naar sectie
        function inspScrollToSection(si) {
            const el = document.getElementById('insp-sec-' + si);
            const body = document.getElementById('insp-sec-body-' + si);
            if (body && body.style.display === 'none') inspToggleSection(si);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        // Sectie inklappen/uitklappen
        function inspToggleSection(si) {
            const body = document.getElementById('insp-sec-body-' + si);
            const arrow = document.getElementById('insp-sec-arrow-' + si);
            if (!body) return;
            const isOpen = body.style.display !== 'none';
            body.style.display = isOpen ? 'none' : 'block';
            if (arrow) arrow.style.transform = isOpen ? 'rotate(-90deg)' : '';
        }

        // Sluiten + opslaan
        function inspCloseForm() {
            closeModal('insp-fill-modal');
            // Ververs de lijst waar de gebruiker vandaan kwam. De monteur-lijst
            // guardt zelf op #insp-user-list + currentUser, dus veilig aan te
            // roepen. De admin-overzichtslijst (Beheer > Inspecties) verversen we
            // alleen als die tab zichtbaar is, zodat een door de admin nagelopen
            // of aangepaste inspectie meteen de nieuwe voortgang/status toont.
            if (typeof inspLoadUserInspections === 'function') inspLoadUserInspections();
            const adminOverview = document.getElementById('admin-insp-overzicht');
            if (adminOverview && adminOverview.style.display !== 'none' && typeof inspLoadInspections === 'function') {
                inspLoadInspections();
            }
            window._inspActive = null;
        }

        // Antwoord opslaan (lokale UI update + achtergrond-save)
        async function inspAnswer(key, value) {
            if (!window._inspActive) return;
            const state = window._inspActive;
            if (!state.answers[key]) state.answers[key] = {};
            state.answers[key].value = value;

            // Bewaar scroll-positie van de modal voordat we re-renderen,
            // anders schiet de view naar boven na klik
            const modalBody = document.querySelector('.insp-modal-body');
            const scrollTop = modalBody ? modalBody.scrollTop : 0;

            // Re-render section view (nieuwe markup gebruikt aria-pressed dus full re-render is simpeler)
            if (state.view === 'section' && typeof state.activeSectionIdx === 'number') {
                inspRenderSectionView(state.activeSectionIdx);
            } else {
                inspRenderOverview();
            }

            // Restore scroll
            const newBody = document.querySelector('.insp-modal-body');
            if (newBody) {
                newBody.scrollTop = scrollTop;
            }

            // Bepaal of dit een afwijkend antwoord is dat extra info vereist
            const isFout = value === 'fout';
            const isNvt = value === 'nvt';
            const numScore = Number(value);
            const isHogeScore = !isNaN(numScore) && numScore >= 4 && numScore <= 6;

            if (value === 'fout' || value === 'nvt' || isHogeScore) {
                const accentColor = (isFout || isHogeScore) ? '#dc2626' : '#6b7280';
                let placeholder, hintText;
                if (isFout) {
                    placeholder = 'Beschrijf het probleem (verplicht bij fout)...';
                    hintText = '⚠️ Voeg een opmerking en foto toe bij een fout';
                } else if (isNvt) {
                    placeholder = 'Licht toe waarom n.v.t. (verplicht)...';
                    hintText = 'ℹ️ Opmerking verplicht bij n.v.t.';
                } else {
                    placeholder = `Beschrijf gebrek (verplicht bij conditie ${numScore})...`;
                    hintText = `⚠️ Voeg een opmerking en foto toe bij conditie ${numScore}`;
                }

                const remarkEl = document.getElementById('insp-remark-' + key);
                if (remarkEl) {
                    remarkEl.style.borderColor = accentColor;
                    remarkEl.placeholder = placeholder;
                    setTimeout(() => remarkEl.focus(), 50);
                }
                // Toon hint
                const card = document.getElementById('insp-q-' + key);
                if (card) {
                    let hint = card.querySelector('.insp-fout-hint');
                    if (!hint) {
                        hint = document.createElement('div');
                        hint.className = 'insp-fout-hint';
                        card.appendChild(hint);
                    }
                    hint.style.cssText = `font-size:0.7rem;color:${accentColor};margin-top:4px;font-weight:600`;
                    hint.innerHTML = hintText;
                }
            } else {
                // Bij goed: hint weghalen en placeholder resetten
                const card = document.getElementById('insp-q-' + key);
                if (card) {
                    const hint = card.querySelector('.insp-fout-hint');
                    if (hint) hint.remove();
                }
                const remarkEl = document.getElementById('insp-remark-' + key);
                if (remarkEl) {
                    remarkEl.style.borderColor = 'var(--border)';
                    remarkEl.placeholder = 'Opmerkingen...';
                }
            }

            // Save: online direct naar Supabase, offline lokaal (geen dataverlies).
            const answers = state.answers;
            const answeredCount = Object.values(answers).filter(a => a.value !== undefined && a.value !== '').length;
            const passedCount = Object.values(answers).filter(a => a.value === 'goed').length;
            const failedCount = Object.values(answers).filter(a => a.value === 'fout').length;

            const sb = getSupabase();
            const heeftOffline = typeof inspPersistAnswersLocal === 'function';
            if (navigator.onLine && sb) {
                try {
                    const { error } = await sb.from('inspections').update({
                        answers,
                        answered_questions: answeredCount,
                        passed_questions: passedCount,
                        failed_questions: failedCount
                    }).eq('id', state.id);
                    if (error) throw error;
                    // Gelukt: houd een eventuele offline-kopie vers (dirty=false).
                    if (heeftOffline) inspPersistAnswersLocal(false);
                } catch (e) {
                    // Verbinding viel weg tijdens opslaan: bewaar lokaal, sync later.
                    if (heeftOffline) { await inspPersistAnswersLocal(true); inspToonOfflineOpgeslagen(); }
                }
            } else if (heeftOffline) {
                // Offline: direct lokaal opslaan, wordt later automatisch gesynct.
                await inspPersistAnswersLocal(true);
                inspToonOfflineOpgeslagen();
            }
        }

        // Kleine, kortstondige hint dat er lokaal (offline) is opgeslagen · niet
        // bij elke tik een luide toast, alleen een subtiele bevestiging.
        let _inspOfflineHintTs = 0;
        function inspToonOfflineOpgeslagen() {
            const nu = Date.now();
            if (nu - _inspOfflineHintTs < 8000) return; // hoogstens 1x per 8s
            _inspOfflineHintTs = nu;
            showToast('📴 Offline opgeslagen · synct zodra er verbinding is');
        }

        // Update knoppen-UI voor een vraag (zonder page reload)
        function inspUpdateQuestionUI(key, value) {
            const card = document.getElementById('insp-q-' + key);
            if (card) {
                const isFout = value === 'fout';
                const answered = value !== undefined && value !== '';
                card.style.background = isFout ? '#fef2f2' : (answered ? '#f0fdf4' : 'white');
                card.style.borderColor = isFout ? '#fecaca' : (answered ? '#bbf7d0' : 'var(--border)');
            }

            // Goed/Fout/Nvt knoppen bijwerken
            ['goed', 'fout', 'nvt'].forEach(v => {
                const btn = document.getElementById(`insp-btn-${key}-${v}`);
                if (!btn) return;
                const active = value === v;
                if (v === 'goed') {
                    btn.style.borderColor = active ? '#16a34a' : 'var(--border)';
                    btn.style.background = active ? '#dcfce7' : 'white';
                    btn.style.color = active ? '#16a34a' : 'var(--text)';
                } else if (v === 'fout') {
                    btn.style.borderColor = active ? '#dc2626' : 'var(--border)';
                    btn.style.background = active ? '#fee2e2' : 'white';
                    btn.style.color = active ? '#dc2626' : 'var(--text)';
                } else {
                    btn.style.borderColor = active ? '#6b7280' : 'var(--border)';
                    btn.style.background = active ? '#f3f4f6' : 'white';
                    btn.style.color = active ? '#6b7280' : 'var(--text)';
                }
            });
        }

        // Update voortgang-UI (progress bar + sectie-tabs + afrond-knop)
        function inspUpdateProgressUI() {
            if (!window._inspActive) return;
            const state = window._inspActive;
            const answers = state.answers;
            const sections = state.sections;
            const totalQ = state.totalQ;

            let totalDone = 0, totalGood = 0, totalBad = 0;

            sections.forEach((sec, si) => {
                const qs = sec.questions || [];
                let done = 0, good = 0, bad = 0;
                qs.forEach((q, qi) => {
                    const a = answers[`s${si}_q${qi}`];
                    if (a && a.value !== undefined && a.value !== '') { done++; if (a.value === 'goed') good++; if (a.value === 'fout') bad++; }
                });
                totalDone += done; totalGood += good; totalBad += bad;

                // Sectie-tab bijwerken
                const tabContainer = document.getElementById('insp-section-tabs');
                if (tabContainer && tabContainer.children[si]) {
                    const tab = tabContainer.children[si];
                    const isDone = done === qs.length;
                    const hasFail = bad > 0;
                    tab.style.background = isDone ? (hasFail ? '#fee2e2' : '#dcfce7') : (done > 0 ? '#fef3c7' : '#f1f5f9');
                    tab.style.color = isDone ? (hasFail ? '#dc2626' : '#16a34a') : (done > 0 ? '#92400e' : 'var(--muted)');
                    tab.style.borderColor = tab.style.color;
                    const shortTitle = (sec.title || 'Sectie ' + (si + 1)).replace('PG1 ·', '1·').replace('PG2 ·', '2·').replace('Verdelerskid ', 'V').replace('Hoofdpomp skid', 'Hoofd').replace('Algemeen ·', '');
                    tab.textContent = `${shortTitle} ${done}/${qs.length}`;
                }

                // Sectie-header bijwerken
                const secHeader = document.getElementById('insp-sec-' + si);
                if (secHeader) {
                    const header = secHeader.firstElementChild;
                    if (header) {
                        const isDone = done === qs.length;
                        const hasFail = bad > 0;
                        header.style.background = isDone ? (hasFail ? '#fef2f2' : '#f0fdf4') : 'white';
                        header.style.borderColor = isDone ? (hasFail ? '#fecaca' : '#bbf7d0') : 'var(--border)';
                        // Update counter + icon
                        const rightDiv = header.querySelector('div:last-child');
                        if (rightDiv) {
                            rightDiv.innerHTML = `<span style="font-size:0.7rem;color:var(--muted)">${done}/${qs.length}</span>${isDone ? (hasFail ? '<span style="font-size:0.9rem">⚠️</span>' : '<span style="font-size:0.9rem">✅</span>') : ''}<span id="insp-sec-arrow-${si}" style="font-size:0.8rem;color:var(--muted)">▼</span>`;
                        }
                    }
                }
            });

            // Afrond-knop status bijwerken
            const finishBtn = document.getElementById('insp-finish-btn');
            const warnDiv = document.getElementById('insp-warn-incomplete');
            const warnCount = document.getElementById('insp-warn-count');
            const allDone = totalDone >= totalQ;
            if (finishBtn) {
                finishBtn.disabled = !allDone;
                finishBtn.style.opacity = allDone ? '1' : '0.5';
                finishBtn.style.cursor = allDone ? 'pointer' : 'not-allowed';
            }
            if (warnDiv) warnDiv.style.display = allDone ? 'none' : 'block';
            if (warnCount) warnCount.textContent = totalQ - totalDone;
        }

        // Opmerking opslaan (debounced)
        let _inspRemarkTimer = null;
        async function inspAddPhoto(key, input) {
            if (!window._inspActive) return;
            const file = input.files && input.files[0];
            if (!file) return;
            const state = window._inspActive;
            if (!state.answers[key]) state.answers[key] = {};
            if (!state.answers[key].photos) state.answers[key].photos = [];

            // Compress foto naar max 1200px breed en sla op als base64 JPEG
            const reader = new FileReader();
            reader.onload = async function(ev) {
                const img = new Image();
                img.onload = async function() {
                    const maxW = 1200;
                    const scale = img.width > maxW ? maxW / img.width : 1;
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
                    state.answers[key].photos.push(dataUrl);
                    // Direct opslaan
                    const sb = getSupabase();
                    await sb.from('inspections').update({ answers: state.answers }).eq('id', state.id);
                    // Update alleen de foto-container (geen full re-render)
                    inspUpdatePhotoUI(key);
                    showToast('✓ Foto toegevoegd');
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
            input.value = '';
        }

        async function inspRemovePhoto(key, photoIdx) {
            if (!window._inspActive) return;
            if (!await confirmAsync('Foto verwijderen?')) return;
            const state = window._inspActive;
            if (!state.answers[key] || !state.answers[key].photos) return;
            state.answers[key].photos.splice(photoIdx, 1);
            const sb = getSupabase();
            await sb.from('inspections').update({ answers: state.answers }).eq('id', state.id);
            inspUpdatePhotoUI(key);
        }

        // Update alleen foto-container van een vraag zonder hele modal te re-renderen
        function inspUpdatePhotoUI(key) {
            // In nieuwe design-systeem: re-render de sectie-view zodat thumbs en strip kloppen
            const state = window._inspActive;
            if (!state) return;
            // Bewaar scroll-positie
            const modalBody = document.querySelector('.insp-modal-body');
            const scrollTop = modalBody ? modalBody.scrollTop : 0;
            if (state.view === 'section' && typeof state.activeSectionIdx === 'number') {
                inspRenderSectionView(state.activeSectionIdx);
            }
            const newBody = document.querySelector('.insp-modal-body');
            if (newBody) newBody.scrollTop = scrollTop;
        }

        function inspAnswerRemark(key, remark) {
            if (!window._inspActive) return;
            const state = window._inspActive;
            if (!state.answers[key]) state.answers[key] = {};
            state.answers[key].remark = remark;

            clearTimeout(_inspRemarkTimer);
            _inspRemarkTimer = setTimeout(async () => {
                const sb = getSupabase();
                await sb.from('inspections').update({ answers: state.answers }).eq('id', state.id);
            }, 800);
        }

        // Inspectie afronden
        async function inspFinish() {
            if (!window._inspActive) return;
            const state = window._inspActive;

            // Validatie: fout/score 4-6 vereist opmerking + foto, n.v.t. vereist alleen opmerking
            const ontbrekend = [];
            (state.sections || []).forEach((sec, si) => {
                (sec.questions || []).forEach((q, qi) => {
                    const key = `s${si}_q${qi}`;
                    const a = state.answers[key];
                    if (!a) return;
                    const heeftOpmerking = a.remark && a.remark.trim().length > 0;
                    const heeftFoto = a.photos && a.photos.length > 0;
                    const score = Number(a.value);
                    const isHogeScore = !isNaN(score) && score >= 4 && score <= 6;
                    if (a.value === 'fout' && (!heeftOpmerking || !heeftFoto)) {
                        ontbrekend.push(`• ${q.text || 'Vraag ' + (qi+1)} [fout]${!heeftOpmerking ? ' (opmerking)' : ''}${!heeftFoto ? ' (foto)' : ''}`);
                    } else if (isHogeScore && (!heeftOpmerking || !heeftFoto)) {
                        ontbrekend.push(`• ${q.text || 'Vraag ' + (qi+1)} [conditie ${score}]${!heeftOpmerking ? ' (opmerking)' : ''}${!heeftFoto ? ' (foto)' : ''}`);
                    } else if (a.value === 'nvt' && !heeftOpmerking) {
                        ontbrekend.push(`• ${q.text || 'Vraag ' + (qi+1)} [n.v.t.] (opmerking)`);
                    }
                });
            });
            if (ontbrekend.length > 0) {
                await confirmAsync('Bij fout / conditiescore 4-6 zijn opmerking + foto verplicht.\nBij n.v.t. is een opmerking verplicht.\n\nNog te doen:\n' + ontbrekend.slice(0, 5).join('\n') + (ontbrekend.length > 5 ? `\n...en ${ontbrekend.length - 5} meer` : ''));
                return;
            }

            const ok = await confirmAsync('Weet je zeker dat je deze inspectie wilt afronden?');
            if (!ok) return;

            const sb = getSupabase();
            await sb.from('inspections').update({
                status: 'afgerond',
                completed_at: new Date().toISOString()
            }).eq('id', window._inspActive.id);

            closeModal('insp-fill-modal');
            showToast('✓ Inspectie afgerond');
            inspLoadUserInspections();
            window._inspActive = null;
        }

        // ===== INSPECTIE PDF RAPPORT =====
        async function inspGeneratePDF(inspectionId) {
            const sb = getSupabase();
            const { data: insp, error } = await sb.from('inspections')
                .select('*, inspection_templates(name, description, sections, location, installation, asset, frequency, category)')
                .eq('id', inspectionId)
                .single();

            if (error || !insp) { showToast('⚠️ Inspectie niet gevonden'); return; }
            if (!window.jspdf) { showToast('⚠️ PDF library nog niet geladen'); return; }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ unit: 'mm', format: 'a4' });
            addPdfWatermark(doc, false);
            const pw = 210, ml = 15, mr = 15, uw = pw - ml - mr;
            const tpl = insp.inspection_templates || {};
            const sections = tpl.sections || [];
            const answers = insp.answers || {};

            let y = 15;
            const lineH = 5;

            function checkPage(needed) {
                if (y + needed > 275) { doc.addPage(); addPdfWatermark(doc, false); y = 15; return true; }
                return false;
            }

            // === HEADER (compact, geen dubbele bedrijfsnaam · die zit al in voettekst) ===
            // Klein label "INSPECTIERAPPORT" boven de titel in mono uppercase
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(7, 86, 127);
            doc.text('INSPECTIERAPPORT', ml, y);
            doc.setTextColor(0, 0, 0);
            y += 6;

            // === TITEL ===
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 27, 45);
            doc.text(tpl.name || 'Inspectie', ml, y, { maxWidth: uw });
            y += 9;

            // Asset/locatie code prominent (voor Maximo koppeling)
            if (insp.asset) {
                doc.setFillColor(7, 86, 127);
                doc.rect(ml, y - 5, 50, 8, 'F');
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(255, 255, 255);
                doc.text(insp.asset, ml + 3, y);
                doc.setTextColor(0, 0, 0);
                y += 8;
            }

            // === META INFO · twee koloms compact grid ===
            const meta = [];
            if (insp.inspection_number) meta.push(['Nummer', insp.inspection_number]);
            if (insp.inspection_date) meta.push(['Datum', new Date(insp.inspection_date).toLocaleDateString('nl-NL')]);
            if (insp.location || tpl.location) meta.push(['Locatie', insp.location || tpl.location]);
            if (tpl.category) meta.push(['Categorie', tpl.category]);
            if (tpl.frequency) meta.push(['Frequentie', tpl.frequency]);
            if (insp.installation || tpl.installation) meta.push(['Installatie', insp.installation || tpl.installation]);

            // Linker en rechter kolom
            const metaCol1X = ml;
            const metaCol2X = ml + uw / 2 + 4;
            doc.setFontSize(7);
            const startY = y;
            meta.forEach((row, i) => {
                const colX = i % 2 === 0 ? metaCol1X : metaCol2X;
                const rowY = startY + Math.floor(i / 2) * 4.5;
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(120, 120, 120);
                doc.text(row[0].toUpperCase(), colX, rowY);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(15, 27, 45);
                doc.text(String(row[1]), colX + 22, rowY, { maxWidth: uw / 2 - 26 });
            });
            doc.setTextColor(0, 0, 0);
            y = startY + Math.ceil(meta.length / 2) * 4.5 + 5;

            // Hairline scheidingslijn
            doc.setDrawColor(231, 228, 221);
            doc.setLineWidth(0.3);
            doc.line(ml, y, pw - mr, y);
            y += 8;

            // === SAMENVATTING ===
            let totalQ = 0, totalDone = 0, totalGood = 0, totalBad = 0, totalNvt = 0;
            // Conditiescore-tracking (1 t/m 6)
            // Foto-bijlage verzamelen tijdens vraag-rendering
            const photoBijlage = [];

            const condCounts = [0, 0, 0, 0, 0, 0];
            let condSum = 0, condCount = 0;
            sections.forEach((sec, si) => {
                (sec.questions || []).forEach((q, qi) => {
                    totalQ++;
                    const a = answers[`s${si}_q${qi}`];
                    if (a && a.value !== undefined && a.value !== '') {
                        totalDone++;
                        if (a.value === 'goed') totalGood++;
                        if (a.value === 'fout') totalBad++;
                        if (a.value === 'nvt') totalNvt++;
                        // Conditiescore alleen tellen voor vragen van type 'conditiescore'
                        if (q.type === 'conditiescore') {
                            const sc = Number(a.value);
                            if (sc >= 1 && sc <= 6) {
                                condCounts[sc - 1]++;
                                condSum += sc;
                                condCount++;
                            }
                        }
                    }
                });
            });
            const condAvg = condCount > 0 ? (condSum / condCount) : null;

            // Samenvatting in een KTS-blauw kader met percentage
            const pct = totalQ > 0 ? Math.round((totalGood / totalQ) * 100) : 0;
            const summaryH = 26;
            // Off-white achtergrond met subtle border (design-systeem look)
            doc.setFillColor(250, 250, 247);
            doc.setDrawColor(231, 228, 221);
            doc.setLineWidth(0.3);
            doc.roundedRect(ml, y - 2, uw, summaryH, 2, 2, 'FD');

            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(7, 86, 127);
            doc.text('SAMENVATTING', ml + 4, y + 3);

            // Statistieken op 1 rij · design-kleuren (gedempt, NEN-stijl)
            doc.setFontSize(8);
            doc.setTextColor(0, 0, 0);
            const statY = y + 11;
            const colW = uw / 5;
            const stats = [
                { label: 'TOTAAL', value: String(totalQ), color: [15, 27, 45] },
                { label: 'GOED', value: String(totalGood), color: [47, 125, 79] },
                { label: 'AFW.', value: String(totalBad), color: [160, 40, 52] },
                { label: 'N.V.T.', value: String(totalNvt), color: [92, 102, 117] },
                { label: 'SCORE', value: pct + '%', color: pct === 100 ? [47, 125, 79] : (totalBad > 0 ? [160, 40, 52] : [7, 86, 127]) },
            ];
            stats.forEach((s, i) => {
                const cx = ml + colW * i + colW / 2;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(6.5);
                doc.setTextColor(138, 147, 161);
                doc.text(s.label, cx, statY, { align: 'center' });
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(13);
                doc.setTextColor(...s.color);
                doc.text(s.value, cx, statY + 7.5, { align: 'center' });
            });
            doc.setTextColor(0, 0, 0);
            doc.setLineWidth(0.2);
            y += summaryH + 5;

            // === CONDITIESCORE OVERZICHT (alleen als er conditiescores zijn) ===
            if (condCount > 0) {
                checkPage(28);
                const condH = 24;
                doc.setFillColor(248, 250, 252);
                doc.setDrawColor(7, 86, 127);
                doc.setLineWidth(0.5);
                doc.roundedRect(ml, y - 2, uw, condH, 2, 2, 'FD');

                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(7, 86, 127);
                doc.text('CONDITIESCORE (NEN 2767)', ml + 3, y + 3);

                // Gemiddelde rechts
                doc.setFontSize(8);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(120, 120, 120);
                doc.text(`Gemiddeld: `, pw - mr - 22, y + 3, { align: 'right' });
                doc.setFont('helvetica', 'bold');
                // Design-systeem NEN kleuren (gedempt, matchend met app)
                const condColors = [
                    [47, 125, 79],    // 1 · uitstekend
                    [107, 158, 58],   // 2 · goed
                    [184, 148, 39],   // 3 · redelijk
                    [199, 122, 42],   // 4 · matig (afwijking)
                    [184, 84, 50],    // 5 · slecht (afwijking)
                    [142, 42, 46]     // 6 · zeer slecht (afwijking)
                ];
                const avgColor = condAvg <= 2.5 ? condColors[0] : (condAvg <= 3.5 ? condColors[2] : condColors[4]);
                doc.setTextColor(...avgColor);
                doc.text(condAvg.toFixed(1), pw - mr - 3, y + 3, { align: 'right' });

                // 6 kolommen met de score-verdeling
                const condStatY = y + 11;
                const condColW = uw / 6;
                const condLabels = ['Uitstekend', 'Goed', 'Redelijk', 'Matig', 'Slecht', 'Zeer slecht'];
                for (let i = 0; i < 6; i++) {
                    const cx = ml + condColW * i + condColW / 2;
                    doc.setFontSize(7);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(120, 120, 120);
                    doc.text(`${i + 1} · ${condLabels[i]}`, cx, condStatY, { align: 'center' });
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(11);
                    doc.setTextColor(...condColors[i]);
                    doc.text(String(condCounts[i]), cx, condStatY + 7, { align: 'center' });
                }
                doc.setTextColor(0, 0, 0);
                y += condH + 5;
            }

            // === SECTIES MET RESULTATEN ===
            sections.forEach((sec, si) => {
                checkPage(20);
                // Bereken sectie-stats voor mini-counter rechts
                let secDone = 0, secGood = 0, secBad = 0;
                (sec.questions || []).forEach((q, qi) => {
                    const a = answers[`s${si}_q${qi}`];
                    if (a && a.value) {
                        secDone++;
                        if (a.value === 'goed') secGood++;
                        if (a.value === 'fout') secBad++;
                        const sc = Number(a.value);
                        if (!isNaN(sc) && sc >= 4 && sc <= 6) secBad++;
                    }
                });
                // KTS-blauwe sectie header
                doc.setFillColor(7, 86, 127);
                doc.rect(ml, y - 4, uw, 8, 'F');
                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(255, 255, 255);
                doc.text(sec.title || 'Sectie ' + (si + 1), ml + 3, y + 1);
                // Stats rechts in header
                doc.setFontSize(7);
                doc.setFont('helvetica', 'normal');
                doc.text(`${secDone}/${(sec.questions || []).length} beantwoord${secBad > 0 ? ` | ${secBad} fout` : ''}`, pw - mr - 2, y + 1, { align: 'right' });
                doc.setTextColor(0, 0, 0);
                y += 9;

                (sec.questions || []).forEach((q, qi) => {
                    checkPage(14);
                    const key = `s${si}_q${qi}`;
                    const a = answers[key] || {};
                    const val = a.value || '';
                    const remark = a.remark || '';

                    // Subtiele rode tint bij fout antwoorden (design-stijl: alert-soft)
                    if (val === 'fout') {
                        let estH = 6;
                        if (q.component) estH += 4;
                        if (remark) estH += 4;
                        if (a.photos && a.photos.length > 0) estH += 4 + 30 + 3 + (Math.ceil(a.photos.length / 3) - 1) * 33;
                        doc.setFillColor(245, 229, 229); // alert-soft uit design-tokens
                        doc.rect(ml, y - 3, uw, estH, 'F');
                    }

                    doc.setFontSize(8);
                    doc.setFont('helvetica', 'normal');

                    // Vraag tekst (multi-line support)
                    const qLines = doc.splitTextToSize(q.text || 'Vraag ' + (qi + 1), uw - 30);
                    doc.text(qLines, ml + 2, y);

                    // Subtiele rode tint bij hoge conditiescore (4-6)
                    const numScore = Number(val);
                    const isHogeScore = !isNaN(numScore) && numScore >= 4 && numScore <= 6;
                    if (isHogeScore) {
                        let estH = 6;
                        if (q.component) estH += 4;
                        if (remark) estH += 4;
                        if (a.photos && a.photos.length > 0) estH += 4 + 30 + 3 + (Math.ceil(a.photos.length / 3) - 1) * 33;
                        doc.setFillColor(245, 229, 229);
                        doc.rect(ml, y - 3, uw, estH, 'F');
                    }

                    // Resultaat rechts
                    let resultText = val || '-';
                    let resultColor = [0, 0, 0];
                    if (q.type === 'conditiescore' && numScore >= 1 && numScore <= 6) {
                        const condLabels = ['Uitstekend', 'Goed', 'Redelijk', 'Matig', 'Slecht', 'Zeer slecht'];
                        // Design-systeem NEN kleuren (gedempt)
                        const condColors = [[47, 125, 79], [107, 158, 58], [184, 148, 39], [199, 122, 42], [184, 84, 50], [142, 42, 46]];
                        resultText = `${numScore} ·${condLabels[numScore - 1]}`;
                        resultColor = condColors[numScore - 1];
                    } else if (val === 'goed') { resultText = '✓ GOED'; resultColor = [47, 125, 79]; }
                    else if (val === 'fout') { resultText = '✗ FOUT'; resultColor = [160, 40, 52]; }
                    else if (val === 'nvt') { resultText = 'N.v.t.'; resultColor = [92, 102, 117]; }

                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(...resultColor);
                    doc.text(resultText, pw - mr - 2, y, { align: 'right' });
                    doc.setTextColor(0, 0, 0);

                    y += qLines.length * 4;

                    // Component tag
                    if (q.component) {
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(7);
                        doc.setTextColor(107, 114, 128);
                        doc.text(`[${q.component}${q.discipline ? ' · ' + q.discipline : ''}]`, ml + 2, y);
                        doc.setTextColor(0, 0, 0);
                        y += 4;
                    }

                    // Opmerking
                    if (remark) {
                        doc.setFontSize(7);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(100, 100, 100);
                        doc.text('Opmerking:', ml + 4, y);
                        doc.setFont('helvetica', 'italic');
                        const remarkLines = doc.splitTextToSize(remark, uw - 22);
                        doc.text(remarkLines, ml + 22, y);
                        doc.setTextColor(0, 0, 0);
                        y += Math.max(remarkLines.length * 3.5, 4);
                    }

                    // Foto's: nummer toewijzen en verwijzing tonen, foto zelf in bijlage achteraan
                    if (a.photos && a.photos.length > 0) {
                        const startNum = photoBijlage.length + 1;
                        a.photos.forEach((ph, pi) => {
                            photoBijlage.push({
                                photo: ph,
                                sectionTitle: sec.title || 'Sectie ' + (si + 1),
                                questionText: q.text || 'Vraag ' + (qi + 1),
                                questionNum: qi + 1,
                                resultText: resultText,
                                remark: remark
                            });
                        });
                        const endNum = photoBijlage.length;
                        const refText = startNum === endNum
                            ? `Foto ${startNum} · zie bijlage`
                            : `Foto ${startNum}-${endNum} · zie bijlage`;
                        doc.setFontSize(7);
                        doc.setFont('helvetica', 'italic');
                        doc.setTextColor(7, 86, 127);
                        doc.text(refText, ml + 4, y);
                        doc.setTextColor(0, 0, 0);
                        y += 4;
                    }

                    // Lijn onder vraag
                    doc.setDrawColor(230);
                    doc.line(ml, y, pw - mr, y);
                    y += 3;
                });

                y += 4;
            });

            // === FOOTER ===
            checkPage(25);
            y += 5;
            doc.setDrawColor(0);
            doc.line(ml, y, pw - mr, y);
            y += 8;
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(`Gegenereerd: ${new Date().toLocaleString('nl-NL')}`, ml, y);
            doc.text('Kuijpers Technical Services BV · KTS Uren & Inspecties App', ml, y + 4);

            // === BIJLAGE: FOTO'S ===
            if (photoBijlage.length > 0) {
                doc.addPage();
                addPdfWatermark(doc, false);
                let by = 20;

                // Bijlage titel
                doc.setFontSize(16);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(7, 86, 127);
                doc.text('Bijlage · Foto’s', ml, by);
                doc.setTextColor(0, 0, 0);
                by += 6;
                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(120, 120, 120);
                doc.text(`${photoBijlage.length} foto${photoBijlage.length === 1 ? '' : "'s"} · gekoppeld aan vragen in dit rapport`, ml, by);
                doc.setTextColor(0, 0, 0);
                by += 8;

                // Eén foto per pagina, full-width met caption
                const captionH = 22; // hoogte voor onderschrift
                const photoMaxW = uw;
                const photoMaxH = 297 - by - captionH - 25; // ph - top - caption - footer marge

                photoBijlage.forEach((p, idx) => {
                    if (idx > 0) {
                        doc.addPage();
                        addPdfWatermark(doc, false);
                        by = 20;
                    }

                    // Foto-nummer & sectie boven de foto
                    doc.setFontSize(11);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(7, 86, 127);
                    doc.text(`Foto ${idx + 1}`, ml, by);
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(9);
                    doc.setTextColor(100, 100, 100);
                    const sectionLine = String(p.sectionTitle || '');
                    doc.text(sectionLine, pw - mr, by, { align: 'right' });
                    doc.setTextColor(0, 0, 0);
                    by += 5;

                    // Vraagtekst (eventueel multi-line)
                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'bold');
                    const qPrefix = `Vraag ${p.questionNum}: `;
                    const qFullText = qPrefix + (p.questionText || '');
                    const qLines = doc.splitTextToSize(qFullText, uw);
                    doc.text(qLines, ml, by);
                    by += qLines.length * 4 + 2;

                    // Resultaat + opmerking compact
                    if (p.resultText && p.resultText !== '-') {
                        doc.setFontSize(8);
                        doc.setFont('helvetica', 'normal');
                        doc.setTextColor(100, 100, 100);
                        let line = `Resultaat: ${p.resultText}`;
                        if (p.remark) line += `   ·   ${p.remark.length > 80 ? p.remark.substring(0, 80) + '…' : p.remark}`;
                        const resultLines = doc.splitTextToSize(line, uw);
                        doc.text(resultLines, ml, by);
                        doc.setTextColor(0, 0, 0);
                        by += resultLines.length * 3.5 + 3;
                    }

                    // Foto: full-width, behoud aspect ratio
                    try {
                        const props = doc.getImageProperties(p.photo);
                        const ratio = props.width / props.height;
                        let imgW = photoMaxW;
                        let imgH = imgW / ratio;
                        const remainH = 297 - by - 18;
                        if (imgH > remainH) {
                            imgH = remainH;
                            imgW = imgH * ratio;
                        }
                        const imgX = ml + (uw - imgW) / 2;
                        doc.addImage(p.photo, 'JPEG', imgX, by, imgW, imgH);
                    } catch(e) {
                        console.warn('Foto niet toegevoegd in bijlage:', e);
                        doc.setTextColor(150);
                        doc.text('[foto kon niet worden weergegeven]', ml, by);
                        doc.setTextColor(0);
                    }
                });
            }

            // Voettekst toevoegen (paginanummers zitten daar nu in)
            addPdfFooter(doc, false, insp.inspection_number || '');

            // Download · asset zit al in inspection_number, dus niet dubbel toevoegen
            const filename = `Inspectierapport_${(insp.inspection_number || 'onbekend').replace(/\//g, '-')}.pdf`;
            doc.save(filename);
            showToast('✓ PDF gedownload');
        }

        // =========================================================
        // ===== EINDE INSPECTIE MODULE ============================
        // =========================================================

