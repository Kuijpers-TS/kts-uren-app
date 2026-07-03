        // ===== NAV =====
        // Bottom-nav grid dynamisch aanpassen op aantal zichtbare nav-items
        // (bv. 5 items default, 4 zonder inspecties-recht, 3 zonder kosten-recht)
        function updateBottomNavGrid() {
            const nav = document.getElementById('bottom-nav-grid');
            if (!nav) return;
            const items = nav.querySelectorAll('.nav-item');
            let visible = 0;
            items.forEach(it => { if (it.style.display !== 'none') visible++; });
            if (visible > 0) {
                nav.style.gridTemplateColumns = `repeat(${visible}, 1fr)`;
            }
        }

        function switchScreen(name, event) {
            // Blokkeer admin scherm voor niet-admins
            if (name === 'admin' && (!currentUser || currentUser.role !== 'admin')) {
                showToast('⚠️ Alleen voor beheerders');
                return;
            }
            // Blokkeer kosten scherm als gebruiker geen declaratierechten heeft
            if (name === 'kosten' && currentUser && currentUser.role !== 'admin' && !userCanDeclareExpenses()) {
                showToast('⚠️ Extra kosten niet beschikbaar');
                return;
            }
            // Blokkeer administratie scherm als gebruiker geen toegang heeft
            if (name === 'administratie' && currentUser && currentUser.role !== 'admin' && !currentUser.allow_administratie) {
                showToast('⚠️ Administratie niet beschikbaar');
                return;
            }
            // Open inspectie? Sluit hem voordat we wisselen van tab.
            // Antwoorden zijn al inline opgeslagen via inspAnswer, dus geen
            // dataverlies. Voorkomt dat de inspectie-modal boven het nieuwe
            // scherm blijft hangen (z-index 200 staat over alles heen).
            if (window._inspActive && typeof inspCloseForm === 'function') {
                inspCloseForm();
            }
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            document.getElementById(`screen-${name}`).classList.add('active');
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            // Highlight juiste nav-item: via event (klik) of programmatisch zoeken
            if (event && event.currentTarget) {
                event.currentTarget.classList.add('active');
            } else {
                // Programmatisch: zoek nav-item die switchScreen('name') aanroept
                document.querySelectorAll('.nav-item').forEach(n => {
                    if (n.getAttribute('onclick') && n.getAttribute('onclick').includes("'" + name + "'")) {
                        n.classList.add('active');
                    }
                });
            }

            // Ververs overzicht bij openen (haalt verse data uit Supabase)
            if (name === 'overzicht') renderOverview();
            if (name === 'inspecties') { inspLoadUserTemplates(); inspLoadUserInspections(); }
            if (name === 'administratie') { adminLoadScreen(); }
            if (name === 'profiel') renderProfile();
            // Kosten-tab: laad de DB-expenses voor huidige week zodat de lijst klopt
            if (name === 'kosten') {
                const sbK = getSupabase();
                if (sbK && currentUser && currentProject && currentWeekNumber && currentYear) {
                    loadExpEntriesForWeek(sbK, currentUser.id, currentProject.id, currentWeekNumber, currentYear)
                        .then(() => renderExpenses());
                }
            }
            // Hide project selector on screens where it's not relevant
            document.querySelector('.project-selector').style.display = (name === 'administratie' || name === 'admin' || name === 'inspecties' || name === 'profiel') ? 'none' : '';
        }

        // ===== PROFIEL HUB =====
        function renderProfile() {
            if (!currentUser) return;
            const name = currentUser.name || 'Onbekend';
            // Initialen
            const parts = name.trim().split(/\s+/).filter(Boolean);
            const initials = parts.length >= 2
                ? (parts[0][0] + parts[parts.length-1][0]).toUpperCase()
                : (name[0] || '?').toUpperCase();
            const avatarEl = document.getElementById('pf-avatar');
            if (avatarEl) avatarEl.textContent = initials;
            const nameEl = document.getElementById('pf-name');
            if (nameEl) nameEl.textContent = name;
            // Rol
            const roleLabel = currentUser.role === 'admin' ? 'Beheerder' : (currentUser.role || 'Medewerker');
            const metaEl = document.getElementById('pf-meta');
            if (metaEl) metaEl.textContent = roleLabel;
            const emailEl = document.getElementById('pf-email');
            if (emailEl) emailEl.textContent = currentUser.email || '';
            // Beheer-rij (screen-admin: tegels projecten/personen/tarieven) · alleen admin
            const beheerRow = document.getElementById('pf-beheer-row');
            if (beheerRow) {
                beheerRow.style.display = currentUser.role === 'admin' ? '' : 'none';
            }
            // Administratie-rij (screen-administratie: bankuploads/facturen) · admin OF allow_administratie
            const adminRow = document.getElementById('pf-administratie-row');
            if (adminRow) {
                const showAdmin = currentUser.role === 'admin' || currentUser.allow_administratie;
                adminRow.style.display = showAdmin ? '' : 'none';
            }
            // Werkweek-omschrijving samenstellen uit defaults
            try {
                const defaults = getWeekDefaults();
                const active = defaults.filter(d => d.active);
                const desc = document.getElementById('pf-workweek-desc');
                if (desc && active.length > 0) {
                    const first = active[0];
                    desc.textContent = `${first.start} → ${first.end} · ${active.length} werkdagen`;
                }
            } catch (e) { /* fallback default text blijft staan */ }
            // Zoom-knop highlighten
            const savedZoom = localStorage.getItem('kts-zoom') || 'normaal';
            document.querySelectorAll('.app-zoom-btn[data-zoom]').forEach(btn => {
                btn.classList.toggle('is-active', btn.dataset.zoom === savedZoom);
            });
        }

        // ===== MODALS =====
        function openExpenseModal() {
            document.getElementById('exp-date').value = toLocalDateStr(new Date());
            document.getElementById('expense-modal').classList.add('active');
        }
        function closeModal(id) {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.remove('active');
            // Reset eventuele wide-variant van de inner modal · vermijdt dat een volgende
            // generieke admin-modal-opening per ongeluk te breed blijft.
            const innerModal = el.querySelector('.modal');
            if (innerModal) innerModal.classList.remove('modal-wide');
            // Ondertekenen-namens vangnet: sluit de admin het teken-venster via
            // ESC, de telefoon-terugknop of een backdrop-klik ZONDER te voltooien,
            // draai dan de tijdelijke identiteitswissel (currentUser = doelgebruiker)
            // altijd terug. Tijdens de echte onderteken-flow staat _signFlowBusy
            // aan en herstelt de flow zelf via zijn finally. Zonder dit vangnet
            // bleef de admin als de doelgebruiker door de app lopen.
            if (id === 'signature-modal'
                && typeof _adminSignOverride !== 'undefined' && _adminSignOverride
                && typeof _signFlowBusy !== 'undefined' && !_signFlowBusy
                && typeof restoreAdminSignOverride === 'function') {
                restoreAdminSignOverride();
                showToast('↩️ Ondertekenen geannuleerd');
            }
        }

        // Globale Escape-handler voor alle .modal-overlay elementen die `.active` zijn.
        // confirmAsync / askContinueAsync / promptAsync hebben hun eigen handlers op
        // dynamisch aangemaakte overlays · die werken onafhankelijk en sluiten zichzelf.
        document.addEventListener('keydown', function(e) {
            if (e.key !== 'Escape' && e.key !== 'Esc') return;
            // Pak de laatst-actieve modal-overlay (visueel bovenste). Als er meerdere
            // open staan (zelden), sluit alleen de bovenste · niet alle tegelijk.
            const actives = Array.from(document.querySelectorAll('.modal-overlay.active'));
            if (actives.length === 0) return;
            const top = actives[actives.length - 1];
            if (top.id) closeModal(top.id);
            else top.classList.remove('active');
        });

        // ===== KEYBOARD SHORTCUTS (admin) =====
        // '/' of 'k' focust het zichtbare zoekveld in beheer-lijsten.
        // Werkt alleen als focus NIET in een input/textarea zit (voorkomt
        // dat de letter in je tekst-input belandt).
        document.addEventListener('keydown', function(e) {
            if (e.key !== '/' && e.key !== 'k') return;
            // Skip als modifier-toets ingedrukt (laat Ctrl+K naar browser)
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            // Skip als focus al in een input-veld zit
            const t = e.target;
            if (t.matches('input, textarea, select, [contenteditable]')) return;
            // Zoek eerste zichtbare admin-search-input
            const searches = document.querySelectorAll('[id^="admin-search-"], #admin-list-search, #admin-invoice-search');
            for (const s of searches) {
                if (s.offsetParent !== null) {
                    e.preventDefault();
                    s.focus();
                    s.select && s.select();
                    return;
                }
            }
        });

        // ===== TERUG-KNOP (Android / browser-back) =====
        // De hardware terug-knop werkt als "terug" binnen de app:
        //   1. open modal → sluit de bovenste modal
        //   2. niet op de Uren-tab → ga naar de Uren-tab
        //   3. op de Uren-tab → dubbel-terug binnen 2s sluit de app
        // Werkt via een buffer-entry in de history zodat elke terug-druk eerst
        // bij ons uitkomt in plaats van de app direct te verlaten.
        (function initBackButton() {
            let exitArmed = false;
            const pushBuffer = () => { try { history.pushState({ kts: true }, ''); } catch (e) { /* ignore */ } };
            pushBuffer();
            window.addEventListener('popstate', function() {
                // 1. Bovenste open modal sluiten (incl. inspectie-invulscherm)
                const actives = Array.from(document.querySelectorAll('.modal-overlay.active'));
                if (actives.length > 0) {
                    const top = actives[actives.length - 1];
                    if (top.id) closeModal(top.id);
                    else top.classList.remove('active');
                    pushBuffer();
                    return;
                }
                // 2. Niet op de Uren-tab? Terug naar de thuis-tab
                const urenScreen = document.getElementById('screen-uren');
                if (currentUser && urenScreen && !urenScreen.classList.contains('active')) {
                    try { switchScreen('uren'); } catch (e) { /* ignore */ }
                    pushBuffer();
                    return;
                }
                // 3. Thuis-tab: dubbel-terug om echt af te sluiten
                if (!exitArmed) {
                    exitArmed = true;
                    showToast('Druk nogmaals op terug om de app af te sluiten', 2000);
                    setTimeout(() => { exitArmed = false; }, 2000);
                    pushBuffer();
                } else {
                    // Tweede druk: verlaat de app echt (originele history-entry)
                    history.back();
                }
            });
        })();

        // ===== PROJECT SWITCHER =====
        async function openProjectSwitcher() {
            const modal = document.getElementById('project-modal');
            const list = document.getElementById('project-switch-list');
            modal.classList.add('active');
            list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.85rem">Laden...</div>';

            const sb = getSupabase();
            if (!sb) { list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted)">Niet verbonden</div>'; return; }

            const isAdmin = currentUser && currentUser.role === 'admin';
            let projects = [];
            if (isAdmin) {
                const { data } = await sb.from('projects').select('*').eq('status', 'active').order('name');
                projects = data || [];
            } else {
                const { data: assignments } = await sb.from('user_projects').select('project_id').eq('user_id', currentUser.id);
                if (assignments && assignments.length > 0) {
                    const projectIds = assignments.map(a => a.project_id);
                    const { data } = await sb.from('projects').select('*').in('id', projectIds).eq('status', 'active').order('name');
                    projects = data || [];
                }
            }
            if (!projects || projects.length === 0) {
                list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.85rem">Geen projecten gevonden</div>';
                return;
            }

            // Tokens zodat de kaartjes ook in dark mode kloppen.
            // Active = transparante kts-accent tint (werkt in light en dark), border in accent-kleur.
            const activeBg = 'rgba(58,156,197,0.12)';
            const inactiveBg = 'var(--app-surface)';
            list.innerHTML = projects.map(p => {
                const isActive = currentProject && currentProject.id === p.id;
                const bgNow = isActive ? activeBg : inactiveBg;
                return `
                <div onclick="selectProject('${p.id}')" style="
                    display:flex;align-items:center;gap:12px;padding:14px 16px;
                    background:${bgNow};
                    border:2px solid ${isActive ? 'var(--kts-accent-light)' : 'var(--border)'};
                    border-radius:12px;cursor:pointer;transition:all 0.15s
                " onmouseover="this.style.background='${activeBg}'" onmouseout="this.style.background='${bgNow}'">
                    <div style="width:40px;height:40px;border-radius:10px;background:${isActive ? 'var(--kts-accent-light)' : 'var(--app-bg-deep)'};display:flex;align-items:center;justify-content:center;flex-shrink:0"><img src="tandwiel-wit-v2.png" alt="" style="width:22px;height:22px;opacity:${isActive ? '1' : '0.55'}"></div>
                    <div style="flex:1;min-width:0">
                        <div style="font-weight:700;font-size:0.9rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(p.name)}</div>
                        <div style="font-size:0.75rem;color:var(--muted)">${escapeHtml(p.client_name || '')} · ${escapeHtml(p.location || '')}</div>
                    </div>
                    ${isActive ? '<div style="color:var(--kts-accent-light);font-weight:700;font-size:1.1rem">✓</div>' : ''}
                </div>`;
            }).join('');
        }

        async function selectProject(projectId) {
            const sb = getSupabase();
            if (!sb) return;

            // Auto-save huidige week als er wijzigingen zijn
            if (weekDataDirty && currentUser && currentUser.id) {
                try {
                    await saveWeekToSupabase();
                } catch (e) {
                    showToast('⚠️ Auto-save mislukt · wijzigingen niet opgeslagen');
                    console.error('Auto-save fout bij project wissel:', e);
                }
            }

            // Haal geselecteerd project op
            const { data: project } = await sb.from('projects').select('*').eq('id', projectId).single();
            if (!project) { showToast('⚠️ Project niet gevonden'); return; }

            currentProject = project;
            if (currentUser && currentUser.hotel_rate) HOTEL_RATE = parseFloat(currentUser.hotel_rate);
            document.querySelector('.project-name').textContent = currentProject.name;
            document.querySelector('.project-meta').textContent =
                (currentProject.client_name || '') + ' · ' + (currentProject.location || '') + ' · ' + currentProject.project_code;

            // Onthoud keuze
            if (currentUser && currentUser.id) {
                localStorage.setItem('kts_last_project_' + currentUser.id, currentProject.id);
            }

            // Extra kosten tab tonen/verbergen (flags staan nu op users tabel)
            const navKosten = document.getElementById('nav-kosten');
            if (navKosten) navKosten.style.display = (currentUser.role === 'admin' || userCanDeclareExpenses()) ? '' : 'none';
            // Inspecties tab tonen/verbergen
            const navInsp = document.getElementById('nav-inspecties');
            if (navInsp) navInsp.style.display = (currentUser.role === 'admin' || currentUser.allow_inspecties) ? '' : 'none';
            // Administratie tab tonen/verbergen
            const navAdm = document.getElementById('nav-administratie');
            if (navAdm) navAdm.style.display = (currentUser.role === 'admin' || currentUser.allow_administratie) ? '' : 'none';
            // Bottom-nav grid dynamisch aanpassen aan aantal zichtbare items
            updateBottomNavGrid();

            // Laad tarieven voor nieuw project
            await loadProjectRates();

            // Reset en herlaad weekdata voor dit project
            weekData = defaultWeekData();
            weekSummary = null;
            signatureData = { zzp: null, client: null }; // Reset handtekening bij projectwissel
            markClean();
            expandedDay = -1;
            await loadWeekFromSupabase();

            // Clamp overzichtmaand naar project periode
            clampOverviewToProject();

            closeModal('project-modal');
            showToast('✓ ' + currentProject.name);
        }

        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                // Via closeModal zodat modal-specifieke opruimlogica (zoals het
                // terugdraaien van ondertekenen-namens) op ELK sluitpad draait
                if (e.target === overlay) {
                    if (overlay.id) closeModal(overlay.id);
                    else overlay.classList.remove('active');
                }
            });
        });

        // ===== TOAST =====
        function showToast(msg, duration) {
            const container = document.getElementById('toast-container');
            const t = document.createElement('div');
            t.className = 'toast';
            t.textContent = msg;
            container.appendChild(t);
            // Fade in
            requestAnimationFrame(() => t.classList.add('show'));
            // Fade out and remove
            setTimeout(() => {
                t.classList.remove('show');
                setTimeout(() => t.remove(), 350);
            }, duration || 5000);
            // Max 5 toasts visible
            while (container.children.length > 5) container.firstChild.remove();
        }

        // Toast met Annuleren-knop: de actie (onExecute) wordt pas na delayMs
        // echt uitgevoerd. Klik op Annuleren binnen die tijd voorkomt de actie
        // en draait onUndo (bv. item terugzetten in de lijst). Gebruikt voor
        // verwijder-acties zodat een misklik nog te stoppen is.
        function showUndoToast(msg, onExecute, onUndo, delayMs) {
            const container = document.getElementById('toast-container');
            const t = document.createElement('div');
            t.className = 'toast';
            t.style.pointerEvents = 'auto';
            t.style.display = 'flex';
            t.style.alignItems = 'center';
            t.style.gap = '10px';
            const span = document.createElement('span');
            span.textContent = msg;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = 'Annuleren';
            btn.style.cssText = 'flex-shrink:0;padding:5px 14px;border-radius:6px;border:1px solid rgba(255,255,255,0.45);background:rgba(255,255,255,0.12);color:white;font-weight:700;font-size:0.8rem;cursor:pointer;font-family:inherit';
            t.appendChild(span);
            t.appendChild(btn);
            container.appendChild(t);
            requestAnimationFrame(() => t.classList.add('show'));

            let afgehandeld = false;
            const dismiss = () => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); };
            const timer = setTimeout(async () => {
                if (afgehandeld) return;
                afgehandeld = true;
                dismiss();
                try { await onExecute(); } catch (e) { console.error('Undo-toast actie faalde:', e); }
            }, delayMs || 5000);
            btn.onclick = () => {
                if (afgehandeld) return;
                afgehandeld = true;
                clearTimeout(timer);
                dismiss();
                if (onUndo) onUndo();
            };
            while (container.children.length > 5) container.firstChild.remove();
        }

        // ===== OVERZICHT RENDER =====
        function showOverviewLoading() {
            const spinner = '<div style="display:flex;align-items:center;justify-content:center;gap:8px;padding:16px;color:var(--muted);font-size:0.85rem"><div class="loading-spinner"></div> Laden...</div>';
            const statsEl = document.getElementById('overview-stats');
            const revenueEl = document.getElementById('overview-revenue');
            const weekListEl = document.getElementById('week-status-list');
            if (statsEl) statsEl.innerHTML = spinner;
            if (revenueEl) revenueEl.innerHTML = '';
            if (weekListEl) weekListEl.innerHTML = spinner;
            document.getElementById('month-total').textContent = '';
        }

        // Reentrancy-guard: renderOverview wordt na elke save/navigatie aangeroepen
        // en doet meerdere await-queries. Twee gelijktijdige runs kunnen elkaars
        // DOM-writes doorkruisen (oude data overschrijft nieuwe). We laten maximaal
        // een run tegelijk toe; een tweede aanvraag tijdens een run wordt gequeued
        // zodat de laatste altijd met verse data eindigt.
        let _overviewBusy = false;
        let _overviewQueued = false;
        async function renderOverview() {
            if (_overviewBusy) { _overviewQueued = true; return; }
            _overviewBusy = true;
            try {
                await _renderOverviewInner();
            } finally {
                _overviewBusy = false;
                if (_overviewQueued) {
                    _overviewQueued = false;
                    renderOverview();
                }
            }
        }

        async function _renderOverviewInner() {
          try {
            const MONTHS_LONG = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];

            // Zorg dat overzichtmaand binnen projectperiode valt
            clampOverviewToProject();

            // Project feature flags
            const hasKm = userHasKm();
            const hasThuiswerk = userHasThuiswerk();
            const hasHotel = userHasHotel();
            const canSeeRates = userCanSeeRates();

            // Maandlabel updaten
            document.getElementById('month-label').textContent = `${MONTHS_LONG[overviewMonth]} ${overviewYear}`;

            // Bepaal eerste en laatste dag van de geselecteerde maand
            const monthStart = toLocalDateStr(new Date(overviewYear, overviewMonth, 1));
            const monthEnd = toLocalDateStr(new Date(overviewYear, overviewMonth + 1, 0));

            // Haal alle time_entries van deze maand op uit Supabase
            let monthEntries = [];
            const sb = getSupabase();
            if (sb && currentUser && currentUser.id) {
                let monthQuery = sb.from('time_entries')
                    .select('*')
                    .eq('user_id', currentUser.id)
                    .gte('entry_date', monthStart)
                    .lte('entry_date', monthEnd);
                if (currentProject) monthQuery = monthQuery.eq('project_id', currentProject.id);
                const { data } = await monthQuery.order('entry_date');
                monthEntries = data || [];
            }

            // Bereken maandtotalen
            let totalMonthHours = 0;
            let totalMonthKm = 0;
            let totalHotelNights = 0;
            let totalThuiswerkDagen = 0;
            let weekdayHours = 0;
            let satHours = 0;
            let sunHours = 0;

            monthEntries.forEach(e => {
                const hours = parseFloat(e.total_hours) || 0;
                totalMonthHours += hours;
                if (hasKm) totalMonthKm += parseFloat(e.km) || 0;
                if (hasHotel && e.hotel) totalHotelNights++;
                if (hasThuiswerk && e.thuiswerk) totalThuiswerkDagen++;
                const dayOfWeek = new Date(e.entry_date + 'T12:00:00').getDay();
                if (dayOfWeek === 6) satHours += hours;
                else if (dayOfWeek === 0) sunHours += hours;
                else weekdayHours += hours;
            });

            const totalMonthRevenue = (weekdayHours * RATE) + (satHours * RATE * SAT_MULTIPLIER) + (sunHours * RATE * SUN_MULTIPLIER);
            const totalKmRevenue = totalMonthKm * KM_RATE;
            const totalHotelTotal = totalHotelNights * HOTEL_RATE;

            // Declaraties (expenses) van deze maand ophalen. De expenses-tabel is per
            // week_number/year georganiseerd, niet per datum · wijs daarom elke ISO-week
            // toe aan de maand waarin de donderdag valt. Zo telt elke week in precies
            // één maand mee (geen dubbeltelling op maandgrenzen).
            let totalDeclaraties = 0;
            if (sb && currentUser && currentUser.id) {
                try {
                    const weekPairs = [];
                    const cursor = getWeekMonday(new Date(overviewYear, overviewMonth, 1));
                    const monthEndDate = new Date(overviewYear, overviewMonth + 1, 0);
                    while (cursor <= monthEndDate) {
                        const thursday = new Date(cursor);
                        thursday.setDate(thursday.getDate() + 3);
                        if (thursday.getMonth() === overviewMonth && thursday.getFullYear() === overviewYear) {
                            weekPairs.push({ y: getISOYear(cursor), w: getISOWeek(cursor) });
                        }
                        cursor.setDate(cursor.getDate() + 7);
                    }
                    // Groepeer per ISO-jaar · rond de jaarwisseling kunnen dat er 2 zijn
                    const weeksByYear = {};
                    weekPairs.forEach(p => { (weeksByYear[p.y] = weeksByYear[p.y] || []).push(p.w); });
                    for (const isoYear of Object.keys(weeksByYear)) {
                        let expQ = sb.from('expenses').select('amount')
                            .eq('user_id', currentUser.id)
                            .eq('year', parseInt(isoYear))
                            .in('week_number', weeksByYear[isoYear]);
                        if (currentProject) expQ = expQ.eq('project_id', currentProject.id);
                        const { data: expData, error: expErr } = await expQ;
                        if (expErr) {
                            if (!/relation.*expenses.*does not exist/i.test(expErr.message || '')) {
                                console.warn('Maand-declaraties laden mislukt:', expErr.message);
                            }
                            continue;
                        }
                        (expData || []).forEach(r => { totalDeclaraties += parseFloat(r.amount) || 0; });
                    }
                } catch (expEx) {
                    console.warn('Maand-declaraties exception:', expEx);
                }
            }

            const totalMonthExp = totalHotelTotal + totalDeclaraties;
            const grandTotal = totalMonthRevenue + totalKmRevenue + totalMonthExp;

            // Stats grid · verberg alles als er geen uren zijn
            // Layout-strategie:
            //  - canSeeRates=true: uren-highlight neemt volle rij (zodat omzet ernaast in
            //    nieuwe rij past), kilometer + omzet in 2 kolommen, totaal weer volle rij.
            //  - canSeeRates=false: tiles zijn allemaal "informatief" → gewoon 2 kolommen
            //    naast elkaar, geen volle-rij highlight (anders staan vervolg-tiles
            //    asymmetrisch alleen in een halve rij).
            let statsHtml = '';
            if (totalMonthHours === 0) {
                statsHtml = '';
            } else {
                // Tel hoeveel niet-rates tiles er getoond worden · bepaalt of uren
                // volle rij krijgt of in een 2-kolom layout meegaat.
                const showKmTile = hasKm && totalMonthKm > 0;
                const showThuiswerkTile = hasThuiswerk && totalThuiswerkDagen > 0;
                const showHotelTile = hasHotel && totalHotelNights > 0;
                const nonRateTileCount = (showKmTile ? 1 : 0) + (showThuiswerkTile ? 1 : 0) + (showHotelTile ? 1 : 0);

                // Uren-tile: volle rij ALLEEN als (a) gebruiker tarieven mag zien (omzet komt
                // ernaast in nieuwe rij), OF (b) er geen andere tiles zijn om mee te combineren.
                const urenSpansFullRow = canSeeRates || nonRateTileCount === 0;
                statsHtml = `
                <div class="stat-card highlight" ${urenSpansFullRow ? 'style="grid-column:1/-1"' : ''}>
                    <div class="stat-value">${fmt(totalMonthHours)}</div>
                    <div class="stat-label">Uren deze maand</div>
                </div>`;

                if (canSeeRates) {
                    statsHtml += `
                <div class="stat-card" style="background:#059669;color:white">
                    <div class="stat-value" style="color:white">${fmtEuro(totalMonthRevenue)}</div>
                    <div class="stat-label" style="color:rgba(255,255,255,0.7)">Omzet uren</div>
                </div>`;
                }

                if (showKmTile) {
                    statsHtml += `
                <div class="stat-card">
                    <div class="stat-value">${totalMonthKm.toLocaleString('nl-NL')}</div>
                    <div class="stat-label">Kilometers</div>
                </div>`;
                    if (canSeeRates) {
                        statsHtml += `
                <div class="stat-card">
                    <div class="stat-value">${fmtEuro(totalKmRevenue)}</div>
                    <div class="stat-label">Km-vergoeding</div>
                </div>`;
                    }
                }

                if (showThuiswerkTile) {
                    statsHtml += `
                <div class="stat-card">
                    <div class="stat-value">${totalThuiswerkDagen}</div>
                    <div class="stat-label">Thuiswerkdagen</div>
                </div>`;
                }

                if (showHotelTile) {
                    statsHtml += `
                <div class="stat-card">
                    <div class="stat-value">${totalHotelNights}× 🏨</div>
                    <div class="stat-label">Hotelnachten${canSeeRates ? ' (' + fmtEuro(totalHotelTotal) + ')' : ''}</div>
                </div>`;
                }

                if (canSeeRates) {
                    statsHtml += `
                <div class="stat-card" style="background:var(--kts-blue);grid-column:1/-1">
                    <div class="stat-value" style="color:white">${fmtEuro(grandTotal)}</div>
                    <div class="stat-label" style="color:rgba(255,255,255,0.7)">Totaal omzet</div>
                </div>`;
                }
            }

            document.getElementById('overview-stats').innerHTML = statsHtml;

            // Revenue breakdown (alleen zichtbaar als gebruiker tarieven mag zien)
            let revenueHtml = '';
            if (!canSeeRates) {
                // Geen omzet breakdown tonen
            } else if (totalMonthHours > 0) {
                revenueHtml = `
                <div class="summary-title">Omzet breakdown · ${MONTHS_LONG[overviewMonth]}</div>
                <div class="summary-row">
                    <span>Uren (${fmt(totalMonthHours)} u × €${RATE})</span>
                    <span class="summary-value">${fmtEuro(totalMonthRevenue)}</span>
                </div>`;
                if (hasKm && totalMonthKm > 0) {
                    revenueHtml += `
                <div class="summary-row">
                    <span>Km-vergoeding (${totalMonthKm.toLocaleString('nl-NL')} km × ${fmtEuro(KM_RATE)})</span>
                    <span class="summary-value">${fmtEuro(totalKmRevenue)}</span>
                </div>`;
                }
                if (totalMonthExp > 0) {
                    revenueHtml += `
                <div class="summary-row">
                    <span>Declaraties + hotel</span>
                    <span class="summary-value">${fmtEuro(totalMonthExp)}</span>
                </div>`;
                }
                revenueHtml += `
                <div class="summary-row total" style="font-size:1rem">
                    <span>Totale omzet</span>
                    <span class="summary-value">${fmtEuro(grandTotal)}</span>
                </div>`;
            } else {
                revenueHtml = `<div style="text-align:center;color:var(--muted);padding:20px;font-size:0.85rem">Nog geen uren ingevuld voor ${MONTHS_LONG[overviewMonth]} ${overviewYear}</div>`;
            }
            // Verberg de revenue-card volledig (incl. .week-summary border) als er
            // geen content is · anders verschijnt er een lege witte tegel onder de stats.
            const revenueEl = document.getElementById('overview-revenue');
            revenueEl.innerHTML = revenueHtml;
            revenueEl.style.display = revenueHtml ? '' : 'none';

            // Maandtotaal in navigatiebalk
            document.getElementById('month-total').textContent = totalMonthHours > 0
                ? (canSeeRates ? `${fmt(totalMonthHours)} uur · ${fmtEuro(grandTotal)}` : `${fmt(totalMonthHours)} uur`)
                : '';

            // Weeknummer in onderteken/verstuur knoppen
            const signNumEl = document.getElementById('sign-week-num');
            const submitNumEl = document.getElementById('submit-week-num');
            if (signNumEl) signNumEl.textContent = currentWeekNumber;
            if (submitNumEl) submitNumEl.textContent = currentWeekNumber;

            // Haal week statussen op uit database (nodig voor knop-status + weeklijst)
            const weekStatuses = await getMonthWeekStatuses();

            // Knop-status bepalen op basis van week-status
            const weekStatus = getWeekStatus();
            const signBtn = document.getElementById('sign-week-btn');
            const submitBtn2 = document.getElementById('submit-week-btn');
            const actionBtns = document.getElementById('week-action-btns');
            const downloadBtn = document.getElementById('download-weekstaat-btn-wrap');

            // DB-status van de huidige week (ook globale variabele bijwerken)
            const localWeekDbStatus = weekStatuses[currentWeekNumber];
            // Map 'definitief' (synthetisch) terug naar 'verstuurd' voor de globale status —
            // de DB kent alleen 'verstuurd', 'definitief' is alleen voor visuele weergave
            currentWeekDbStatus = (localWeekDbStatus === 'definitief') ? 'verstuurd' : (localWeekDbStatus || null);
            const isOndertekend = localWeekDbStatus === 'ondertekend';
            const isVerstuurd = localWeekDbStatus === 'verstuurd' || localWeekDbStatus === 'definitief';

            // Download-knop alleen tonen bij verstuurd of definitief
            if (downloadBtn) downloadBtn.style.display = isVerstuurd ? 'block' : 'none';

            if (isVerstuurd) {
                // Al verstuurd: verberg onderteken-knop
                if (actionBtns) actionBtns.style.display = 'none';
                if (signBtn) signBtn.style.display = 'none';
            } else if (!localWeekDbStatus || localWeekDbStatus === 'concept') {
                // Nog niet opgeslagen: verberg onderteken-knop
                if (actionBtns) actionBtns.style.display = 'none';
                if (signBtn) signBtn.style.display = 'none';
            } else if (weekStatus.editable) {
                // Week is bewerkbaar · toon onderteken & versturen knop
                if (actionBtns) actionBtns.style.display = 'flex';
                if (signBtn) {
                    signBtn.style.display = 'block';
                    if (isOndertekend) {
                        signBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:8px"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Week ' + currentWeekNumber + ' opnieuw ondertekenen &amp; versturen';
                    } else {
                        signBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:8px"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Week <span id="sign-week-num">' + currentWeekNumber + '</span> ondertekenen &amp; versturen';
                    }
                }
            } else {
                // Niet bewerkbaar: verberg alles
                if (actionBtns) actionBtns.style.display = 'none';
                if (signBtn) signBtn.style.display = 'none';
            }

            // Weken van deze maand ophalen en tonen
            const weekListEl = document.getElementById('week-status-list');
            let weekRows = '';

            // Status-configuratie: label, oude CSS class + Fase 2 pill/row variant
            const STATUS_CONFIG = {
                concept:     { label: 'Concept',     class: 'status-draft',    pill: 'is-idle',  row: 'is-idle' },
                opgeslagen:  { label: 'Opgeslagen',  class: 'status-saved',    pill: 'is-warn',  row: 'is-warn' },
                ondertekend: { label: 'Ondertekend', class: 'status-signed',   pill: 'is-info',  row: 'is-info' },
                verstuurd:   { label: 'Verstuurd',   class: 'status-approved', pill: 'is-ok',    row: 'is-ok' },
                definitief:  { label: 'Definitief',  class: 'status-final',    pill: 'is-final', row: 'is-final' }
            };

            // Check welke weken al op een inkooporder staan
            let inkooporderWeken = new Set();
            if (sb && currentUser && currentProject) {
                const { data: ioWeeks } = await sb.from('inkooporder_weeks').select('week_number')
                    .eq('user_id', currentUser.id)
                    .eq('project_id', currentProject.id)
                    .eq('year', overviewYear);
                if (ioWeeks) ioWeeks.forEach(w => inkooporderWeken.add(w.week_number));
            }

            // Bepaal alle weken die (deels) in deze maand vallen
            const firstDay = new Date(overviewYear, overviewMonth, 1);
            const lastDay = new Date(overviewYear, overviewMonth + 1, 0);
            let weekStart = getWeekMonday(firstDay);

            // Project start/einddatum voor week-filtering
            const projStartDate = currentProject && currentProject.start_date ? currentProject.start_date : null;
            const projEndDate = currentProject && currentProject.end_date ? currentProject.end_date : null;

            while (weekStart <= lastDay) {
                const wn = getISOWeek(weekStart);
                const endD = new Date(weekStart);
                endD.setDate(endD.getDate() + 6);

                // Week overslaan als deze volledig vóór project startdatum valt
                const weekEndStr = toLocalDateStr(endD);
                const weekStartStr = toLocalDateStr(weekStart);
                if (projStartDate && weekEndStr < projStartDate) {
                    weekStart.setDate(weekStart.getDate() + 7);
                    continue;
                }
                // Week overslaan als deze volledig ná project einddatum valt
                if (projEndDate && weekStartStr > projEndDate) {
                    weekStart.setDate(weekStart.getDate() + 7);
                    continue;
                }
                const label = `Week ${wn} (${weekStart.getDate()} ${MONTHS_SHORT[weekStart.getMonth()]} – ${endD.getDate()} ${MONTHS_SHORT[endD.getMonth()]})`;

                // Check of dit de week is waar de gebruiker nu op staat (uren tab)
                const isCurrent = weekStart.getTime() === currentWeekMonday.getTime();

                // Tel uren voor deze week
                const ws = toLocalDateStr(weekStart);
                const we = toLocalDateStr(endD);
                const weekHours = monthEntries
                    .filter(e => e.entry_date >= ws && e.entry_date <= we)
                    .reduce((s, e) => s + (parseFloat(e.total_hours) || 0), 0);

                // Status badge bepalen
                const dbStatus = weekStatuses[wn];
                const cfg = dbStatus && STATUS_CONFIG[dbStatus] ? STATUS_CONFIG[dbStatus] : null;

                // Bereken offset in weken ten opzichte van currentWeekMonday
                const diffDays = Math.round((weekStart.getTime() - currentWeekMonday.getTime()) / (1000*60*60*24));
                const weekOffset = Math.round(diffDays / 7);

                // Row state-class (kleur van linker streep)
                let rowState = '';
                if (isCurrent) rowState = 'is-current';
                else if (cfg) rowState = cfg.row;

                // Status pill
                let pillHtml = '';
                if (cfg) {
                    pillHtml = `<span class="app-pill ${cfg.pill}"><span class="app-pdot"></span>${cfg.label}</span>`;
                } else if (isCurrent) {
                    pillHtml = `<span class="app-pill is-info"><span class="app-pdot"></span>Huidig</span>`;
                }

                // Inkooporder pill
                const ioPill = inkooporderWeken.has(wn)
                    ? `<span class="app-pill is-info" style="margin-left:4px"><span class="app-pdot"></span>Inkooporder</span>`
                    : '';

                // Uren tekst
                const hoursClass = weekHours > 0 ? '' : 'is-empty';
                const hoursText = weekHours > 0 ? `${fmt(weekHours)}<span style="opacity:0.6"> u</span>` : '— u';

                // PDF-knop bij verstuurde of definitieve weken (vervangt chevron)
                const trailingEl = (dbStatus === 'verstuurd' || dbStatus === 'definitief')
                    ? `<button class="app-week-row-pdf" onclick="event.stopPropagation();goToWeekAndDownload(${weekOffset})" type="button" aria-label="Download weekstaat PDF" title="Download PDF"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6"/></svg></button>`
                    : `<span class="app-week-row-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></span>`;

                const rangeText = `${weekStart.getDate()} ${MONTHS_SHORT[weekStart.getMonth()]} – ${endD.getDate()} ${MONTHS_SHORT[endD.getMonth()]}`;

                weekRows += `
                    <button class="app-week-row ${rowState}" type="button" onclick="goToWeek(${weekOffset})">
                        <span class="app-week-row-code">WK ${wn}</span>
                        <span class="app-week-row-range">${rangeText}${ioPill}</span>
                        <span class="app-week-row-hours ${hoursClass}">${hoursText}</span>
                        ${pillHtml}
                        ${trailingEl}
                    </button>`;

                weekStart.setDate(weekStart.getDate() + 7);
            }
            weekListEl.innerHTML = weekRows;

            // Actieknoppen verbergen bij historische weken
            const actionBtnsEnd = document.getElementById('week-action-btns');
            if (actionBtnsEnd && weekSummary) actionBtnsEnd.style.display = 'none';

            // Navigatieknoppen disablen op project start/eind grens + max 2 weken vooruit
            const prevBtn = document.getElementById('month-prev-btn');
            const nextBtn = document.getElementById('month-next-btn');
            if (prevBtn && nextBtn) {
                let canGoPrev = true, canGoNext = true;
                if (currentProject) {
                    if (currentProject.start_date) {
                        const sd = new Date(currentProject.start_date);
                        canGoPrev = !(overviewYear < sd.getFullYear() || (overviewYear === sd.getFullYear() && overviewMonth <= sd.getMonth()));
                    }
                    if (currentProject.end_date) {
                        const ed = new Date(currentProject.end_date);
                        canGoNext = !(overviewYear > ed.getFullYear() || (overviewYear === ed.getFullYear() && overviewMonth >= ed.getMonth()));
                    }
                }
                // Max 2 weken vooruit check (niet voor admins)
                if (!(currentUser && currentUser.role === 'admin')) {
                    const thisMonday = getWeekMonday(new Date());
                    const maxDate = new Date(thisMonday);
                    maxDate.setDate(maxDate.getDate() + 20);
                    const nextMonthFirst = new Date(overviewYear, overviewMonth + 1, 1);
                    if (nextMonthFirst > maxDate) canGoNext = false;
                }

                prevBtn.disabled = !canGoPrev;
                prevBtn.style.opacity = canGoPrev ? '1' : '0.3';
                prevBtn.style.background = canGoPrev ? 'var(--kts-blue)' : '#b0bec5';
                nextBtn.disabled = !canGoNext;
                nextBtn.style.opacity = canGoNext ? '1' : '0.3';
                nextBtn.style.background = canGoNext ? 'var(--kts-blue)' : '#b0bec5';
            }
          } catch (err) {
            console.error('renderOverview fout:', err);
          }
        }

        // Clamp overzichtmaand zodat deze binnen project start/einddatum valt
        function clampOverviewToProject() {
            if (!currentProject) return;
            if (currentProject.start_date) {
                const sd = new Date(currentProject.start_date);
                if (overviewYear < sd.getFullYear() || (overviewYear === sd.getFullYear() && overviewMonth < sd.getMonth())) {
                    overviewMonth = sd.getMonth();
                    overviewYear = sd.getFullYear();
                }
            }
            if (currentProject.end_date) {
                const ed = new Date(currentProject.end_date);
                if (overviewYear > ed.getFullYear() || (overviewYear === ed.getFullYear() && overviewMonth > ed.getMonth())) {
                    overviewMonth = ed.getMonth();
                    overviewYear = ed.getFullYear();
                }
            }
        }

        async function changeMonth(dir) {
            let newMonth = overviewMonth + dir;
            let newYear = overviewYear;
            if (newMonth > 11) { newMonth = 0; newYear++; }
            if (newMonth < 0) { newMonth = 11; newYear--; }

            // Blokkeer navigatie buiten project start/einddatum
            if (currentProject) {
                if (currentProject.start_date) {
                    const sd = new Date(currentProject.start_date);
                    if (newYear < sd.getFullYear() || (newYear === sd.getFullYear() && newMonth < sd.getMonth())) return;
                }
                if (currentProject.end_date) {
                    const ed = new Date(currentProject.end_date);
                    if (newYear > ed.getFullYear() || (newYear === ed.getFullYear() && newMonth > ed.getMonth())) return;
                }
            }
            // Max 2 weken vooruit: blokkeer maand als die volledig na de grens valt (niet voor admins)
            if (!(currentUser && currentUser.role === 'admin')) {
                const thisMonday = getWeekMonday(new Date());
                const maxDate = new Date(thisMonday);
                maxDate.setDate(maxDate.getDate() + 20); // ruime marge voor maandweergave
                const firstOfNewMonth = new Date(newYear, newMonth, 1);
                if (firstOfNewMonth > maxDate) {
                    showToast('🔮 Je kunt maximaal 2 weken vooruit werken');
                    return;
                }
            }

            overviewMonth = newMonth;
            overviewYear = newYear;
            showOverviewLoading();
            await renderOverview();
        }

        async function goToWeek(offset) {
            // Auto-save huidige week
            if (weekDataDirty && getSupabase() && currentUser && currentUser.id) {
                try {
                    await saveWeekToSupabase();
                } catch (e) {
                    showToast('⚠️ Auto-save mislukt · wijzigingen niet opgeslagen');
                    console.error('Auto-save fout bij goToWeek:', e);
                }
            }

            // Navigeer naar de week
            currentWeekMonday.setDate(currentWeekMonday.getDate() + (offset * 7));
            currentWeekNumber = getISOWeek(currentWeekMonday);
            currentYear = getISOYear(currentWeekMonday);
            overviewMonth = currentWeekMonday.getMonth();
            overviewYear = currentWeekMonday.getFullYear();

            weekData = defaultWeekData();
            weekSummary = null;
            signatureData = { zzp: null, client: null }; // Reset handtekening bij weekwissel
            expandedDay = -1;
            markClean();

            updateWeekLabel();

            if (getSupabase() && currentUser && currentUser.id) {
                await loadWeekFromSupabase();
            }

            renderDays();
            renderSummary();
            renderExpenses();
            renderOverview();

            // Schakel naar Uren tab
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            document.getElementById('screen-uren').classList.add('active');
            document.querySelectorAll('.nav-item').forEach((n, i) => {
                n.classList.toggle('active', i === 0);
            });

            showToast(`📅 Week ${currentWeekNumber}`);
        }

        async function goToWeekAndDownload(offset) {
            // Navigeer naar de week en download daarna de PDF
            await goToWeek(offset);
            await downloadWeekstaat();
        }

        // ===== INKOOPORDER (IO) =====
        // KTS bedrijfsgegevens
        const KTS = {
            naam: 'Kuijpers Technical Services BV',
            adres: 'Nieuwboerweg 2A',
            postcode: '1738BB, Waarland',
            land: 'Nederland',
            kvk: '93410557',
            btw: 'NL866385368B01',
            tel: '+31 6 5123 9050',
            email: 'info@kuijpers-ts.nl',
            get betalingstermijn() { return getPaymentTermDays(); }
        };

        let ioEntries = [
        ];

        function renderPOList() {
            const statusColors = {
                concept: { bg:'var(--app-idle-soft)',color:'var(--app-idle)', label: 'Concept' },
                verstuurd: { bg:'var(--app-info-soft)',color:'var(--app-info)', label: 'Verstuurd' },
                goedgekeurd: { bg:'var(--app-ok-soft)',color:'var(--app-ok)', label: 'Goedgekeurd' }
            };

            document.getElementById('io-list').innerHTML = ioEntries.map(io => {
                const total = io.lines.filter(l => l.qty > 0).reduce((s, l) => s + (l.qty * l.rate), 0);
                const st = statusColors[io.status];
                return `
                    <div class="entry-card" style="flex-direction:column;align-items:stretch;cursor:pointer" onclick="showIODetail('${io.id}')">
                        <div style="display:flex;justify-content:space-between;align-items:center">
                            <div>
                                <div style="font-weight:700;font-size:0.95rem">${io.id}</div>
                                <div style="font-size:0.75rem;color:var(--muted);margin-top:2px">${io.period} · ${io.leverancier.naam}, ${io.leverancier.bedrijf}</div>
                                <div style="font-size:0.7rem;color:var(--muted)">${io.project}</div>
                            </div>
                            <div style="text-align:right">
                                <span class="status-badge" style="background:${st.bg};color:${st.color}">${st.label}</span>
                                <div style="font-weight:700;font-size:1rem;color:var(--kts-blue);margin-top:4px">${fmtEuro(total)}</div>
                            </div>
                        </div>
                    </div>`;
            }).join('');
        }

        function showIODetail(ioId) {
            const io = ioEntries.find(p => p.id === ioId);
            if (!io) return;

            const activeLines = io.lines.filter(l => l.qty > 0);
            const total = activeLines.reduce((s, l) => s + (l.qty * l.rate), 0);
            const btw = total * 0.21;

            document.getElementById('io-list').style.display = 'none';
            document.getElementById('io-detail').style.display = 'block';
            document.getElementById('io-detail').innerHTML = `
                <button class="btn btn-secondary btn-sm" onclick="closePODetail()" style="margin-bottom:16px">← Terug naar overzicht</button>

                <div style="background:var(--app-surface);border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,0.08);margin-bottom:16px">
                    <!-- HEADER: KTS + Inkooporder -->
                    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:4px">
                        <div>
                            <div style="font-weight:800;font-size:1rem;color:var(--kts-blue)">${KTS.naam}</div>
                            <div style="font-size:0.75rem;color:var(--muted)">${KTS.adres}</div>
                            <div style="font-size:0.75rem;color:var(--muted)">${KTS.postcode}</div>
                            <div style="font-size:0.75rem;color:var(--muted)">${KTS.land}</div>
                            <div style="font-size:0.7rem;color:var(--muted);margin-top:2px">KVK: ${KTS.kvk} · BTW: ${KTS.btw}</div>
                        </div>
                        <div style="text-align:right">
                            <div style="font-weight:800;font-size:1.1rem;color:var(--kts-blue)">Inkooporder</div>
                        </div>
                    </div>

                    <!-- META: Project, Datum, PO-nummer -->
                    <div style="display:flex;justify-content:flex-end;gap:24px;font-size:0.8rem;margin:12px 0;padding:8px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border)">
                        <div><span style="font-weight:700">PROJECT</span> ${io.projectCode}</div>
                        <div><span style="font-weight:700">DATUM</span> ${io.date}</div>
                        <div><span style="font-weight:700">INKOOPORDER-NR</span> ${io.id}</div>
                    </div>

                    <!-- LEVERANCIER + LEVERADRES -->
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
                        <div>
                            <div style="font-weight:700;font-size:0.75rem;color:white;background:var(--kts-blue);padding:4px 8px;border-radius:4px;margin-bottom:8px">LEVERANCIER (ZZP)</div>
                            <div style="font-size:0.8rem">
                                <div style="font-weight:600">${io.leverancier.naam}</div>
                                <div>${io.leverancier.bedrijf}</div>
                                <div style="color:var(--muted)">${io.leverancier.adres}</div>
                                <div style="color:var(--muted)">${io.leverancier.postcode}</div>
                                <div style="color:var(--muted);margin-top:2px">Tel: ${io.leverancier.tel}</div>
                                <div style="color:var(--muted)">${io.leverancier.email}</div>
                            </div>
                        </div>
                        <div>
                            <div style="font-weight:700;font-size:0.75rem;color:white;background:var(--kts-blue);padding:4px 8px;border-radius:4px;margin-bottom:8px">LEVERADRES</div>
                            <div style="font-size:0.8rem">
                                <div style="font-weight:600">Mark Kuijpers</div>
                                <div>${KTS.naam}</div>
                                <div style="color:var(--muted)">${KTS.adres}</div>
                                <div style="color:var(--muted)">${KTS.postcode}</div>
                                <div style="color:var(--muted);margin-top:2px">Tel: ${KTS.tel}</div>
                                <div style="color:var(--muted)">${KTS.email}</div>
                            </div>
                        </div>
                    </div>

                    <!-- PROJECT INFO -->
                    <div style="font-size:0.8rem;margin-bottom:12px;padding:8px 12px;background:var(--app-bg-tint);border-radius:8px">
                        <span style="font-weight:700">Project:</span> ${io.project}<br>
                        <span style="font-weight:700">Klant:</span> ${io.client} · <span style="font-weight:700">Periode:</span> ${io.period}
                    </div>

                    <!-- ITEMS TABEL -->
                    <table style="width:100%;border-collapse:collapse;font-size:0.78rem">
                        <thead>
                            <tr style="background:var(--kts-blue);color:white">
                                <th style="text-align:left;padding:6px 8px;font-weight:700;width:30px">ITEM #</th>
                                <th style="text-align:left;padding:6px 8px;font-weight:700">OMSCHRIJVING</th>
                                <th style="text-align:right;padding:6px 8px;font-weight:700">AANTAL</th>
                                <th style="text-align:right;padding:6px 8px;font-weight:700">PRIJS/STUK</th>
                                <th style="text-align:right;padding:6px 8px;font-weight:700">TOTAAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${io.lines.map(l => `
                                <tr style="border-bottom:1px solid var(--border)${l.qty === 0 ? ';color:var(--muted)' : ''}">
                                    <td style="padding:6px 8px">${l.nr}</td>
                                    <td style="padding:6px 8px">${l.desc}</td>
                                    <td style="text-align:right;padding:6px 8px">${l.qty} ${l.unit}</td>
                                    <td style="text-align:right;padding:6px 8px">${fmtEuro(l.rate)}</td>
                                    <td style="text-align:right;padding:6px 8px;font-weight:600">${fmtEuro(l.qty * l.rate)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>

                    <!-- TOTALEN -->
                    <div style="margin-top:8px;border-top:2px solid var(--kts-blue)">
                        <div style="display:flex;justify-content:space-between;font-size:0.85rem;padding:6px 0">
                            <span style="font-weight:600">TOTAAL</span>
                            <span style="font-weight:600">${fmtEuro(total)}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;font-size:0.85rem;padding:4px 0;color:var(--muted)">
                            <span>BTW 21%</span>
                            <span>${fmtEuro(btw)}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;font-size:0.85rem;padding:4px 0;color:var(--muted)">
                            <span>TRANSPORT</span>
                            <span>${fmtEuro(0)}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;font-size:1rem;padding:8px;font-weight:800;color:white;background:var(--kts-blue);border-radius:6px;margin-top:4px">
                            <span>TOTAAL</span>
                            <span>${fmtEuro(total + btw)}</span>
                        </div>
                    </div>

                    <!-- OPMERKINGEN + BETALINGSTERMIJN -->
                    <div style="margin-top:12px;font-size:0.8rem">
                        <div style="color:var(--muted);margin-bottom:4px"><strong>Opmerkingen:</strong> ${io.opmerkingen || '-'}</div>
                        <div style="color:var(--muted)"><strong>Betalingstermijn:</strong> ${KTS.betalingstermijn} dagen na levering</div>
                    </div>
                </div>

                <div style="display:flex;gap:10px">
                    <button class="btn btn-primary" style="flex:1" onclick="showToast('PDF export · komt in volgende versie')">📄 Download PDF</button>
                    <button class="btn btn-success" style="flex:1" onclick="showToast('E-mail verstuurd naar ZZP\'er')">📧 Verstuur naar ZZP'er</button>
                </div>
            `;
        }

        function closePODetail() {
            document.getElementById('io-list').style.display = 'block';
            document.getElementById('io-detail').style.display = 'none';
        }

        function generateIO() {
            showToast('Inkooporder genereren op basis van goedgekeurde uren · komt in volgende versie');
        }

        // ===== AUTO-PROVISIONING =====
        async function getOrCreateUserProfile(userId, email) {
            const sb = getSupabase();
            // Probeer bestaand profiel op te halen
            const { data: profile } = await sb.from('users').select('*').eq('id', userId).single();
            if (profile) {
                // Update laatste login tijdstip
                sb.from('users').update({ last_active_at: new Date().toISOString() }).eq('id', userId)
                    .then(({ error }) => { if (error) console.warn('last_active_at update mislukt:', error.message); });
                // Als de gebruiker via een eigen BV werkt (zzp/eenmanszaak), haal de bedrijfs-
                // naam op zodat hij op de weekstaat als "BV | Naam" getoond kan worden.
                if (profile.company_id) {
                    try {
                        const { data: zzpComp } = await sb.from('companies').select('name').eq('id', profile.company_id).maybeSingle();
                        if (zzpComp && zzpComp.name) profile._zzpCompanyName = zzpComp.name;
                    } catch (e) { /* niet kritisch */ }
                }
                return profile;
            }

            // Profiel bestaat niet · maak het automatisch aan
            console.log('Auto-provisioning nieuw gebruikersprofiel voor', email);
            const name = email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            const newUser = {
                id: userId,
                email: email,
                name: name,
                role: 'engineer',
                allow_km: false,
                allow_thuiswerk: false,
                allow_hotel: false,
                show_rates: false,
                can_declare_expenses: false,
            };
            const { data: created, error } = await sb.from('users').insert(newUser).select().single();
            if (error) {
                console.error('Auto-provisioning mislukt:', error);
                return { ...newUser }; // fallback met lokale data
            }
            showToast('🆕 Profiel automatisch aangemaakt · admin kan je instellingen aanpassen');
            return created;
        }

        // ===== AUTH =====
        // Geeft een blokkade-reden terug als de user niet mag inloggen,
        // anders null. Wordt gebruikt na elke sign-in (initieel + auto-restore).
        function getLoginBlockReason(user) {
            if (!user) return null;
            if (user.archived_at) {
                const datum = new Date(user.archived_at).toLocaleDateString('nl-NL');
                return `🔒 Dit account is afgesloten (${datum}).<br>Neem contact op met de beheerder.`;
            }
            if (user.paused_at) {
                const datum = new Date(user.paused_at).toLocaleDateString('nl-NL');
                const reden = user.pause_reason ? ` ·${escapeHtml(user.pause_reason)}` : '';
                return `⏸️ Dit account is gepauzeerd sinds ${datum}.${reden}<br>Neem contact op met de beheerder.`;
            }
            return null;
        }

        async function forgotPassword() {
            const email = document.getElementById('login-email').value.trim();
            if (!email) {
                showToast('⚠️ Vul eerst je e-mailadres in');
                document.getElementById('login-email').focus();
                return;
            }
            const sb = getSupabase();
            if (!sb) return;
            try {
                const { error } = await sb.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin + '/index.html'
                });
                if (error) throw error;
                // Toon duidelijke melding in het loginscherm
                const errorEl = document.getElementById('login-error');
                if (errorEl) {
                    errorEl.style.display = 'block';
                    errorEl.style.background = 'var(--app-ok-soft)';
                    errorEl.style.color = '#065f46';
                    errorEl.style.border = '1px solid #a7f3d0';
                    errorEl.style.padding = '10px 14px';
                    errorEl.style.borderRadius = '8px';
                    errorEl.style.fontSize = '0.85rem';
                    errorEl.innerHTML = '📧 Er is een e-mail verstuurd naar <b>' + email + '</b> met een link om je wachtwoord te resetten.<br>Check ook je spam folder.';
                }
                showToast('✓ Herstel-mail verstuurd');
            } catch(e) {
                const errorEl = document.getElementById('login-error');
                if (errorEl) {
                    errorEl.style.display = 'block';
                    errorEl.style.background = 'var(--app-alert-soft)';
                    errorEl.style.color = '#991b1b';
                    errorEl.style.border = '1px solid #fecaca';
                    errorEl.style.padding = '10px 14px';
                    errorEl.style.borderRadius = '8px';
                    errorEl.style.fontSize = '0.85rem';
                    errorEl.textContent = '❌ Kon geen herstel-mail versturen: ' + (e.message || 'Onbekende fout');
                }
                showToast('❌ ' + (e.message || 'Fout bij versturen'));
            }
        }

        async function doLogin() {
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            const errorEl = document.getElementById('login-error');
            const btn = document.getElementById('login-btn');

            if (!email || !password) { errorEl.textContent = 'Vul e-mail en wachtwoord in'; errorEl.style.display = 'block'; return; }

            btn.textContent = 'Bezig met inloggen...';
            btn.disabled = true;

            if (!getSupabase()) {
                // Wacht en probeer opnieuw (CDN kan nog laden)
                errorEl.textContent = 'Verbinding maken met server...';
                errorEl.style.display = 'block';
                errorEl.style.color = 'var(--muted)';
                for (let wait = 0; wait < 5; wait++) {
                    await new Promise(r => setTimeout(r, 1000));
                    if (getSupabase()) break;
                }
                if (!getSupabase()) {
                    errorEl.textContent = 'Kan niet verbinden. Check je internet en herlaad de pagina.';
                    errorEl.style.color = '#ef4444';
                    btn.textContent = 'Inloggen';
                    btn.disabled = false;
                    return;
                }
                errorEl.style.display = 'none';
            }

            const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
            if (error) {
                errorEl.textContent = 'Inloggen mislukt: ' + error.message;
                errorEl.style.display = 'block';
                btn.textContent = 'Inloggen';
                btn.disabled = false;
                document.getElementById('login-password').value = '';
                document.getElementById('login-password').focus();
                return;
            }

            // Haal user profiel op (auto-provisioning als het nog niet bestaat)
            currentUser = await getOrCreateUserProfile(data.user.id, data.user.email);

            // Login-blokkering: gepauzeerd of afgesloten? Niet toegestaan.
            const blockReason = getLoginBlockReason(currentUser);
            if (blockReason) {
                await getSupabase().auth.signOut();
                currentUser = null;
                errorEl.innerHTML = blockReason;
                errorEl.style.display = 'block';
                btn.textContent = 'Inloggen';
                btn.disabled = false;
                return;
            }

            document.getElementById('login-overlay').style.display = 'none';
            document.getElementById('user-badge-name').innerHTML = formatBadgeName(currentUser.name);

            // Laad data vanuit Supabase
            await loadDataFromSupabase();
            startSessionMonitor();
            initDelegateBar();
            logAudit('ingelogd', { device: /Mobi/i.test(navigator.userAgent) ? 'mobiel' : 'desktop' });
            updateClockUI();
            checkWeekReminder();
            checkForcePasswordChange();

            // Eerste keer? Toon welkomst (of admin heeft reset aangevraagd)
            const firstLoginKey = 'kts-welcomed-' + currentUser.id;
            let showWelcome = !localStorage.getItem(firstLoginKey);
            // Check of admin een reset heeft aangevraagd via DB
            if (!showWelcome && currentUser.reset_welcome) {
                showWelcome = true;
                localStorage.removeItem(firstLoginKey);
                // Reset de DB flag
                getSupabase().from('users').update({ reset_welcome: false }).eq('id', currentUser.id).then(() => {});
            }
            if (showWelcome) {
                localStorage.setItem(firstLoginKey, '1');
                showWelcomeGuide();
            } else {
                showToast('✓ Welkom, ' + currentUser.name);
            }

            // Open het scherm dat hoort bij de gekozen app op het login-scherm
            try {
                const loginApp = getLoginAppPref();
                if (loginApp === 'inspectie' && typeof switchScreen === 'function') {
                    switchScreen('inspecties');
                }
            } catch (e) { /* niet kritisch · uren-tab blijft default */ }
        }

        function demoLogin() {
            currentUser = { name: 'Demo Gebruiker', role: 'engineer' };
            document.getElementById('login-overlay').style.display = 'none';
            document.getElementById('user-badge-name').innerHTML = '👤 Demo';
            showToast('✓ Demo modus · data wordt niet opgeslagen');
        }

        function toggleUserMenu() {
            const menu = document.getElementById('user-menu');
            const isOpen = menu.style.display !== 'none';
            menu.style.display = isOpen ? 'none' : 'block';
            if (!isOpen) {
                document.getElementById('user-menu-name').textContent = currentUser ? currentUser.name : '';
                // Zoom knoppen bijwerken
                const savedZoom = localStorage.getItem('kts-zoom') || 'normaal';
                setZoom(savedZoom);
                // Toon admin-knop alleen voor admins
                const adminItem = document.getElementById('admin-menu-item');
                const isAdmin = currentUser && currentUser.role === 'admin';
                if (adminItem) adminItem.style.display = isAdmin ? 'flex' : 'none';
                // Maandfactuur tijdelijk verborgen
                // const adminInv = document.getElementById('admin-invoice-section');
                // if (adminInv) adminInv.style.display = isAdmin ? 'block' : 'none';
                // Sluit menu bij klik ergens anders
                setTimeout(() => {
                    document.addEventListener('click', function closeMenu(e) {
                        if (!e.target.closest('.user-badge')) {
                            menu.style.display = 'none';
                            document.removeEventListener('click', closeMenu);
                        }
                    });
                }, 10);
            }
        }

        function openChangePassword() {
            document.getElementById('user-menu').style.display = 'none';
            const modal = document.getElementById('admin-modal');
            document.getElementById('admin-modal-title').textContent = 'Wachtwoord wijzigen';
            document.getElementById('admin-modal-fields').innerHTML = `
                <div class="form-group" style="margin-bottom:12px"><label>Nieuw wachtwoord</label><input type="password" id="pw-new" placeholder="Minimaal 8 tekens" style="font-size:0.95rem"></div>
                <div class="form-group" style="margin-bottom:12px"><label>Bevestig nieuw wachtwoord</label><input type="password" id="pw-confirm" placeholder="Herhaal wachtwoord" style="font-size:0.95rem"></div>
            `;
            const saveBtn = document.getElementById('admin-modal-save');
            saveBtn.style.display = '';
            saveBtn.textContent = 'Wachtwoord wijzigen';
            saveBtn.onclick = async () => {
                const pw = document.getElementById('pw-new').value;
                const confirm = document.getElementById('pw-confirm').value;
                if (!pw || pw.length < 8) { showToast('⚠️ Wachtwoord moet minimaal 8 tekens zijn'); return; }
                if (pw !== confirm) { showToast('⚠️ Wachtwoorden komen niet overeen'); return; }
                const sb = getSupabase();
                if (!sb) return;
                // Ververs sessie eerst (voorkomt "Auth session missing")
                try { await sb.auth.refreshSession(); } catch(e) { console.warn('Session refresh:', e); }
                const { data: sessionCheck } = await sb.auth.getSession();
                if (!sessionCheck?.session) {
                    showToast('⚠️ Sessie verlopen · log opnieuw in');
                    return;
                }
                const { error } = await sb.auth.updateUser({ password: pw });
                if (error) { showToast('❌ ' + error.message); return; }
                // Markeer dat wachtwoord is gewijzigd
                if (currentUser) {
                    await sb.from('users').update({ password_changed: true }).eq('id', currentUser.id);
                    currentUser.password_changed = true;
                }
                showToast('✓ Wachtwoord gewijzigd');
                modal.classList.remove('active');
                saveBtn.textContent = 'Opslaan';
            };
            const delBtn = document.getElementById('admin-modal-delete');
            if (delBtn) delBtn.style.display = 'none';
            modal.classList.add('active');
        }

        function checkForcePasswordChange() {
            // Admins krijgen geen herinnering · zij beheren hun eigen wachtwoord
            if (currentUser && currentUser.role === 'admin') return;
            if (currentUser && currentUser.password_changed !== true) {
                showToast('🔑 Wijzig je standaard wachtwoord');
                setTimeout(() => openChangePassword(), 500);
            }
        }

        async function doLogout() {
            if (getSupabase()) {
                await getSupabase().auth.signOut();
            }
            currentUser = null;
            currentProject = null;
            weekData = defaultWeekData();
            markClean();
            // Reset admin DB connection so next user gets their own DB
            if (_adminDB) { _adminDB.close(); _adminDB = null; _adminDBName = null; }
            _adminInvoicesCache = [];
            _adminFolderHandles = { invoices: null, export: null, transactions: null };
            document.getElementById('login-overlay').style.display = 'flex';
            document.getElementById('user-menu').style.display = 'none';
            document.getElementById('login-email').value = '';
            document.getElementById('login-password').value = '';
            document.getElementById('login-error').style.display = 'none';
            const loginBtn = document.getElementById('login-btn');
            loginBtn.textContent = 'Inloggen';
            loginBtn.disabled = false;
            renderDays();
            showToast('✓ Uitgelogd');
        }

        // Auto-goedkeuring weekstaten na 3 werkdagen zonder reactie
        async function autoApproveExpiredWeekstaten() {
            const sb = getSupabase();
            if (!sb || !currentUser || currentUser.role !== 'admin') return;
            try {
                const { data: pending } = await sb.from('week_status')
                    .select('*')
                    .eq('approval_status', 'ter_goedkeuring')
                    .not('approval_requested_at', 'is', null);
                if (!pending || pending.length === 0) return;

                // Bereken 3 werkdagen geleden
                function subtractBusinessDays(date, days) {
                    let d = new Date(date);
                    let count = 0;
                    while (count < days) {
                        d.setDate(d.getDate() - 1);
                        const dow = d.getDay();
                        if (dow !== 0 && dow !== 6) count++;
                    }
                    return d;
                }
                const cutoff = subtractBusinessDays(new Date(), 3);
                const expired = pending.filter(ws => new Date(ws.approval_requested_at) < cutoff);
                if (expired.length === 0) return;

                // Auto-goedkeuren · kolomnamen moeten matchen met de rest van de
                // approval-flow: approval_completed_at + approver_name (approved_at
                // en approved_by bestaan niet · de update faalde daardoor stil)
                for (const ws of expired) {
                    await sb.from('week_status').update({
                        approval_status: 'goedgekeurd',
                        approval_completed_at: new Date().toISOString(),
                        approver_name: 'Auto-goedgekeurd (geen reactie binnen 3 werkdagen)'
                    }).eq('user_id', ws.user_id)
                      .eq('project_id', ws.project_id)
                      .eq('week_number', ws.week_number)
                      .eq('year', ws.year);
                }
                showToast(`✅ ${expired.length} weeksta${expired.length === 1 ? 'at' : 'ten'} automatisch goedgekeurd (geen reactie binnen 3 werkdagen)`);
            } catch (err) {
                console.error('Auto-goedkeuring fout:', err);
            }
        }

        // Check bestaande sessie
        async function checkSession() {
            if (!getSupabase()) return;
            try {
                const { data: { session } } = await getSupabase().auth.getSession();
                if (session) {
                    // Auto-provisioning als profiel nog niet bestaat
                    currentUser = await getOrCreateUserProfile(session.user.id, session.user.email);
                    // Auto-restore: blokkeer als account gepauzeerd of afgesloten
                    const blockReason = getLoginBlockReason(currentUser);
                    if (blockReason) {
                        await getSupabase().auth.signOut();
                        currentUser = null;
                        const errorEl = document.getElementById('login-error');
                        if (errorEl) { errorEl.innerHTML = blockReason; errorEl.style.display = 'block'; }
                        return;
                    }
                    document.getElementById('login-overlay').style.display = 'none';
                    document.getElementById('user-badge-name').innerHTML = formatBadgeName(currentUser.name);
                    await loadDataFromSupabase();
                    startSessionMonitor();
                    initDelegateBar();
                    autoApproveExpiredWeekstaten();
                }
            } catch (err) {
                console.error('checkSession fout:', err);
            }
        }

        // ===== WELKOMSTGIDS =====
        function showWelcomeGuide() {
            const name = currentUser ? currentUser.name.split(' ')[0] : '';

            const steps = [
                { icon: '👋', title: 'Welkom' + (name ? ', ' + name : '') + '!', text: 'Dit is de KTS Uren & Inspecties App. Hier registreer je je werkuren, kilometers, onkosten en inspecties.' },
                { icon: '📅', title: 'Week invullen', text: 'Klik op een dag om je start- en eindtijd, pauze en werkbeschrijving in te vullen.' },
                { icon: '🕐', title: 'Standaard werkweek', text: 'Klik rechtsboven op je naam → Mijn werkweek om je standaard tijden in te stellen. Nieuwe weken worden dan automatisch voorgevuld.' },
                { icon: '💾', title: 'Opslaan & versturen', text: 'Sla je week op, onderteken hem en verstuur de PDF naar KTS.' },
            ];

            // Verberg de hele app (header, content, bottom nav)
            document.querySelector('.header').style.display = 'none';
            document.querySelector('.app-content').style.display = 'none';
            document.querySelector('.bottom-nav').style.display = 'none';

            // Maak fullscreen welkomst-overlay met hero-stijl (gradient + grid)
            const overlay = document.createElement('div');
            overlay.id = 'welcome-overlay';
            overlay.className = 'kts-hero-bg';
            overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;overflow-y:auto';
            overlay.innerHTML = `
                <div style="max-width:460px;width:100%;position:relative;z-index:1">
                    <div class="kts-eyebrow" style="display:block;width:100%;color:rgba(255,255,255,0.7);margin-bottom:6px;text-align:center">KTS UREN &amp; INSPECTIES APP</div>
                    <div class="kts-hero-title" style="color:white;text-align:center;margin-bottom:24px;font-size:1.8rem">Welkom<span class="accent" style="color:var(--kts-accent-light)">${name ? ', ' + name : ''}</span></div>
                    ${steps.map(s => `
                        <div style="display:flex;gap:14px;padding:16px;margin-bottom:10px;background:rgba(255,255,255,0.06);border-radius:12px;border:1px solid rgba(255,255,255,0.1);backdrop-filter:blur(8px);position:relative;overflow:hidden">
                            <div style="position:absolute;top:0;left:0;width:2px;height:100%;background:var(--kts-accent-light)"></div>
                            <div style="font-size:1.6rem;flex-shrink:0">${s.icon}</div>
                            <div>
                                <div style="font-weight:700;font-size:0.95rem;color:var(--kts-accent-light);margin-bottom:3px;letter-spacing:-0.005em">${s.title}</div>
                                <div style="font-size:0.84rem;color:rgba(255,255,255,0.85);line-height:1.5">${s.text}</div>
                            </div>
                        </div>
                    `).join('')}
                    <button class="kts-btn" onclick="dismissWelcomeGuide()" style="margin-top:18px;width:100%;justify-content:center;padding:14px">
                        ✓ Begrepen, aan de slag!
                    </button>
                </div>`;

            document.body.appendChild(overlay);
        }

        function dismissWelcomeGuide() {
            const overlay = document.getElementById('welcome-overlay');
            if (overlay) overlay.remove();

            // Toon de app weer
            document.querySelector('.header').style.display = '';
            document.querySelector('.app-content').style.display = '';
            document.querySelector('.bottom-nav').style.display = '';

            renderDays();
            updateClockUI();
        }

        // ===== SESSIE-TIMEOUT MONITOR =====
        let sessionMonitorInterval = null;

        function startSessionMonitor() {
            if (sessionMonitorInterval) return;
            // Luister naar auth state changes (sign-out, token refresh fail)
            if (getSupabase()) {
                getSupabase().auth.onAuthStateChange((event, session) => {
                    if (event === 'SIGNED_OUT' && currentUser) {
                        handleSessionExpired();
                    }
                    if (event === 'TOKEN_REFRESHED') {
                        console.log('Sessie vernieuwd');
                    }
                });
            }
            // Periodieke check elke 5 minuten
            sessionMonitorInterval = setInterval(async () => {
                if (!getSupabase() || !currentUser) return;
                try {
                    const { data: { session } } = await getSupabase().auth.getSession();
                    if (!session) {
                        handleSessionExpired();
                    }
                } catch (err) {
                    console.warn('Sessie-check mislukt:', err);
                }
            }, 5 * 60 * 1000);
        }

        function handleSessionExpired() {
            clearInterval(sessionMonitorInterval);
            sessionMonitorInterval = null;
            if (weekDataDirty) {
                showToast('⚠️ Je sessie is verlopen · sla je werk lokaal op of log opnieuw in');
                // Toon persistent waarschuwing bovenaan
                const warning = document.createElement('div');
                warning.id = 'session-expired-bar';
                warning.innerHTML = '⚠️ Sessie verlopen ·<a href="#" onclick="location.reload();return false" style="color:white;font-weight:700;text-decoration:underline">opnieuw inloggen</a>';
                warning.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#ef4444;color:white;text-align:center;padding:10px;font-size:0.85rem;z-index:10000';
                if (!document.getElementById('session-expired-bar')) document.body.prepend(warning);
            } else {
                showToast('Sessie verlopen · je wordt uitgelogd');
                setTimeout(() => location.reload(), 2000);
            }
        }

        // ===== DATA OPSLAAN NAAR SUPABASE =====
        // Werk last_modified_at + last_modified_by bij op week_status zodat de admin
        // in de weekstaten-lijst kan zien wanneer en door wie de week als laatste is
        // aangepast. Wordt aangeroepen vanuit zowel de zzp-save-flow als de admin-flow.
        async function touchWeekstaatModified(sb, userId, projectId, weekNumber, year, modifiedBy) {
            if (!sb || !userId || !projectId || !weekNumber || !year) return;
            try {
                // UPDATE-only · geen row nodig om aan te maken vanuit deze helper.
                // (Status-aanmaken gebeurt elders; deze helper raakt alleen de
                // last_modified velden aan.)
                const { error: updErr, data: updData } = await sb.from('week_status')
                    .update({
                        last_modified_at: new Date().toISOString(),
                        last_modified_by: modifiedBy || null
                    })
                    .eq('user_id', userId)
                    .eq('project_id', projectId)
                    .eq('week_number', weekNumber)
                    .eq('year', year)
                    .select('id');
                if (updErr) {
                    // Schema cache niet ge-reload? Specifieke melding voor deze case
                    if (/schema cache|column.*last_modified/i.test(updErr.message || '')) {
                        console.warn('⚠️ touchWeekstaatModified: PostgREST schema cache kent de kolom nog niet. Wacht 10 sec of run NOTIFY pgrst, \'reload schema\' in Supabase SQL editor.');
                    } else {
                        console.warn('touchWeekstaatModified faalde:', updErr.message);
                    }
                    return;
                }
                if (!updData || updData.length === 0) {
                    console.warn('touchWeekstaatModified: geen week_status rij gevonden voor', { userId, projectId, weekNumber, year });
                }
            } catch (e) { console.warn('touchWeekstaatModified exception:', e.message || e); }
        }

        // Vast opvang-project voor gebruikers zonder projecttoewijzing. Uren komen
        // hieronder terecht (PDF toont dan "Nog toe te wijzen" i.p.v. een verkeerd
        // project) totdat de admin ze via 🔀 in Beheer > Weekstaten naar het echte
        // project verplaatst. Aanmaken kan alleen als admin (RLS) · zzp'ers doen
        // alleen de select.
        const PLACEHOLDER_PROJECT_CODE = 'KTS0000_00';
        async function getPlaceholderProject(sb) {
            try {
                const { data: existing } = await sb.from('projects').select('*')
                    .eq('project_code', PLACEHOLDER_PROJECT_CODE).maybeSingle();
                if (existing) return existing;
                // Bestaat nog niet: alleen een admin mag projecten aanmaken
                const { data: created, error } = await sb.from('projects').insert({
                    project_code: PLACEHOLDER_PROJECT_CODE,
                    name: 'Nog toe te wijzen',
                    client_name: '',
                    location: '',
                    status: 'active'
                }).select().single();
                if (error) {
                    console.warn('Placeholder-project niet beschikbaar:', error.message);
                    return null;
                }
                return created;
            } catch (e) {
                console.warn('Placeholder-project ophalen mislukt:', e.message || e);
                return null;
            }
        }

        async function saveWeekToSupabase(options) {
            options = options || {};
            // forceAllDays = bij ondertekenen-en-versturen: bevestig alle 7 dagen
            // (anders incremental: alleen schrijf dagen die afwijken van weekDataLoaded)
            const forceAllDays = !!options.forceAllDays;

            if (weekSummary) return false; // historische data: niet overschrijven
            if (!getSupabase() || !currentUser || !currentUser.id) return false;
            const sb = getSupabase();

            try {
                // Geen project toegewezen? Sla op onder het placeholder-project.
                // VOORHEEN werd hier het eerste willekeurige project uit de DB
                // gepakt (limit 1), waardoor uren onder andermans project met
                // verkeerde opdrachtgever op de PDF belandden.
                if (!currentProject) {
                    currentProject = await getPlaceholderProject(sb);
                    if (!currentProject) {
                        showToast('⚠️ Je bent nog niet aan een project gekoppeld · vraag de beheerder om je toe te wijzen');
                        return false;
                    }
                    showToast('⚠️ Nog geen project toegewezen · uren opgeslagen onder "Nog toe te wijzen"');
                    const pn = document.querySelector('.project-name');
                    const pm = document.querySelector('.project-meta');
                    if (pn) pn.textContent = currentProject.name;
                    if (pm) pm.textContent = currentProject.project_code;
                }

                let saveErrors = 0;

                // Helper: bepaal of een dag inhoudelijk anders is dan de baseline
                const dayChanged = (curr, prev) => {
                    if (!prev) return true; // geen baseline · schrijven (eerste keer)
                    const norm = (v) => v == null ? '' : String(v);
                    return norm(curr.start)       !== norm(prev.start)
                        || norm(curr.end)         !== norm(prev.end)
                        || (curr.breakMin || 0)   !== (prev.breakMin || 0)
                        || (curr.hours    || 0)   !== (prev.hours    || 0)
                        || norm(curr.desc)        !== norm(prev.desc)
                        || norm(curr.location)    !== norm(prev.location)
                        || (curr.km       || 0)   !== (prev.km       || 0)
                        || !!curr.hotel           !== !!prev.hotel
                        || !!curr.thuiswerk       !== !!prev.thuiswerk
                        || !!curr.dayOff          !== !!prev.dayOff;
                };

                // Uren opslaan per dag
                for (let i = 0; i < weekData.length; i++) {
                    const d = weekData[i];
                    const entryDate = getDateForDayIndex(i);

                    // Skip dagen die NIET gewijzigd zijn t.o.v. de laatst-geladen baseline.
                    // Dit voorkomt dat default-waarden over admin's reeds-ingevoerde data
                    // worden geschreven wanneer Bart inlogt zonder iets aan te raken.
                    // Bij forceAllDays (= bij ondertekenen) wordt alles geschreven.
                    if (!forceAllDays && weekDataLoaded) {
                        const prev = weekDataLoaded[i];
                        if (!dayChanged(d, prev)) continue;
                    }

                    // Check of er al een entry bestaat voor deze datum + project
                    let existQuery = sb
                        .from('time_entries')
                        .select('id')
                        .eq('user_id', currentUser.id)
                        .eq('entry_date', entryDate);
                    if (currentProject) existQuery = existQuery.eq('project_id', currentProject.id);
                    const { data: existing } = await existQuery.maybeSingle();

                    if (d.hours <= 0 && !d.thuiswerk && !d.dayOff) {
                        // Geen data voor deze dag · verwijder bestaande entry als die er is
                        if (existing) {
                            await sb.from('time_entries').delete().eq('id', existing.id);
                        }
                        continue;
                    }

                    const entry = {
                        user_id: currentUser.id,
                        project_id: currentProject.id,
                        entry_date: entryDate,
                        start_time: d.start || null,
                        end_time: d.end || null,
                        break_minutes: d.breakMin || 0,
                        total_hours: d.hours,
                        description: d.desc || '',
                        location: d.location || '',
                        km: d.km || 0,
                        km_heen: d.kmHeen || 0,
                        km_terug: d.kmTerug || 0,
                        hotel: d.hotel || false,
                        thuiswerk: d.thuiswerk || false,
                        day_off: d.dayOff || false,
                        status: 'draft'
                    };

                    if (existing) {
                        const { error } = await sb.from('time_entries').update(entry).eq('id', existing.id);
                        if (error) { console.error('time_entries update error dag ' + i + ':', error.message); saveErrors++; }
                    } else {
                        const { error } = await sb.from('time_entries').insert(entry);
                        if (error) { console.error('time_entries insert error dag ' + i + ':', error.message); saveErrors++; }
                    }
                }

                if (saveErrors > 0) {
                    showToast('⚠️ ' + saveErrors + ' dag(en) niet opgeslagen · probeer opnieuw');
                    return false;
                }
                // Mark week als laatst-aangepast · voor admin-zichtbaarheid
                await touchWeekstaatModified(sb, currentUser.id, currentProject.id,
                    currentWeekNumber, currentYear, currentUser.id);
                // Edge case: ZZP'er past uren aan ná al ondertekend te hebben (bv. via
                // terug-navigatie). Reset de weekstaat dan naar concept zodat de oude
                // PDF/handtekening niet onsync raakt. No-op als nog niet ondertekend.
                const wasInvalidated = await invalidateApprovalOnChange(currentUser.id, currentProject.id,
                    currentWeekNumber, currentYear);
                if (wasInvalidated) {
                    showToast('⚠️ Uren gewijzigd na ondertekening · weekstaat staat weer in concept');
                }
                return true;
            } catch (err) {
                console.error('saveWeekToSupabase fout:', err);
                showToast('⚠️ Opslaan mislukt · controleer je internetverbinding');
                return false;
            }
        }

        // ===== TARIEVEN LADEN VOOR HUIDIG PROJECT =====
        async function loadProjectRates() {
            if (!getSupabase() || !currentProject) return;
            const sb = getSupabase();

            try {
                const today = new Date().toISOString().slice(0, 10);

                // Niet-admin gebruikers laden via rates_public view (zonder hourly_rate_sale).
                // Admins laden via rates-tabel zelf voor volledige toegang.
                const isAdmin = currentUser && currentUser.role === 'admin';
                const sourceTable = isAdmin ? 'rates' : 'rates_public';

                // Probeer eerst user-specifiek tarief te laden
                let foundRate = null;
                if (currentUser && currentUser.id) {
                    const { data: userRates } = await sb
                        .from(sourceTable)
                        .select('*')
                        .eq('project_id', currentProject.id)
                        .eq('user_id', currentUser.id)
                        .lte('valid_from', today)
                        .order('valid_from', { ascending: false })
                        .limit(1);
                    if (userRates && userRates.length > 0) foundRate = userRates[0];
                }

                // Fallback: project-breed tarief (user_id is null)
                if (!foundRate) {
                    const { data: projRates } = await sb
                        .from(sourceTable)
                        .select('*')
                        .eq('project_id', currentProject.id)
                        .is('user_id', null)
                        .lte('valid_from', today)
                        .order('valid_from', { ascending: false })
                        .limit(1);
                    if (projRates && projRates.length > 0) foundRate = projRates[0];
                }

                if (foundRate) {
                    currentRates = foundRate;
                    RATE = parseFloat(currentRates.hourly_rate) || 85;
                    KM_RATE = parseFloat(currentRates.km_rate) || 0.50;
                    SAT_MULTIPLIER = parseFloat(currentRates.saturday_multiplier) || 1.50;
                    SUN_MULTIPLIER = parseFloat(currentRates.sunday_holiday_multiplier) || 2.00;
                    const who = currentRates.user_id ? 'user-specifiek' : 'project-breed';
                    const fn = currentRates.function_title ? ` (${currentRates.function_title})` : '';
                    console.log(`Tarieven geladen (${who}${fn}): €${RATE}/u, €${KM_RATE}/km, Za×${SAT_MULTIPLIER}, Zo×${SUN_MULTIPLIER}`);
                } else {
                    console.log('Geen tarieven gevonden voor project, defaults gebruikt');
                }
            } catch (err) {
                console.error('loadProjectRates fout:', err);
                showToast('⚠️ Tarieven laden mislukt · standaardtarieven worden gebruikt');
            }
        }

        // ===== LADEN UIT SUPABASE =====
        // ===== GEMACHTIGDEN · uren invullen namens een collega =====
        // Wie voor wie mag invullen staat in fill_delegates (beheer: admin >
        // gebruiker bewerken). De gemachtigde krijgt op de Uren-tab een
        // keuzemenu; bij wisselen wordt currentUser tijdelijk vervangen door
        // het profiel van de collega (auth blijft de eigen login · RLS-policies
        // met is_delegate_for staan de schrijfacties toe).
        let _realUser = null;      // eigen profiel zolang we "namens" invullen
        let _delegators = [];      // profielen waarvoor deze gebruiker mag invullen

        async function initDelegateBar() {
            const bar = document.getElementById('delegate-bar');
            const sel = document.getElementById('delegate-select');
            if (!bar || !sel || !currentUser || !currentUser.id) return;
            const sb = getSupabase();
            if (!sb) return;
            try {
                const { data, error } = await sb.from('fill_delegates')
                    .select('delegator_id')
                    .eq('delegate_id', currentUser.id);
                if (error) {
                    // Tabel bestaat nog niet (migratie-gemachtigden.sql niet gedraaid)
                    if (!/relation.*fill_delegates/i.test(error.message || '')) {
                        console.warn('Delegaties laden mislukt:', error.message);
                    }
                    bar.style.display = 'none';
                    return;
                }
                const ids = (data || []).map(r => r.delegator_id);
                if (ids.length === 0) { bar.style.display = 'none'; return; }
                const { data: profiles } = await sb.from('users').select('*').in('id', ids);
                _delegators = (profiles || []).filter(u => !u.archived_at && !u.paused_at);
                if (_delegators.length === 0) { bar.style.display = 'none'; return; }
                sel.innerHTML = '<option value="self">Mijzelf</option>' + _delegators.map(u =>
                    `<option value="${u.id}">${escapeHtml(u.name || u.email)}</option>`
                ).join('');
                sel.value = 'self';
                bar.style.display = 'flex';
            } catch (e) {
                console.warn('Delegaties laden mislukt:', e.message || e);
                bar.style.display = 'none';
            }
        }

        async function switchFillUser(value) {
            // Huidige week eerst veiligstellen voordat we van gebruiker wisselen
            if (weekDataDirty && currentUser && currentUser.id) {
                try { await saveWeekToSupabase(); } catch (e) { console.warn('Auto-save bij wisselen faalde:', e); }
            }
            if (value === 'self') {
                if (!_realUser) return; // al op eigen uren
                currentUser = _realUser;
                _realUser = null;
            } else {
                const target = _delegators.find(u => u.id === value);
                if (!target) return;
                if (!_realUser) _realUser = currentUser;
                currentUser = target;
            }

            // Context volledig herladen voor de nu actieve gebruiker
            currentProject = null;
            weekData = defaultWeekData();
            weekSummary = null;
            markClean();
            expandedDay = -1;

            // Visuele indicatie: badge in de header + oranje rand op de balk
            const badge = document.getElementById('user-badge-name');
            if (badge) {
                badge.innerHTML = formatBadgeName(currentUser.name)
                    + (_realUser ? ' <span style="font-size:0.6rem;background:var(--app-warn-soft);color:var(--app-warn);border:1px solid var(--app-warn-line);padding:1px 6px;border-radius:4px;font-weight:700;vertical-align:middle">NAMENS</span>' : '');
            }
            const bar = document.getElementById('delegate-bar');
            if (bar) {
                bar.style.borderColor = _realUser ? 'var(--app-warn)' : 'var(--border)';
                bar.style.background = _realUser ? 'var(--app-warn-soft)' : 'var(--app-bg-tint)';
            }

            await loadDataFromSupabase();
            renderDays();
            renderExpenses();
            showToast(_realUser
                ? '👥 Je vult nu in namens ' + (currentUser.name || currentUser.email)
                : '✓ Terug naar je eigen uren');
        }

        async function loadDataFromSupabase() {
            if (!getSupabase() || !currentUser || !currentUser.id) return;

            try {
                // Haal actieve projecten op · admins zien alles, ZZP'ers alleen toegewezen projecten
                const isAdmin = currentUser && currentUser.role === 'admin';
                let projects = [];
                if (isAdmin) {
                    const { data } = await getSupabase().from('projects').select('*').eq('status', 'active').order('name');
                    projects = data || [];
                } else {
                    // Haal project IDs op waar deze user aan toegewezen is
                    const { data: assignments } = await getSupabase().from('user_projects').select('project_id').eq('user_id', currentUser.id);
                    if (assignments && assignments.length > 0) {
                        const projectIds = assignments.map(a => a.project_id);
                        const { data } = await getSupabase().from('projects').select('*').in('id', projectIds).eq('status', 'active').order('name');
                        projects = data || [];
                    }
                }

                if (projects && projects.length > 0) {
                    // Kies laatst geselecteerd project (uit localStorage) of het eerste
                    const lastProjectId = localStorage.getItem('kts_last_project_' + currentUser.id);
                    const saved = lastProjectId && projects.find(p => p.id === lastProjectId);
                    currentProject = saved || projects[0];

                    document.querySelector('.project-name').textContent = currentProject.name;
                    document.querySelector('.project-meta').textContent =
                        (currentProject.client_name || '') + ' · ' + (currentProject.location || '') + ' · ' + currentProject.project_code;
                } else {
                    // Geen projecten
                    document.querySelector('.project-name').textContent = 'Geen project';
                    document.querySelector('.project-meta').textContent = 'Neem contact op met je beheerder';
                    if (_realUser) {
                        // Gemachtigden-modus: NIET het onboarding-scherm over de app
                        // heen leggen · gewoon melden dat de collega nog geen
                        // projecttoewijzing heeft (uren invullen kan wel · die landen
                        // dan onder het placeholder-project "Nog toe te wijzen")
                        showToast('⚠️ ' + (currentUser.name || 'Deze collega') + ' is nog niet aan een project gekoppeld');
                    } else {
                        showWelcomeGuide();
                    }
                }

                // Feature flags staan nu op users tabel (currentUser), geen aparte query nodig

                // Laad tarieven voor het project
                await loadProjectRates();

                // Extra kosten tab tonen/verbergen op basis van rechten
                const navKosten = document.getElementById('nav-kosten');
                if (navKosten) {
                    navKosten.style.display = (isAdmin || userCanDeclareExpenses()) ? '' : 'none';
                }
                // Inspecties tab tonen/verbergen
                const navInsp2 = document.getElementById('nav-inspecties');
                if (navInsp2) navInsp2.style.display = (isAdmin || currentUser.allow_inspecties) ? '' : 'none';
                // Administratie tab tonen/verbergen
                const navAdm2 = document.getElementById('nav-administratie');
                if (navAdm2) navAdm2.style.display = (isAdmin || currentUser.allow_administratie) ? '' : 'none';
                // Bottom-nav grid dynamisch aanpassen aan aantal zichtbare items
                // (anders staan 4 knoppen op 1/5 grid links uitgelijnd i.p.v. gecentreerd)
                updateBottomNavGrid();

                // Laad uren voor huidige week
                await loadWeekFromSupabase();
            } catch (err) {
                console.error('loadDataFromSupabase fout:', err);
                showToast('⚠️ Data laden mislukt · probeer de pagina te herladen');
            }
        }

        // ===== OFFLINE LOKALE OPSLAG =====
        function getWeekLocalKey() {
            if (!currentUser || !currentUser.id) return null;
            return 'kts-week-' + currentUser.id + '-' + currentYear + '-w' + currentWeekNumber;
        }

        function saveWeekLocal() {
            const key = getWeekLocalKey();
            if (!key) return;
            try {
                localStorage.setItem(key, JSON.stringify(weekData));
            } catch (e) { console.warn('Lokale opslag mislukt:', e); }
        }

        function loadWeekLocal() {
            const key = getWeekLocalKey();
            if (!key) return false;
            try {
                const stored = localStorage.getItem(key);
                if (stored) {
                    weekData = JSON.parse(stored);
                    return true;
                }
            } catch (e) {
                console.warn('loadWeekLocal: corrupt localStorage voor key', key, '-', e.message);
            }
            return false;
        }

        async function loadWeekFromSupabase() {
            if (!getSupabase() || !currentUser || !currentUser.id) return;

            const weekStart = getDateForDayIndex(0);
            const weekEnd = getDateForDayIndex(6);
            weekSummary = null; // reset
            currentWeekDbStatus = null; // reset

            try {
                // Haal eerst de week-status op uit de DB (project-specifiek)
                let statusQuery = getSupabase().from('week_status')
                    .select('status')
                    .eq('user_id', currentUser.id)
                    .eq('week_number', currentWeekNumber)
                    .eq('year', currentYear);
                if (currentProject) statusQuery = statusQuery.eq('project_id', currentProject.id);
                const { data: statusRow } = await statusQuery.maybeSingle();
                if (statusRow) currentWeekDbStatus = statusRow.status;
                // 1. Dag-entries laden (project-specifiek)
                let entryQuery = getSupabase()
                    .from('time_entries')
                    .select('*')
                    .eq('user_id', currentUser.id)
                    .gte('entry_date', weekStart)
                    .lte('entry_date', weekEnd);
                if (currentProject) entryQuery = entryQuery.eq('project_id', currentProject.id);
                const { data: entries, error } = await entryQuery.order('entry_date');

                if (error) { console.warn('Laden mislukt:', error.message); return; }

                if (entries && entries.length > 0) {
                    // Start met defaults (ma-vr vooringevuld) en overschrijf met opgeslagen data
                    weekData = defaultWeekData();

                    entries.forEach(e => {
                        const dayIndex = getDayIndexForDate(e.entry_date);
                        if (dayIndex >= 0 && dayIndex <= 6) {
                            weekData[dayIndex] = {
                                start: e.start_time ? e.start_time.slice(0,5) : '',
                                end: e.end_time ? e.end_time.slice(0,5) : '',
                                breakMin: e.break_minutes || 0,
                                desc: e.description || '',
                                location: e.location || '',
                                km: e.km || 0,
                                kmHeen: e.km_heen || 0,
                                kmTerug: e.km_terug || 0,
                                hotel: e.hotel || false,
                                thuiswerk: e.thuiswerk || false,
                                dayOff: e.day_off || false,
                                hours: parseFloat(e.total_hours) || 0
                            };
                        }
                    });
                    // Baseline-snapshot zodat saveWeekToSupabase later alleen
                    // GEWIJZIGDE dagen schrijft (anti-overschrijf bescherming)
                    weekDataLoaded = JSON.parse(JSON.stringify(weekData));
                } else {
                    // 2. Geen dag-entries: check week_summaries (historische data)
                    if (currentUser && currentUser.id) {
                        const { data: summary } = await getSupabase()
                            .from('week_summaries')
                            .select('*')
                            .eq('user_id', currentUser.id)
                            .eq('year', currentYear)
                            .eq('week_number', currentWeekNumber)
                            .maybeSingle();

                        if (summary) {
                            weekSummary = summary;
                            console.log('Week summary geladen:', summary.invoice_no);
                        }
                    }
                }

                // Sla weekdata lokaal op als backup
                saveWeekLocal();

                markClean();
                renderDays();
                renderOverview();
                updateClockUI();

                // Verberg opslaan-knoppen bij historische of niet-bewerkbare weken
                const isReadOnly = !!weekSummary || !getWeekStatus().editable;
                const urenWrap = document.getElementById('save-uren-btn-wrap');
                const kostenWrap = document.getElementById('save-kosten-btn-wrap');
                if (urenWrap) urenWrap.style.display = isReadOnly ? 'none' : 'block';
                if (kostenWrap) kostenWrap.style.display = isReadOnly ? 'none' : 'block';

                // Knop-status wordt afgehandeld door renderOverview()
            } catch (err) {
                console.error('loadWeekFromSupabase fout:', err);
                // Offline fallback: probeer lokale data
                if (loadWeekLocal()) {
                    showToast('📴 Offline · lokale data geladen');
                    renderDays();
                    renderOverview();
                } else {
                    showToast('⚠️ Weekdata laden mislukt');
                }
            }
        }

        // ===== WEEK STATUS BIJWERKEN =====
        async function updateWeekStatus(newStatus) {
            const sb = getSupabase();
            if (!sb || !currentUser || !currentUser.id) return;

            try {
                const extra = {};
                if (newStatus === 'ondertekend') extra.signed_at = new Date().toISOString();
                if (newStatus === 'verstuurd') extra.submitted_at = new Date().toISOString();

                const record = {
                    user_id: currentUser.id,
                    project_id: currentProject ? currentProject.id : null,
                    week_number: currentWeekNumber,
                    year: currentYear,
                    status: newStatus,
                    updated_at: new Date().toISOString(),
                    ...extra
                };

                // Upsert met project-specifieke constraint
                let { error } = await sb.from('week_status').upsert(record, { onConflict: 'user_id,project_id,week_number,year' });

                // Fallback: oude constraint zonder project_id
                if (error) {
                    console.warn('Probeer constraint zonder project_id:', error.message);
                    ({ error } = await sb.from('week_status').upsert(record, { onConflict: 'user_id,week_number,year' }));
                }

                if (error) {
                    console.error('Week status update mislukt:', error.message);
                    showToast('⚠️ Status bijwerken mislukt · probeer opnieuw');
                }
            } catch (err) {
                console.error('updateWeekStatus fout:', err);
                showToast('⚠️ Status bijwerken mislukt · controleer je verbinding');
            }
        }

        // Haal week statussen op voor een maand
        // Map: week_number → { status, approval_status }
        async function getMonthWeekStatuses() {
            const sb = getSupabase();
            if (!sb || !currentUser || !currentUser.id) return {};

            try {
                let q = sb.from('week_status')
                    .select('week_number, status, approval_status')
                    .eq('user_id', currentUser.id)
                    .eq('year', overviewYear);
                if (currentProject) q = q.eq('project_id', currentProject.id);
                const { data, error } = await q;

                if (error) { console.error('getMonthWeekStatuses fout:', error.message); return {}; }
                const map = {};
                if (data) data.forEach(d => {
                    // "definitief" = verstuurd + goedgekeurd door opdrachtgever
                    const effectiveStatus = (d.status === 'verstuurd' && d.approval_status === 'goedgekeurd')
                        ? 'definitief'
                        : d.status;
                    map[d.week_number] = effectiveStatus;
                });
                return map;
            } catch (err) {
                console.error('getMonthWeekStatuses fout:', err);
                return {};
            }
        }

        // ===== PUNT 16: AUDIT LOG (uitgeschakeld) =====
        async function logAudit(action, details) {
            // Uitgeschakeld · kan later weer geactiveerd worden als audit_log tabel wordt aangemaakt
            return;
        }

        // ===== PUNT 19: ERROR MONITORING =====
        window.addEventListener('error', function(event) {
            const errorInfo = {
                message: event.message,
                source: event.filename,
                line: event.lineno,
                col: event.colno,
                stack: event.error ? event.error.stack : ''
            };
            console.error('Global error:', errorInfo);
            // Log naar Supabase als verbinding beschikbaar
            logErrorToSupabase(errorInfo);
        });

        window.addEventListener('unhandledrejection', function(event) {
            const errorInfo = {
                message: event.reason ? (event.reason.message || String(event.reason)) : 'Onbekende promise rejection',
                stack: event.reason ? event.reason.stack : ''
            };
            console.error('Unhandled rejection:', errorInfo);
            logErrorToSupabase(errorInfo);
        });

        async function logErrorToSupabase(errorInfo) {
            try {
                const sb = getSupabase();
                if (!sb) return;
                await sb.from('error_log').insert({
                    user_id: currentUser ? currentUser.id : null,
                    user_name: currentUser ? currentUser.name : 'niet ingelogd',
                    error_message: (errorInfo.message || '').substring(0, 500),
                    error_stack: (errorInfo.stack || '').substring(0, 2000),
                    source: errorInfo.source || '',
                    line: errorInfo.line || null,
                    url: window.location.href,
                    user_agent: navigator.userAgent.substring(0, 300),
                    created_at: new Date().toISOString()
                });
            } catch (e) {
                // Error logging mag nooit de app breken
                console.warn('Error log fout:', e.message);
            }
        }

        // ===== CUSTOM CONFIRM DIALOG =====
        // Vraag na "Week opslaan" of de gebruiker direct wil ondertekenen+versturen
        // Returned true = ondertekenen nu, false = later
        // Algemene helper voor admin-doorklik prompts.
        // Returned true (ja, doorgaan) / false (annuleren).
        function askContinueAsync(opts) {
            const { title, message, confirmLabel = 'Ja, doorgaan', cancelLabel = 'Niet nu', iconSvg } = opts || {};
            return new Promise(resolve => {
                const overlay = document.createElement('div');
                overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,27,45,0.45);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(2px)';
                const box = document.createElement('div');
                box.style.cssText = 'background:var(--app-surface);border-radius:14px;padding:24px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);font-family:"IBM Plex Sans",sans-serif';
                const icon = iconSvg || '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#07567F" stroke-width="2"><path d="M5 12l5 5L20 7"/></svg>';
                box.innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:50%;background:var(--app-info-soft);margin:0 auto 14px">${icon}</div>
                    <div style="text-align:center;font-size:16px;font-weight:600;color:var(--app-ink-900);margin-bottom:6px">${title}</div>
                    <div style="text-align:center;font-size:13px;color:var(--app-ink-500);line-height:1.5;margin-bottom:20px">${message}</div>
                    <div style="display:flex;flex-direction:column;gap:8px">
                        <button id="continue-yes" style="padding:12px 20px;border-radius:10px;border:none;background:#07567F;color:white;font-size:14px;cursor:pointer;font-weight:600;font-family:inherit">${confirmLabel}</button>
                        <button id="continue-no" style="padding:12px 20px;border-radius:10px;border:1px solid var(--app-line);background:var(--app-surface);color:var(--app-ink-500);font-size:14px;cursor:pointer;font-weight:500;font-family:inherit">${cancelLabel}</button>
                    </div>
                `;
                overlay.appendChild(box);
                document.body.appendChild(overlay);
                function close(r) { overlay.remove(); resolve(r); }
                box.querySelector('#continue-yes').onclick = () => close(true);
                box.querySelector('#continue-no').onclick = () => close(false);
                overlay.onclick = (e) => { if (e.target === overlay) close(false); };
                document.addEventListener('keydown', function esc(e) {
                    if (e.key === 'Escape') { close(false); document.removeEventListener('keydown', esc); }
                });
            });
        }

        function askSignAfterSaveAsync(weekNumber) {
            return new Promise(resolve => {
                const overlay = document.createElement('div');
                overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(15,27,45,0.45);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(2px)';
                const box = document.createElement('div');
                box.style.cssText = 'background:var(--app-surface);border-radius:14px;padding:24px;max-width:400px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);font-family:"IBM Plex Sans",sans-serif';
                box.innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:50%;background:var(--app-info-soft);margin:0 auto 14px">
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#07567F" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </div>
                    <div style="text-align:center;font-size:16px;font-weight:600;color:var(--app-ink-900);margin-bottom:6px">Week ${weekNumber} opgeslagen</div>
                    <div style="text-align:center;font-size:13px;color:var(--app-ink-500);line-height:1.5;margin-bottom:20px">Wil je deze week direct ondertekenen en versturen?</div>
                    <div style="display:flex;flex-direction:column;gap:8px">
                        <button id="sign-yes" style="padding:12px 20px;border-radius:10px;border:none;background:#07567F;color:white;font-size:14px;cursor:pointer;font-weight:600;font-family:inherit">Ja, onderteken &amp; verstuur</button>
                        <button id="sign-no" style="padding:12px 20px;border-radius:10px;border:1px solid var(--app-line);background:var(--app-surface);color:var(--app-ink-500);font-size:14px;cursor:pointer;font-weight:500;font-family:inherit">Niet nu · doe ik later</button>
                    </div>
                `;
                overlay.appendChild(box);
                document.body.appendChild(overlay);
                function close(result) { overlay.remove(); resolve(result); }
                box.querySelector('#sign-yes').onclick = () => close(true);
                box.querySelector('#sign-no').onclick = () => close(false);
                overlay.onclick = (e) => { if (e.target === overlay) close(false); };
                document.addEventListener('keydown', function escHandler(e) {
                    if (e.key === 'Escape') {
                        close(false);
                        document.removeEventListener('keydown', escHandler);
                    }
                });
            });
        }

        function confirmAsync(message, destructive) {
            return new Promise(resolve => {
                const overlay = document.createElement('div');
                overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px';
                const box = document.createElement('div');
                box.style.cssText = 'background:var(--app-surface);border-radius:16px;padding:24px;max-width:340px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3)';
                const btnColor = destructive ? 'var(--app-alert)' : 'var(--kts-blue)';
                const btnText = destructive ? 'Verwijderen' : 'Bevestigen';
                box.innerHTML = `
                    <div style="font-size:0.9rem;line-height:1.5;color:var(--app-ink-900);white-space:pre-line;margin-bottom:20px">${message}</div>
                    <div style="display:flex;gap:10px;justify-content:flex-end">
                        <button id="cd-cancel" style="padding:10px 20px;border-radius:10px;border:1px solid var(--app-line-strong);background:var(--app-surface);color:var(--app-ink-700);font-size:0.85rem;cursor:pointer;font-weight:500">Annuleren</button>
                        <button id="cd-ok" style="padding:10px 20px;border-radius:10px;border:none;background:${btnColor};color:white;font-size:0.85rem;cursor:pointer;font-weight:600">${btnText}</button>
                    </div>
                `;
                overlay.appendChild(box);
                document.body.appendChild(overlay);
                function close(result) { overlay.remove(); resolve(result); }
                box.querySelector('#cd-cancel').onclick = function() { close(false); };
                box.querySelector('#cd-ok').onclick = function() { close(true); };
                overlay.onclick = function(e) { if (e.target === overlay) close(false); };
            });
        }

        // Modal-prompt voor vrije-tekst input. Resolved met de string (kan leeg zijn)
        // bij OK, of null bij Annuleren · zodat caller "lege string" kan onderscheiden
        // van "geannuleerd".
        function promptAsync(title, placeholder, defaultValue) {
            return new Promise(resolve => {
                const overlay = document.createElement('div');
                overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px';
                const box = document.createElement('div');
                box.style.cssText = 'background:var(--app-surface);border-radius:16px;padding:24px;max-width:380px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3)';
                box.innerHTML = `
                    <div style="font-size:0.95rem;font-weight:600;line-height:1.4;color:var(--app-ink-900);margin-bottom:8px">${title}</div>
                    <input type="text" id="pa-input" placeholder="${placeholder || ''}" value="${defaultValue || ''}" style="width:100%;padding:10px 12px;border:2px solid var(--app-line);border-radius:10px;font-size:0.9rem;font-family:inherit;outline:none;box-sizing:border-box;margin-bottom:18px">
                    <div style="display:flex;gap:10px;justify-content:flex-end">
                        <button id="pa-cancel" style="padding:10px 20px;border-radius:10px;border:1px solid var(--app-line-strong);background:var(--app-surface);color:var(--app-ink-700);font-size:0.85rem;cursor:pointer;font-weight:500">Annuleren</button>
                        <button id="pa-ok" style="padding:10px 20px;border-radius:10px;border:none;background:var(--kts-blue);color:white;font-size:0.85rem;cursor:pointer;font-weight:600">OK</button>
                    </div>
                `;
                overlay.appendChild(box);
                document.body.appendChild(overlay);
                const input = box.querySelector('#pa-input');
                setTimeout(() => input.focus(), 50);
                function close(result) { overlay.remove(); resolve(result); }
                box.querySelector('#pa-cancel').onclick = function() { close(null); };
                box.querySelector('#pa-ok').onclick = function() { close(input.value); };
                input.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') close(input.value);
                    if (e.key === 'Escape') close(null);
                });
                overlay.onclick = function(e) { if (e.target === overlay) close(null); };
            });
        }

        // ===== OFFLINE INDICATOR =====
        (function() {
            const banner = document.createElement('div');
            banner.id = 'offline-banner';
            banner.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;z-index:10000;background:var(--app-alert-soft);color:var(--app-alert);border-bottom:1px solid var(--app-alert-line);text-align:center;padding:8px 12px;font-size:0.8rem;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.15);letter-spacing:0.01em';
            banner.textContent = '⚠️ Geen internetverbinding · wijzigingen worden niet opgeslagen';
            document.body.appendChild(banner);

            function updateStatus() {
                banner.style.display = navigator.onLine ? 'none' : 'block';
            }
            window.addEventListener('online', function() {
                banner.style.display = 'none';
                showToast('✓ Weer online');
            });
            window.addEventListener('offline', function() {
                banner.style.display = 'block';
            });
            updateStatus();
        })();

        // ===== iOS INSTALL PROMPT =====
        // iOS Safari heeft GEEN automatische install-prompt zoals Android.
        // Toon een subtiele hint na 8 sec hoe de app aan beginscherm toe te
        // voegen. Verschijnt alleen op iOS Safari (niet Chrome iOS) en niet
        // als de app al als standalone draait. Na 'OK' 30 dagen verbergen.
        (function() {
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            const isStandalone = window.navigator.standalone === true
                || window.matchMedia('(display-mode: standalone)').matches;
            if (!isIOS || isStandalone) return;

            // Check of user 'm in laatste 30 dagen heeft weggeklikt
            const dismissed = localStorage.getItem('kts-ios-install-dismissed');
            if (dismissed) {
                const ageDays = (Date.now() - parseInt(dismissed)) / (1000 * 60 * 60 * 24);
                if (ageDays < 30) return;
            }

            setTimeout(() => {
                if (document.getElementById('ios-install-banner')) return;
                const banner = document.createElement('div');
                banner.id = 'ios-install-banner';
                banner.style.cssText = `
                    position:fixed;
                    bottom:calc(80px + env(safe-area-inset-bottom, 0px));
                    left:12px;
                    right:12px;
                    z-index:9000;
                    background:linear-gradient(135deg, var(--kts-blue-700, #043B56) 0%, var(--kts-blue, #07567F) 100%);
                    border:1px solid var(--kts-accent-light, #3A9CC5);
                    border-left:3px solid var(--kts-accent-light, #3A9CC5);
                    border-radius:12px;
                    padding:12px 14px;
                    box-shadow:0 12px 32px rgba(0,0,0,0.4);
                    color:white;
                    font-size:0.85rem;
                    display:flex;
                    align-items:center;
                    gap:12px;
                    animation:slideUpFade 0.4s ease;
                `;
                banner.innerHTML = `
                    <div style="font-size:1.6rem;flex-shrink:0">📲</div>
                    <div style="flex:1;min-width:0">
                        <div style="font-weight:700;font-size:0.9rem;letter-spacing:-0.005em">Voeg toe aan beginscherm</div>
                        <div style="font-size:0.74rem;opacity:0.85;margin-top:1px">Tik <strong style="color:var(--kts-accent-light,#3A9CC5)">⎙</strong> in Safari, dan "Zet op beginscherm"</div>
                    </div>
                    <button id="ios-install-dismiss" style="background:transparent;border:1px solid rgba(255,255,255,0.3);color:white;padding:6px 12px;border-radius:8px;font-size:0.72rem;cursor:pointer;font-weight:600;flex-shrink:0">OK</button>
                `;
                document.body.appendChild(banner);
                document.getElementById('ios-install-dismiss').onclick = () => {
                    localStorage.setItem('kts-ios-install-dismissed', String(Date.now()));
                    banner.style.transition = 'opacity 200ms, transform 200ms';
                    banner.style.opacity = '0';
                    banner.style.transform = 'translateY(8px)';
                    setTimeout(() => banner.remove(), 220);
                };
            }, 8000);
        })();
        // Animatie voor iOS-install banner slide-up
        (function injectIosInstallAnim() {
            if (document.getElementById('kts-ios-anim-style')) return;
            const s = document.createElement('style');
            s.id = 'kts-ios-anim-style';
            s.textContent = '@keyframes slideUpFade { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }';
            document.head.appendChild(s);
        })();

        // ===== PUNT 17: HERINNERING BANNER =====
        function checkWeekReminder() {
            const container = document.getElementById('reminder-container');
            if (!container) return;

            const now = new Date();
            const today = now.getDay(); // 0=zo, 5=vr, 6=za

            // Toon herinnering op vrijdag (5), zaterdag (6) of zondag (0)
            const isReminderDay = today === 5 || today === 6 || today === 0;
            // Of als het maandag/dinsdag is en vorige week nog niet verstuurd
            const isEarlyNextWeek = today === 1 || today === 2;

            if (!isReminderDay && !isEarlyNextWeek) {
                container.innerHTML = '';
                return;
            }

            // Check of deze week (of vorige bij ma/di) al is verstuurd
            const dismissKey = 'kts-reminder-dismissed-' + currentWeekNumber + '-' + currentYear;
            if (localStorage.getItem(dismissKey)) {
                container.innerHTML = '';
                return;
            }

            // Alleen tonen als de huidige week de echte huidige week is
            const realWeek = getISOWeek(now);
            const realYear = getISOYear(now);
            if (currentWeekNumber !== realWeek || currentYear !== realYear) {
                container.innerHTML = '';
                return;
            }

            // Check of week al verstuurd is, niet bewerkbaar, of historisch
            const wkStatus = getWeekStatus();
            if (weekSummary || !wkStatus.editable) {
                container.innerHTML = '';
                return;
            }

            // Niet tonen als project niet actief (paused/closed) of nog niet gestart
            if (!currentProject || (currentProject.status && currentProject.status !== 'active')) {
                container.innerHTML = '';
                return;
            }
            if (currentProject.start_date) {
                const weekFriday = new Date(currentWeekMonday);
                weekFriday.setDate(weekFriday.getDate() + 4);
                if (toLocalDateStr(weekFriday) < currentProject.start_date) {
                    container.innerHTML = '';
                    return;
                }
            }

            // Check week status
            const sb = getSupabase();
            if (sb && currentUser) {
                sb.from('week_status')
                    .select('status')
                    .eq('user_id', currentUser.id)
                    .eq('week_number', currentWeekNumber)
                    .eq('year', currentYear)
                    .maybeSingle()
                    .then(({ data }) => {
                        if (data && data.status === 'verstuurd') {
                            container.innerHTML = '';
                            return;
                        }
                        showReminderBanner(container, dismissKey, data ? data.status : null);
                    });
            }
        }

        function showReminderBanner(container, dismissKey, status) {
            let msg = '📋 Vergeet niet je weekstaat in te vullen en te versturen!';
            if (status === 'opgeslagen' || status === 'ondertekend') {
                msg = '📋 Je weekstaat is opgeslagen maar nog niet verstuurd · onderteken en verstuur!';
            }

            container.innerHTML = `
                <div class="reminder-banner">
                    <span>${msg}</span>
                    <button class="reminder-close" onclick="dismissReminder('${dismissKey}')" title="Sluit">✕</button>
                </div>`;
        }

        function dismissReminder(key) {
            localStorage.setItem(key, '1');
            const container = document.getElementById('reminder-container');
            if (container) container.innerHTML = '';
        }

        // ===== OPSLAAN NAAR SUPABASE =====
        async function saveWeek(tab) {
            if (weekSummary) { showToast('📋 Deze week is alleen-lezen (historische data)'); return; }
            if (currentWeekDbStatus === 'verstuurd') { showToast('🔒 Verstuurde week kan niet meer worden aangepast'); return; }

            // Validatie: starttijd moet vóór eindtijd + werkzaamheden verplicht
            if (tab === 'uren') {
                const dagNamen = ['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag'];
                const tijdFout = [];
                const missend = [];
                weekData.forEach((dag, i) => {
                    if (dag.start && dag.end) {
                        const [sh,sm] = dag.start.split(':').map(Number);
                        const [eh,em] = dag.end.split(':').map(Number);
                        if ((eh * 60 + em) <= (sh * 60 + sm)) {
                            tijdFout.push(dagNamen[i]);
                        }
                    }
                    if (dag.hours > 0 && !(dag.desc || '').trim()) {
                        missend.push(dagNamen[i]);
                    }
                });
                if (tijdFout.length > 0) {
                    showToast('⚠️ Eindtijd moet na starttijd voor: ' + tijdFout.join(', '));
                    return;
                }
                if (missend.length > 0) {
                    showToast('⚠️ Vul werkzaamheden beschrijving in voor: ' + missend.join(', '));
                    return;
                }
            }

            const labels = { uren: 'Uren', kosten: 'Declaraties' };
            const btn = document.querySelector('#save-uren-btn-wrap .btn') || document.querySelector('#save-kosten-btn-wrap .btn');

            if (getSupabase() && currentUser && currentUser.id) {
                if (btn) { btn.innerHTML = '⏳ Opslaan...'; btn.disabled = true; }
                try {
                    showOverviewLoading();
                    await saveWeekToSupabase();
                    await updateWeekStatus('opgeslagen');
                    signatureData = { zzp: null, client: null }; // Reset handtekening bij opslaan (status terug naar opgeslagen)
                    saveWeekLocal();
                    markClean();
                    notifyOtherTabs();
                    logAudit('week_opgeslagen', { week: currentWeekNumber, tab: tab });
                    showToast('✓ ' + (labels[tab] || tab) + ' opgeslagen');
                    // Na uren opslaan: switch naar overzicht + bied direct ondertekenen aan
                    if (tab === 'uren') {
                        switchScreen('overzicht');
                        // Wacht kort tot overzicht-renderOverview is geupdate en knoppen zichtbaar zijn
                        setTimeout(async () => {
                            // Alleen vragen als de week nog niet ondertekend/verstuurd is en niet leeg
                            const hasHours = (weekData || []).some(d => (d.hours || 0) > 0);
                            const status = currentWeekDbStatus;
                            if (hasHours && (status === 'opgeslagen' || !status)) {
                                const wantSign = await askSignAfterSaveAsync(currentWeekNumber);
                                if (wantSign) {
                                    openSignatureModal();
                                }
                            }
                        }, 350);
                    }
                } catch (err) {
                    // Offline: sla lokaal op
                    saveWeekLocal();
                    showToast('⚠️ Opslaan mislukt · data lokaal bewaard');
                    console.error('Save error:', err);
                    await renderOverview();
                } finally {
                    if (btn) { btn.disabled = false; markClean(); }
                }
            } else {
                showToast('✓ ' + (labels[tab] || tab) + ' opgeslagen (lokaal)');
            }
        }

        // ===== INIT =====
        updateWeekLabel();
        renderDays();
        renderExpenses();
        renderOverview();
        // renderPOList(); · Orders scherm verwijderd

        // Laad Supabase CDN
        (function() {
            // Probeer meerdere CDN bronnen
            const urls = [
                'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
                'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.3/dist/umd/supabase.min.js'
            ];
            let i = 0;

            function tryNext() {
                if (i >= urls.length) {
                    // Alle CDNs mislukt · bied demo modus aan
                    console.error('Alle CDN pogingen mislukt');
                    const err = document.getElementById('login-error');
                    err.innerHTML = 'CDN niet bereikbaar. <a href="#" onclick="skipLogin();return false" style="color:white;text-decoration:underline">Ga verder in demo modus</a>';
                    err.style.display = 'block';
                    return;
                }
                const s = document.createElement('script');
                s.crossOrigin = 'anonymous';
                s.src = urls[i];
                console.log('CDN poging ' + (i+1) + '/' + urls.length + ': ' + urls[i]);
                s.onload = function() {
                    // Check diverse bekende window-namen
                    const lib = window.supabase || window.Supabase;
                    console.log('Script geladen. window.supabase type:', typeof window.supabase, 'keys:', window.supabase ? Object.keys(window.supabase).slice(0,5) : 'n/a');
                    if (lib && typeof lib.createClient === 'function') {
                        window.supabase = lib; // normaliseer
                        console.log('Supabase CDN OK!');
                        checkSession();
                    } else {
                        console.warn('Script geladen maar createClient niet gevonden');
                        i++;
                        tryNext();
                    }
                };
                s.onerror = function(e) {
                    console.warn('CDN mislukt:', urls[i], e);
                    i++;
                    tryNext();
                };
                document.head.appendChild(s);
            }
            tryNext();
        })();

        // ===== jsPDF + AutoTable laden (met fallback CDNs) =====
        (function() {
            const jspdfUrls = [
                'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js',
                'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js',
                'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js'
            ];
            const autoTableUrls = [
                'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
                'https://unpkg.com/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
                'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js'
            ];

            function loadScript(urls, idx, label, onSuccess) {
                if (idx >= urls.length) { console.error(label + ' · alle CDNs mislukt'); return; }
                const s = document.createElement('script');
                s.src = urls[idx];
                s.onload = function() { console.log(label + ' geladen via ' + urls[idx]); onSuccess(); };
                s.onerror = function() { console.warn(label + ' mislukt: ' + urls[idx]); loadScript(urls, idx + 1, label, onSuccess); };
                document.head.appendChild(s);
            }

            // Zware libraries (jsPDF ~350KB, fonts ~500KB, Chart.js, SheetJS,
            // PDF.js · samen ~2MB) pas NA first paint laden. Ze zijn alleen
            // nodig bij PDF-genereren, dashboard-grafieken, Excel-import en
            // bank-parsing · nooit in de eerste seconden. Alle call-sites hebben
            // al "library nog niet geladen"-guards of wait-loops, dus uitstel is
            // veilig. Scheelt merkbaar opstarttijd op telefoons.
            function startHeavyLibs() {
                loadScript(jspdfUrls, 0, 'jsPDF', function() {
                    loadScript(autoTableUrls, 0, 'AutoTable', function() {
                        console.log('jsPDF + AutoTable volledig geladen!');
                        // DaxlinePro TTF fonts laden voor PDF
                        var fs = document.createElement('script');
                        fs.src = 'daxline-pdf-fonts.js';
                        fs.onload = function() { console.log('DaxlinePro PDF fonts geladen'); };
                        fs.onerror = function() { console.warn('DaxlinePro fonts niet gevonden · PDF gebruikt Helvetica'); };
                        document.head.appendChild(fs);
                    });
                });

                // Chart.js laden voor dashboard grafieken
                const chartUrls = [
                    'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
                    'https://unpkg.com/chart.js@4.4.1/dist/chart.umd.min.js',
                    'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
                ];
                loadScript(chartUrls, 0, 'Chart.js', function() {
                    console.log('Chart.js geladen!');
                });

                // SheetJS (xlsx) laden voor Excel import
                const xlsxUrls = [
                    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
                    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
                    'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
                ];
                loadScript(xlsxUrls, 0, 'SheetJS', function() {
                    console.log('SheetJS geladen!');
                });

                // PDF.js laden voor PDF parsing (transactieoverzichten)
                const pdfjsUrls = [
                    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
                    'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
                    'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js'
                ];
                loadScript(pdfjsUrls, 0, 'PDF.js', function() {
                    console.log('PDF.js geladen!');
                    if (window.pdfjsLib) {
                        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                    }
                });
            }
            if ('requestIdleCallback' in window) {
                requestIdleCallback(startHeavyLibs, { timeout: 2000 });
            } else {
                setTimeout(startHeavyLibs, 800);
            }
        })();

        // ===== ADMIN ZOEKFILTER =====
        function filterAdminList(type) {
            const searchEl = document.getElementById('admin-search-' + type);
            if (!searchEl) return;
            const q = searchEl.value.toLowerCase().trim();
            const listId = type === 'persoon' ? 'admin-persoon-list' : type === 'project' ? 'admin-project-list' : 'admin-tarief-list';
            const cards = document.querySelectorAll('#' + listId + ' .entry-card');
            cards.forEach(card => {
                const text = card.textContent.toLowerCase();
                card.style.display = (!q || text.includes(q)) ? '' : 'none';
            });
        }

        // ===== CONTACT EMAIL HELPERS =====
        function getContactEmailsByRole(company, role) {
            // role: 'receives_weekstaat', 'receives_factuur', 'receives_io'
            if (!company) return '';
            let contacts = company.contacts;
            if (typeof contacts === 'string') { try { contacts = JSON.parse(contacts); } catch(e) { contacts = []; } }
            if (contacts && contacts.length > 0) {
                const emails = contacts.filter(c => c[role] && c.email).map(c => c.email);
                if (emails.length > 0) return emails.join(', ');
            }
            // Fallback: oude velden
            if (role === 'receives_io' && company.email_po) return company.email_po;
            return company.email || '';
        }

        function getContactNameByRole(company, role) {
            if (!company) return '';
            let contacts = company.contacts;
            if (typeof contacts === 'string') { try { contacts = JSON.parse(contacts); } catch(e) { contacts = []; } }
            if (contacts && contacts.length > 0) {
                const c = contacts.find(c => c[role]);
                if (c) return c.name || '';
            }
            return company.contact_name || '';
        }

