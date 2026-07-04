        // ===== UREN RENDER =====
        // Genereer time-opties in 15-min stappen (05:00 – 23:45)
        function generateTimeOptions(selected) {
            let html = '';
            for (let h = 5; h < 24; h++) {
                for (let m = 0; m < 60; m += 15) {
                    const val = h.toString().padStart(2, '0') + ':' + m.toString().padStart(2, '0');
                    html += '<option value="' + val + '"' + (val === selected ? ' selected' : '') + '>' + val + '</option>';
                }
            }
            return html;
        }

        function renderDays() {
            const container = document.getElementById('days-container');

            // Als er een weekSummary is: toon historische samenvatting i.p.v. dagkaarten
            if (weekSummary) {
                renderWeekSummary(container);
                return;
            }

            // Check of week bewerkbaar is (project start/einddatum en status)
            const weekStatus = getWeekStatus();
            if (!weekStatus.editable) {
                const showDownload = currentWeekDbStatus === 'verstuurd';
                container.innerHTML = `
                    <div style="text-align:center;padding:48px 24px;color:var(--muted)">
                        <div style="font-size:2.5rem;margin-bottom:12px">${weekStatus.icon}</div>
                        <div style="font-weight:700;font-size:1rem;color:var(--text);margin-bottom:6px">${weekStatus.reason}</div>
                        ${weekStatus.detail ? '<div style="font-size:0.85rem">' + weekStatus.detail + '</div>' : ''}
                        ${showDownload ? '<button onclick="downloadWeekstaat()" style="margin-top:20px;padding:14px 28px;font-size:0.95rem;background:var(--kts-blue);color:white;border:none;border-radius:12px;font-weight:600;cursor:pointer">📄 Weekstaat PDF downloaden</button>' : ''}
                    </div>`;
                document.getElementById('week-total').textContent = '';
                // Verberg knoppen
                const urenWrap = document.getElementById('save-uren-btn-wrap');
                const kostenWrap = document.getElementById('save-kosten-btn-wrap');
                if (urenWrap) urenWrap.style.display = 'none';
                if (kostenWrap) kostenWrap.style.display = 'none';
                const actionBtnsHide = document.getElementById('week-action-btns');
                if (actionBtnsHide) actionBtnsHide.style.display = 'none';
                return;
            }

            // Herstel knoppen zichtbaarheid
            const urenWrapShow = document.getElementById('save-uren-btn-wrap');
            if (urenWrapShow) urenWrapShow.style.display = '';

            let totalHours = 0;

            const DAY_ABBR = ['Ma','Di','Wo','Do','Vr','Za','Zo'];

            // Per-dag check: valt deze dag buiten project start/eind?
            // Returnt 'before' / 'after' / null (= binnen periode)
            function dayProjectStatus(dayIdx) {
                if (!currentProject) return null;
                const d = new Date(currentWeekMonday);
                d.setDate(d.getDate() + dayIdx);
                const dStr = toLocalDateStr(d);
                if (currentProject.start_date && dStr < currentProject.start_date) return 'before';
                if (currentProject.end_date && dStr > currentProject.end_date) return 'after';
                return null;
            }

            container.innerHTML = weekData.map((entry, i) => {
                totalHours += entry.hours;
                const isWeekend = i >= 5;
                const isDayOff = entry.dayOff;
                const isFilled = entry.hours > 0;
                const isExpanded = expandedDay === i;
                const projStatus = dayProjectStatus(i);
                const isOutsideProject = projStatus !== null;

                // Build badges (oude .day-badge styling blijft werken)
                let badges = '';
                if (isDayOff) {
                    badges += '<span class="day-badge" style="background:var(--app-warn-soft);color:var(--app-warn)">Vrij</span>';
                } else if (isFilled) {
                    if (userHasThuiswerk() && entry.thuiswerk) badges += '<span class="day-badge thuis">Thuis</span>';
                    if (userHasKm() && entry.km > 0) badges += '<span class="day-badge km">' + entry.km + ' km</span>';
                    if (userHasHotel() && entry.hotel) badges += '<span class="day-badge hotel">Hotel</span>';
                }

                // Fase 2 state-class voor day-card shell
                let stateClass = 'is-empty';
                if (isDayOff) stateClass = 'is-off';
                else if (isFilled) stateClass = 'is-filled';

                // Suffix bij dagnaam
                const dnameSuffix = isDayOff
                    ? '<span style="color:var(--app-ink-500);font-weight:500;margin-left:6px">· Niet gewerkt</span>'
                    : (isWeekend ? '<span style="color:var(--app-ink-400);font-weight:500;margin-left:6px">· Weekend</span>' : '');

                // Hours rendering
                const hoursHtml = isDayOff
                    ? '— u'
                    : (isFilled ? `${fmt(entry.hours)}<span class="app-unit"> u</span>` : '— u');

                // Times line (alleen bij filled, niet expanded)
                let timesHtml = '';
                if (isFilled && !isExpanded && entry.start && entry.end) {
                    let times = `<span>${entry.start} → ${entry.end}</span>`;
                    if (entry.breakMin > 0) times += `<span class="app-day-pause">· ${entry.breakMin} min pauze</span>`;
                    timesHtml = `<div class="app-day-times">${times}</div>`;
                }

                // Locatie + werkomschrijving (collapsed view)
                let locHtml = '';
                if (isFilled && !isExpanded && entry.location) {
                    locHtml = `<div class="app-day-times" style="color:var(--app-ink-500)"><span>📍 ${entry.location}</span></div>`;
                }
                let workHtml = '';
                if (isFilled && !isExpanded && entry.desc) {
                    workHtml = `<div class="app-day-work">${entry.desc}</div>`;
                }

                // Buiten projectperiode → render als locked card, geen click handler
                if (isOutsideProject) {
                    const projStartFmt = currentProject.start_date ? new Date(currentProject.start_date).toLocaleDateString('nl-NL') : '';
                    const projEndFmt   = currentProject.end_date   ? new Date(currentProject.end_date).toLocaleDateString('nl-NL') : '';
                    const reason = projStatus === 'before'
                        ? `Project start pas op ${projStartFmt}`
                        : `Project liep af op ${projEndFmt}`;
                    return `
                        <div class="day-card app-day-card is-locked ${isWeekend ? 'weekend-card' : ''}" style="cursor:not-allowed;opacity:0.7">
                            <div class="day-header app-day-top">
                                <div class="app-day-info">
                                    <span class="app-dnum">${getDATES()[i]}</span>
                                    <span class="app-dname" style="color:var(--app-ink-500)">${DAYS_FULL[i]}<span style="color:var(--app-ink-400);font-weight:500;margin-left:6px">· buiten projectperiode</span></span>
                                </div>
                                <div class="app-dhrs is-empty">— u</div>
                            </div>
                            <div class="app-day-times" style="color:var(--app-ink-400)"><span>🔒 ${reason}</span></div>
                        </div>`;
                }

                return `
                    <div class="day-card app-day-card ${stateClass} ${isExpanded ? 'expanded' : ''} ${isWeekend ? 'weekend-card' : ''}" onclick="toggleDay(${i})" style="cursor:pointer">
                        <div class="day-header app-day-top">
                            <div class="app-day-info">
                                <span class="app-dnum">${getDATES()[i]}</span>
                                <span class="app-dname">${DAYS_FULL[i]}${dnameSuffix}</span>
                            </div>
                            <div class="app-dhrs ${!isFilled ? 'is-empty' : ''}">${hoursHtml}</div>
                        </div>
                        ${timesHtml}
                        ${locHtml}
                        ${workHtml}
                        ${badges ? '<div class="day-badges" style="margin-top:6px">' + badges + '</div>' : ''}
                        <div class="day-form" onclick="event.stopPropagation()">
                            <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:${isDayOff?'var(--app-warn-soft)':'var(--app-bg-tint)'};border:1px solid ${isDayOff?'var(--app-warn-line)':'var(--app-line)'};border-radius:10px;cursor:pointer;margin-bottom:12px" onclick="event.stopPropagation();toggleDayOff(${i})">
                                <div style="width:20px;height:20px;border-radius:4px;border:2px solid ${isDayOff?'var(--app-warn)':'var(--app-line-strong)'};background:${isDayOff?'var(--app-warn)':'var(--app-surface)'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
                                    ${isDayOff ? '<span style="color:white;font-size:14px;font-weight:bold">✓</span>' : ''}
                                </div>
                                <div style="flex:1">
                                    <div style="font-weight:600;font-size:0.85rem;color:${isDayOff?'var(--app-warn)':'var(--app-ink-700)'}">🚫 Niet gewerkt</div>
                                    <div style="font-size:0.75rem;color:var(--app-ink-500)">Markeer als vrije dag (geen uren)</div>
                                </div>
                            </div>
                            <div style="${isDayOff ? 'display:none' : ''}">
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Start</label>
                                    <select onchange="updateEntry(${i},'start',this.value)" style="font-size:16px">
                                        <option value="">—</option>
                                        ${generateTimeOptions(entry.start)}
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label>Eind</label>
                                    <select onchange="updateEntry(${i},'end',this.value)" style="font-size:16px">
                                        <option value="">—</option>
                                        ${generateTimeOptions(entry.end)}
                                    </select>
                                </div>
                                <div class="form-group" style="flex:0.7">
                                    <label>Pauze</label>
                                    <select onchange="updateEntry(${i},'breakMin',this.value)" style="font-size:16px">
                                        <option value="0" ${entry.breakMin==0?'selected':''}>0:00</option>
                                        <option value="15" ${entry.breakMin==15?'selected':''}>0:15</option>
                                        <option value="30" ${entry.breakMin==30?'selected':''}>0:30</option>
                                        <option value="45" ${entry.breakMin==45?'selected':''}>0:45</option>
                                        <option value="60" ${entry.breakMin==60?'selected':''}>1:00</option>
                                        <option value="90" ${entry.breakMin==90?'selected':''}>1:30</option>
                                    </select>
                                </div>
                            </div>
                            <div class="form-group" style="margin-top:12px">
                                <label>Werkzaamheden beschrijving</label>
                                <textarea onchange="updateEntry(${i},'desc',this.value)" placeholder="Beschrijf hier de werkzaamheden van vandaag">${entry.desc}</textarea>
                            </div>
                            <div class="form-row" ${entry.thuiswerk ? 'style="display:none"' : ''}>
                                <div class="form-group">
                                    <label>Locatie</label>
                                    <input type="text" value="${entry.location||''}" placeholder="${currentProject && currentProject.default_location ? currentProject.default_location : 'Projectlocatie'}" onchange="updateEntry(${i},'location',this.value)">
                                </div>
                            </div>

                            <!-- TOGGLES: Thuiswerk + Hotel + Km (alleen tonen als project het toelaat) -->
                            <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">

                                <!-- Thuiswerk toggle (alleen als gebruiker thuiswerk mag) -->
                                ${userHasThuiswerk() ? '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:' + (entry.thuiswerk?'var(--app-ok-soft)':'var(--app-bg-tint)') + ';border:1px solid ' + (entry.thuiswerk?'var(--app-ok-line)':'var(--app-line)') + ';border-radius:10px;cursor:pointer" onclick="toggleThuiswerk(' + i + ')">' +
                                    '<div style="width:20px;height:20px;border-radius:4px;border:2px solid ' + (entry.thuiswerk?'var(--app-ok)':'var(--app-line-strong)') + ';background:' + (entry.thuiswerk?'var(--app-ok)':'var(--app-surface)') + ';display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
                                        (entry.thuiswerk ? '<span style="color:white;font-size:14px;font-weight:bold">✓</span>' : '') +
                                    '</div>' +
                                    '<div style="flex:1">' +
                                        '<div style="font-weight:600;font-size:0.85rem;color:' + (entry.thuiswerk?'var(--app-ok)':'var(--app-ink-700)') + '">🏠 Thuiswerk</div>' +
                                        '<div style="font-size:0.75rem;color:var(--app-ink-500)">' + (userHasKm() ? 'Geen reiskilometers' : 'Werken vanuit huis') + '</div>' +
                                    '</div>' +
                                '</div>' : ''}

                                <!-- Hotel toggle (alleen als gebruiker hotel mag en niet thuiswerk) -->
                                ${userHasHotel() && !entry.thuiswerk ? '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:' + (entry.hotel?'var(--app-info-soft)':'var(--app-bg-tint)') + ';border:1px solid ' + (entry.hotel?'var(--app-info-line)':'var(--app-line)') + ';border-radius:10px;cursor:pointer" onclick="toggleHotel(' + i + ')">' +
                                    '<div style="width:20px;height:20px;border-radius:4px;border:2px solid ' + (entry.hotel?'var(--kts-blue)':'var(--app-line-strong)') + ';background:' + (entry.hotel?'var(--kts-blue)':'var(--app-surface)') + ';display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
                                        (entry.hotel ? '<span style="color:white;font-size:14px;font-weight:bold">✓</span>' : '') +
                                    '</div>' +
                                    '<div style="flex:1">' +
                                        '<div style="font-weight:600;font-size:0.85rem;color:' + (entry.hotel?'var(--kts-blue)':'var(--app-ink-700)') + '">🏨 Hotelovernachting</div>' +
                                        '<div style="font-size:0.75rem;color:var(--app-ink-500)">Vast tarief ' + fmtEuro(HOTEL_RATE) + ' · km worden hotel↔project</div>' +
                                    '</div>' +
                                    '<div style="font-weight:700;font-size:0.9rem;color:' + (entry.hotel?'var(--kts-blue)':'var(--app-ink-400)') + '">' + fmtEuro(HOTEL_RATE) + '</div>' +
                                '</div>' : ''}

                                <!-- Km veld(en) -->
                                ${renderKmSection(entry, i)}
                            </div>
                            </div>

                            <!-- Knoppen BUITEN de verborgen wrapper hierboven · anders
                                 verdwijnt de Opslaan-knop zodra "Niet gewerkt" is
                                 aangevinkt en kan de dag niet opgeslagen worden -->
                            <div class="form-actions" style="flex-wrap:wrap;margin-top:12px">
                                <button class="btn btn-secondary btn-sm" onclick="clearDay(${i})">Wissen</button>
                                <button class="btn btn-primary btn-sm" onclick="saveDayEntry(${i})">Opslaan</button>
                                ${i < 6 ? '<button class="btn btn-sm" style="background:var(--app-info-soft);color:var(--app-info);border:1px solid var(--app-info-line);width:100%;margin-top:6px" onclick="copyDayToNext('+i+')">📋 Kopieer naar ' + DAYS_FULL[i+1] + '</button>' : ''}
                            </div>
                        </div>
                    </div>`;
            }).join('');

            const totalKmWeek = userHasKm() ? weekData.reduce((s,e) => s + (e.km||0), 0) : 0;
            const totalHotelWeek = userHasHotel() ? weekData.filter(e => e.hotel).length : 0;
            let weekTotalText = `Totaal: ${fmt(totalHours)} uur`;
            if (userHasKm() && totalKmWeek > 0) weekTotalText += ` · ${totalKmWeek} km`;
            if (userHasHotel() && totalHotelWeek > 0) weekTotalText += ` · ${totalHotelWeek}× 🏨`;
            document.getElementById('week-total').textContent = weekTotalText;
            renderOverview();
        }
        // renderSummary verwijderd 2026-05-14 · was lege no-op; info staat nu per dag in renderDays().

        // ===== EXPENSE RENDER =====
        function renderExpenses() {
            const listEl = document.getElementById('expense-list');
            if (!expEntries || expEntries.length === 0) {
                listEl.innerHTML = `
                <div class="app-empty">
                    <div class="app-empty-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2l1.5 4.5h9L18 2"/><path d="M3 6h18l-2 14a2 2 0 01-2 2H7a2 2 0 01-2-2L3 6z"/></svg>
                    </div>
                    <div class="app-empty-title">Nog geen kosten</div>
                    <div class="app-empty-desc">Voeg materialen, gereedschap of parkeerkosten toe via de + knop.</div>
                </div>`;
            } else {
                const rowsHtml = expEntries.map(e => `
                    <div class="app-action-row" style="cursor:default">
                        <div class="app-action-row-icon">
                            <span style="font-size:18px;line-height:1">${e.icon}</span>
                        </div>
                        <div class="app-action-row-text">
                            <div class="app-action-row-title">${escapeHtml(e.desc)}</div>
                            <div class="app-action-row-desc">${e.date} · ${e.catLabel}</div>
                        </div>
                        <div style="font-family:var(--app-font-mono);font-weight:700;font-size:14px;color:var(--app-ink-900);font-feature-settings:'tnum'">${fmtEuro(e.amount)}</div>
                        <button class="app-iconbtn is-danger" type="button" onclick="deleteExpense(${e.id})" aria-label="Verwijderen" title="Verwijderen">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6"/></svg>
                        </button>
                    </div>`).join('');
                listEl.innerHTML = `<div class="app-list-card" style="margin:0 0 12px">${rowsHtml}</div>`;
            }

            const totals = {};
            let total = 0;
            expEntries.forEach(e => { totals[e.cat] = (totals[e.cat] || 0) + e.amount; total += e.amount; });

            let html = '<div class="summary-title">Totaal deze week</div>';
            for (const [cat, amt] of Object.entries(totals)) {
                html += `<div class="summary-row"><span>${catLabels[cat]}</span><span class="summary-value">${fmtEuro(amt)}</span></div>`;
            }
            html += `<div class="summary-row total"><span>Totaal</span><span class="summary-value">${fmtEuro(total)}</span></div>`;
            document.getElementById('expense-summary').innerHTML = html;
        }

        // ===== UREN ACTIONS =====
        function toggleDay(i) {
            // Blokkeer expand voor dagen buiten project start/eind
            if (currentProject) {
                const d = new Date(currentWeekMonday);
                d.setDate(d.getDate() + i);
                const dStr = toLocalDateStr(d);
                if (currentProject.start_date && dStr < currentProject.start_date) {
                    showToast('🔒 Deze dag valt vóór de projectstart');
                    return;
                }
                if (currentProject.end_date && dStr > currentProject.end_date) {
                    showToast('🔒 Deze dag valt na het projecteinde');
                    return;
                }
            }
            expandedDay = expandedDay === i ? -1 : i;
            renderDays();
        }

        function toggleDayOff(i) {
            weekData[i].dayOff = !weekData[i].dayOff;
            if (weekData[i].dayOff) {
                weekData[i].start = ''; weekData[i].end = ''; weekData[i].breakMin = 0;
                weekData[i].hours = 0; weekData[i].km = 0; weekData[i].kmHeen = 0; weekData[i].kmTerug = 0;
                weekData[i].hotel = false; weekData[i].thuiswerk = false;
                weekData[i].desc = ''; weekData[i].location = '';
            }
            markDirty();
            renderDays();
        }

        function saveDayEntry(i) {
            const dag = weekData[i];
            const dagNamen = ['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag'];
            // Validatie: starttijd moet vóór eindtijd liggen
            if (dag.start && dag.end) {
                const [sh,sm] = dag.start.split(':').map(Number);
                const [eh,em] = dag.end.split(':').map(Number);
                if ((eh * 60 + em) <= (sh * 60 + sm)) {
                    showToast('⚠️ Eindtijd moet na starttijd liggen voor ' + dagNamen[i]);
                    return;
                }
            }
            // Validatie: werkzaamheden beschrijving verplicht
            if (dag.hours > 0 && !(dag.desc || '').trim()) {
                showToast('⚠️ Vul werkzaamheden beschrijving in voor ' + dagNamen[i]);
                return;
            }
            // Ga door naar volgende dag, of sluit bij zondag
            if (i < 6) {
                toggleDay(i + 1);
                showToast('✓ ' + dagNamen[i] + ' opgeslagen');
            } else {
                toggleDay(-1);
                showToast('✓ Opgeslagen');
            }
        }

        function toggleThuiswerk(i) {
            markDirty();
            const e = weekData[i];
            e.thuiswerk = !e.thuiswerk;
            if (e.thuiswerk) {
                e.hotel = false;
                e.km = 0;
                e.kmHeen = 0;
                e.kmTerug = 0;
                e.location = 'Thuis';
            } else {
                e.kmHeen = 0;
                e.kmTerug = 0;
                e.km = getUserKmRetour();
                e.location = currentProject && currentProject.default_location ? currentProject.default_location : '';
            }
            renderDays();
        }

        function toggleHotel(i) {
            markDirty();
            const e = weekData[i];
            e.hotel = !e.hotel;
            if (e.hotel) {
                // Bewaar originele km-waarden vóór hotel-aanpassing
                e._kmBackup = { km: e.km, kmHeen: e.kmHeen || 0, kmTerug: e.kmTerug || 0 };
                // Slim bepalen: was gisteren ook hotel?
                const prevHotel = i > 0 && weekData[i-1].hotel;
                if (prevHotel) {
                    // Vervolg hoteldag: hotel→project + project→hotel
                    e.kmHeen = KM_HOTEL_PROJECT;
                    e.kmTerug = KM_PROJECT_HOTEL;
                } else {
                    // Eerste hoteldag: thuis→project + project→hotel
                    e.kmHeen = getUserKmEnkel();
                    e.kmTerug = KM_PROJECT_HOTEL;
                }
                e.km = e.kmHeen + e.kmTerug;
            } else {
                // Herstel originele km-waarden als die er zijn
                if (e._kmBackup) {
                    e.km = e._kmBackup.km;
                    e.kmHeen = e._kmBackup.kmHeen;
                    e.kmTerug = e._kmBackup.kmTerug;
                    delete e._kmBackup;
                } else {
                    // Fallback: retour thuis↔project
                    e.kmHeen = 0;
                    e.kmTerug = 0;
                    e.km = getUserKmRetour();
                }
            }
            renderDays();
        }

        function updateEntry(i, field, value) {
            if (currentWeekDbStatus === 'verstuurd') { showToast('🔒 Verstuurde week kan niet meer worden aangepast'); return; }
            markDirty();
            const e = weekData[i];
            if (field === 'start') {
                e.start = value;
                // Auto-invul locatie als die nog leeg is
                if (value && !e.location) {
                    if (e.thuiswerk) {
                        e.location = 'Thuis';
                    } else if (currentProject && currentProject.default_location) {
                        e.location = currentProject.default_location;
                    }
                }
            }
            if (field === 'end') e.end = value;
            if (field === 'breakMin') e.breakMin = Math.max(0, parseInt(value) || 0);
            if (field === 'desc') e.desc = value;
            if (field === 'location') e.location = value;
            if (field === 'km') e.km = Math.max(0, parseInt(value) || 0);
            if (field === 'kmHeen') {
                e.kmHeen = Math.max(0, parseInt(value) || 0);
                e.km = e.kmHeen + (e.kmTerug || 0);
            }
            if (field === 'kmTerug') {
                e.kmTerug = Math.max(0, parseInt(value) || 0);
                e.km = (e.kmHeen || 0) + e.kmTerug;
            }
            if (field === 'hotel') e.hotel = value;

            // Tijdvalidatie
            if (e.start && e.end) {
                const [sh,sm] = e.start.split(':').map(Number);
                const [eh,em] = e.end.split(':').map(Number);
                const startMin = sh * 60 + sm;
                const endMin = eh * 60 + em;

                if (endMin <= startMin) {
                    // Eindtijd vóór of gelijk aan starttijd
                    e.hours = 0;
                    if (field === 'end' || field === 'start') {
                        showToast('⚠️ Eindtijd moet na starttijd liggen');
                    }
                } else {
                    const werkMin = endMin - startMin;
                    // Pauze mag niet langer zijn dan de werkduur
                    if (e.breakMin > werkMin) {
                        e.breakMin = werkMin;
                        showToast('⚠️ Pauze aangepast · kan niet langer zijn dan werktijd');
                    }
                    e.hours = Math.max(0, (werkMin - e.breakMin) / 60);
                }
            }
            // Tekstvelden debounced renderen, rest direct
            if (field === 'desc' || field === 'location') {
                // Update alleen het totaal direct (geen volledige rerender)
                const totalEl = document.getElementById('week-total');
                if (totalEl) {
                    const total = weekData.reduce((s, d) => s + d.hours, 0);
                    totalEl.textContent = 'Totaal: ' + fmt(total) + ' uur';
                }
            } else {
                renderDays();
            }
            // Auto-save naar localStorage
            autoSaveLocalDebounced();
        }

        function clearDay(i) {
            weekData[i] = { start: '', end: '', breakMin: 0, desc: '', location: '', km: 0, kmHeen: 0, kmTerug: 0, hotel: false, thuiswerk: false, dayOff: false, hours: 0 };
            // markDirty: zonder deze vlag werd een gewiste dag niet mee-opgeslagen
            // bij week-wissel/opslaan en kwam de oude invulling terug
            markDirty();
            renderDays();
        }

        function copyDayToNext(i) {
            if (i >= 6) return;
            weekData[i+1] = { ...weekData[i] };
            expandedDay = i+1;
            renderDays();
            showToast('✓ ' + DAYS_FULL[i] + ' gekopieerd naar ' + DAYS_FULL[i+1]);
        }

        function copyPreviousDay() {
            for (let i = 1; i < 5; i++) {
                if (weekData[i].hours === 0 && weekData[i-1].hours > 0) {
                    weekData[i] = { ...weekData[i-1] };
                    markDirty();
                    renderDays();
                    showToast(`✓ ${DAYS_FULL[i-1]} gekopieerd naar ${DAYS_FULL[i]}`);
                    return;
                }
            }
            showToast('Geen lege werkdag gevonden');
        }

        function fillStandard() {
            const kmEnkel = getUserKmEnkel();
            const kmRetour = getUserKmRetour();
            let filled = 0;
            for (let i = 0; i < 5; i++) {
                if (weekData[i].hours === 0) {
                    weekData[i] = { start: '07:00', end: '16:00', breakMin: 60, desc: '', location: '', km: kmRetour, kmHeen: kmEnkel, kmTerug: kmEnkel, hotel: false, thuiswerk: false, hours: 8 };
                    filled++;
                }
            }
            if (filled > 0) {
                markDirty();
                renderDays();
                showToast('✓ ' + filled + ' werkdag' + (filled > 1 ? 'en' : '') + ' gevuld (07:00–16:00, 1u pauze)');
            } else {
                showToast('Alle werkdagen zijn al gevuld');
            }
        }

        function fillMondayToWeek() {
            const mon = weekData[0];
            if (mon.hours === 0) { showToast('⚠️ Vul eerst maandag in'); return; }
            let filled = 0;
            for (let i = 1; i < 5; i++) {
                if (weekData[i].hours === 0) {
                    weekData[i] = { ...mon };
                    filled++;
                }
            }
            if (filled > 0) {
                markDirty();
                renderDays();
                showToast('✓ Maandag gekopieerd naar ' + filled + ' dag' + (filled > 1 ? 'en' : ''));
            } else {
                showToast('Alle werkdagen zijn al gevuld');
            }
        }

        // ===== DOCUMENT NUMMERING · VERWIJDERD 2026-07-03 =====
        // getNextDocumentNumber / saveDocumentNumber / loadDocumentNumbers /
        // exportDocumentNumbers zijn verwijderd: het document_numbers-schema en
        // de RPC bestonden niet in de database en niets riep ze nog aan. De
        // facturatie loopt via de invoices-tabel met eigen nummering.

        // ===== PDF GENERATIE =====
        const KTS_INFO = {
            naam: 'Kuijpers Technical Services BV',
            adres: 'Nieuwboerweg 2A',
            postcode: '1738BB Waarland',
            land: 'Nederland',
            kvk: '93410557',
            btw: 'NL866385368B01',
            iban: 'NL61 BUNQ 2113 3747 30',
            bic: 'BUNQNL2A',
            tel1: '+31 6 5106 3555',
            tel2: '+31 6 5123 9050',
            email: 'info@kuijpers-ts.nl',
            // Loonheffingsnummers voor detacheringsfacturen (vereist door eindklanten zoals
            // Levvel). Worden standaard meegenomen op de factuur · kunnen per project
            // worden uitgezet via projects.show_loonheffingen=false.
            loonheffingen: [
                { label: 'Loonheffingennummer KTDS Holding B.V.',         value: '866381557L01' },
                { label: 'Loonheffingennummer Kuijpers TD Holding B.V.',  value: '866381594L01' }
            ]
        };

        function getWeekDates() {
            return Array.from({length: 7}, (_, i) => {
                const d = new Date(currentWeekMonday);
                d.setDate(d.getDate() + i);
                return d;
            });
        }

        function fmtDate(d) {
            return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
        }

        function fmtEuroPdf(n) {
            return '€ ' + Number(n).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }

        // ===== PDF WATERMERK & VOETTEKST HELPERS =====
        // Watermerk op huidige pagina tekenen · roep aan VÓÓR content
        // Logo semi-transparant toevoegen
        function addPdfLogo(doc, logoB64, x, y, w, h) {
            if (!logoB64) return;
            try {
                const fmt = logoB64.includes('image/png') ? 'PNG' : 'JPEG';
                doc.addImage(logoB64, fmt, x, y, w, h);
            } catch(e) { console.warn('Logo toevoegen mislukt:', e); }
        }

        function addPdfWatermark(doc, isLandscape) {
            const pdfImages = window.KTS_PDF_IMAGES || {};
            // Gebruik het echte ronde tandwiel (512x512, vierkant) · niet het K-logo
            // Vorige implementatie gebruikte 'watermerk' (= K-logo, 3000x2318), wat aan
            // de onderkant een asymmetrische uitstulping toonde door de diagonale K-vorm.
            const wmData = pdfImages.tandwiel || null;
            if (!wmData) return;
            try {
                const pw = doc.internal.pageSize.getWidth();
                const ph = doc.internal.pageSize.getHeight();
                // Subtiele watermark · opacity 0.10 op alle PDFs
                // Portrait (inspectie/IO/factuur) groter dan landscape (weekstaat)
                const opacity = 0.10;
                const scale = isLandscape ? 0.55 : 0.75;
                const gState = new doc.GState({ opacity });
                doc.saveGraphicsState();
                doc.setGState(gState);
                // Tandwiel is vierkant (1:1)
                const wmW = pw * scale;
                const wmH = wmW;
                const wmX = (pw - wmW) / 2;
                const wmY = (ph - wmH) / 2;
                doc.addImage(wmData, 'PNG', wmX, wmY, wmW, wmH);
                doc.restoreGraphicsState();
            } catch(e) { console.warn('Watermerk fout:', e); }
        }

        // Voettekst op alle pagina's tekenen · roep aan NA content
        // docNumber: optioneel, wordt linksonder als 4e regel toegevoegd (bv. inspectienummer)
        function addPdfFooter(doc, isLandscape, docNumber) {
            const pageCount = doc.internal.getNumberOfPages();
            const ktsFooterBlue = [37, 92, 134]; // #255C86
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                const pw = doc.internal.pageSize.getWidth();
                const ph = doc.internal.pageSize.getHeight();
                const footY = ph - 15;
                const ml = 15;
                doc.setFontSize(7);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...ktsFooterBlue);
                doc.text('Kuijpers Technical Services B.V.', ml, footY);
                doc.text('Nieuwboerweg 2A', ml, footY + 3);
                doc.text('1738BB Waarland', ml, footY + 6);
                if (docNumber) {
                    doc.text(String(docNumber), ml, footY + 9);
                }
                const mr = 15;
                const rAlign = pw - mr;
                doc.text('KVK: 93410557', rAlign, footY, { align: 'right' });
                doc.text('BTW: NL866385368B01', rAlign, footY + 3, { align: 'right' });
                doc.text('info@kuijpers-ts.nl', rAlign, footY + 6, { align: 'right' });
                doc.text(`Pagina ${i} van ${pageCount}`, rAlign, footY + 9, { align: 'right' });
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(0, 0, 0);
            }
        }

        // Backwards-compatible wrapper (voor inspectie PDF etc.)
        function addPdfWatermarkAndFooter(doc, isLandscape) {
            // Watermerk op alle bestaande pagina's (achteraf, werkt als achtergrond niet over content heen)
            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                addPdfWatermark(doc, isLandscape);
            }
            addPdfFooter(doc, isLandscape);
        }

        // ===== WEEKSTAAT PDF (KTS huisstijl) =====
        // Adapter: verzamel weekstaat-data uit productie-globals
        function adaptWeekstaatDataFromGlobals() {
            const DAYS_FULL_LOCAL = ['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag'];
            const dates = (typeof getDATES === 'function') ? getDATES() : [];
            const days = (weekData || []).map((entry, i) => ({
                day: DAYS_FULL_LOCAL[i],
                date: dates[i] || '',
                // Defensieve slice naar 'HH:MM' · Postgres time-kolommen leveren 'HH:MM:SS'
                start: entry.start ? String(entry.start).slice(0, 5) : '',
                end:   entry.end   ? String(entry.end).slice(0, 5)   : '',
                breakMin: entry.breakMin || 0,
                hours: entry.hours || 0,
                desc: entry.desc || '',
                location: entry.location || '',
                km: entry.km || 0
            }));
            return {
                user: {
                    name: (currentUser && currentUser.name) || 'Onbekend',
                    email: (currentUser && currentUser.email) || '',
                    role: (currentUser && currentUser.role) || '',
                    // BV/eenmanszaak van de zzp · voor weekstaat-PDF "BV | Naam" weergave
                    zzpCompanyName: (currentUser && currentUser._zzpCompanyName) || ''
                },
                project: {
                    name: (currentProject && currentProject.name) || '',
                    project_code: (currentProject && currentProject.project_code) || '',
                    location: (currentProject && currentProject.location) || '',
                    client_name: (currentProject && currentProject.client_name) || ''
                },
                weekNumber: typeof currentWeekNumber !== 'undefined' ? currentWeekNumber : 0,
                year: typeof currentYear !== 'undefined' ? currentYear : new Date().getFullYear(),
                monday: typeof currentWeekMonday !== 'undefined' ? currentWeekMonday : new Date(),
                days: days,
                opmerkingen: typeof weekOpmerkingen !== 'undefined' ? (weekOpmerkingen || '') : '',
                // Extra kosten (expenses) · ook beschikbaar voor de PDF renderer.
                // expEntries is de globale array die door loadExpEntriesForWeek of de
                // Kosten-tab gevuld wordt.
                expenses: (typeof expEntries !== 'undefined' && Array.isArray(expEntries))
                    ? expEntries.map(e => ({
                        cat: e.cat || 'other',
                        catLabel: e.catLabel || e.cat || 'Overig',
                        desc: e.desc || '',
                        amount: parseFloat(e.amount) || 0
                    }))
                    : [],
                sign: {
                    zzpName: (signatureData && signatureData.zzpName) || (currentUser && currentUser.name) || '',
                    zzpDate: (signatureData && signatureData.zzpDate) || (signatureData && signatureData.zzp ? new Date().toLocaleDateString('nl-NL') : ''),
                    zzpImage: (signatureData && signatureData.zzp) || null,
                    clientName: (signatureData && signatureData.clientName) || '',
                    clientDate: (signatureData && signatureData.clientDate) || (signatureData && signatureData.client ? new Date().toLocaleDateString('nl-NL') : ''),
                    clientImage: (signatureData && signatureData.client) || null
                }
            };
        }

        // Weekstaat PDF generator · accepteert data + options, returned doc
        async function generateWeekstaatPdf(data, options = {}) {
            if (!window.jspdf) { showToast && showToast('⚠️ PDF library nog niet geladen'); return null; }
            const pdfImages = window.KTS_PDF_IMAGES || {};
            const KTS_LOGO_B64 = pdfImages.logo || null;
            const TANDWIEL = pdfImages.tandwiel || null;
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const pdfFont = doc.getFontList()['DaxlinePro'] ? 'DaxlinePro' : 'helvetica';

            const pw = 297, ph = 210, ml = 12, mr = 12, mt = 12, uw = pw - ml - mr;
            const ktsBlue = [7, 86, 127];
            const ktsAccent = [58, 156, 197];  // accent-light (#3A9CC5) · website match
            const ink900 = [15, 27, 45];
            const ink500 = [92, 102, 117];
            const ink400 = [138, 147, 161];
            const lineCol = [180, 180, 180];
            const lineColLight = [220, 220, 220];

            // Watermark · 1.2x groter (175 → 210mm). Op landscape A4 (210mm hoog) past
            // het tandwiel exact paginabreed: tanden raken net de boven- en onderrand
            // maar worden niet afgesneden, alle 8 tanden blijven gelijkmatig zichtbaar.
            if (TANDWIEL) {
                try {
                    const wmSize = 210;
                    doc.saveGraphicsState && doc.saveGraphicsState();
                    doc.setGState && doc.setGState(new doc.GState({ opacity: 0.08 }));
                    doc.addImage(TANDWIEL, 'PNG', (pw - wmSize) / 2, (ph - wmSize) / 2, wmSize, wmSize);
                    doc.restoreGraphicsState && doc.restoreGraphicsState();
                } catch (e) {}
            }

            let y = mt;

            // Header · tandwiel + WEEKSTAAT (links)
            // Naming: app, DB-tabel (week_status), filenames en knoppen gebruiken allemaal
            // "weekstaat" · dus ook de PDF-titel.
            doc.setFontSize(20);
            doc.setFont(pdfFont, 'bold');
            doc.setTextColor(...ktsBlue);
            const titleY = y + 6;
            const iconSize = 10;
            if (TANDWIEL) {
                try { doc.addImage(TANDWIEL, 'PNG', ml, titleY - iconSize + 3, iconSize, iconSize); } catch (e) {}
            }
            doc.text('WEEKSTAAT', ml + (TANDWIEL ? iconSize + 3 : 0), titleY);

            // Accent-light hairline onder de titel · website-stijl signature
            // (zoals .hero-tag border-bottom op kuijpers-ts.nl)
            const titleX = ml + (TANDWIEL ? iconSize + 3 : 0);
            const titleW = doc.getTextWidth('WEEKSTAAT');
            doc.setFillColor(...ktsAccent);
            doc.rect(titleX, titleY + 2, Math.min(titleW, 40), 0.8, 'F');

            // Logo + adres rechts (gecentreerd boven tekst)
            const logoW = 30.8;
            const logoH = logoW * (200 / 204);
            const addrLines = ['Nieuwboerweg 2A  |  1738BB Waarland', '+31 6 5123 9050  |  info@kuijpers-ts.nl'];
            doc.setFontSize(8);
            doc.setFont(pdfFont, 'normal');
            const widestW = Math.max(...addrLines.map(line => doc.getTextWidth(line)));
            const textRightX = pw - mr;
            const textCenterX = textRightX - widestW / 2;
            const logoX = textCenterX - logoW / 2;
            if (KTS_LOGO_B64) {
                try { doc.addImage(KTS_LOGO_B64, 'PNG', logoX, y - 2, logoW, logoH); } catch (e) {}
            }
            doc.setTextColor(...ink500);
            let addrY = y + logoH + 4;
            addrLines.forEach(line => {
                doc.text(line, pw - mr, addrY, { align: 'right' });
                addrY += 3.6;
            });
            const headerEndY = addrY;

            // Info-bar (links onder titel)
            y = mt + 14;
            const colA = ml, colB = ml + 95;
            doc.setFontSize(7.5);
            doc.setFont(pdfFont, 'bold');
            doc.setTextColor(...ktsAccent);     // eyebrow-stijl labels (website match)
            // Label "OPDRACHTNEMER" als zzp via BV werkt · dan tonen we "BV | Naam"
            // i.p.v. alleen de naam. "Opdrachtnemer" is in zzp-context het meer
            // toepasselijke label dan "naam".
            const showZzpCompany = !!(data.user.zzpCompanyName);
            const naamLabel = showZzpCompany ? 'OPDRACHTNEMER' : 'NAAM';
            const naamText = showZzpCompany
                ? `${data.user.zzpCompanyName}  |  ${data.user.name}`
                : data.user.name;
            doc.text(naamLabel, colA, y);
            doc.text('PERIODE', colB, y);
            doc.setFontSize(11);
            doc.setFont(pdfFont, 'bold');
            doc.setTextColor(...ink900);
            doc.text(naamText, colA, y + 5, { maxWidth: 90 });
            doc.text(`Week ${data.weekNumber}  ·  ${data.year}`, colB, y + 5);
            y += 10;
            doc.setFontSize(7.5);
            doc.setFont(pdfFont, 'bold');
            doc.setTextColor(...ktsAccent);     // eyebrow-stijl labels (website match)
            doc.text('PROJECT', colA, y);
            doc.text('OPDRACHTGEVER', colB, y);
            doc.setFontSize(10);
            doc.setFont(pdfFont, 'bold');
            doc.setTextColor(...ink900);
            doc.text(data.project.name + (data.project.project_code ? ` (${data.project.project_code})` : ''), colA, y + 5, { maxWidth: 90 });
            doc.text(data.project.client_name || '', colB, y + 5, { maxWidth: 90 });

            // Tabel
            y = Math.max(y + 8, headerEndY + 4);
            const cols = [
                { key:'day',     label:'DAG',          w: 22 },
                { key:'date',    label:'DATUM',        w: 22 },
                { key:'start',   label:'BEGINTIJD',    w: 18 },
                { key:'end',     label:'EINDTIJD',     w: 18 },
                { key:'breakMin',label:'PAUZE',        w: 16 },
                { key:'hours',   label:'GEW. UREN',    w: 20 },
                { key:'desc',    label:'WERKZAAMHEDEN',w: 98 },
                { key:'location',label:'LOCATIE',      w: 42 },
                { key:'km',      label:'KM',           w: 17 }
            ];
            const totalW = cols.reduce((s,c)=>s+c.w,0);
            const tableX = ml;
            const headerH = 7;
            const rowH = 10;
            const LEFT_ALIGN_KEYS = ['day', 'desc', 'location'];

            doc.setFillColor(...ktsBlue);
            doc.rect(tableX, y, totalW, headerH, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.setFont(pdfFont, 'bold');
            let cx = tableX;
            cols.forEach(c => {
                const align = LEFT_ALIGN_KEYS.includes(c.key) ? 'left' : 'center';
                const hx = align === 'left' ? cx + 2 : cx + c.w / 2;
                doc.text(c.label, hx, y + 4.5, { align });
                cx += c.w;
            });

            y += headerH;
            const fmtNum = (n) => {
                if (n === 0 || n == null) return '0';
                // 2 decimalen consistent met fmt() in de app
                return n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            };

            let totalHours = 0, totalKm = 0, weekdayHours = 0, satHours = 0, sunHours = 0;
            data.days.forEach((d, idx) => {
                const isWeekend = idx >= 5;
                if (idx % 2 === 1 && !isWeekend) {
                    doc.setFillColor(248, 248, 244);
                    doc.rect(tableX, y, totalW, rowH, 'F');
                }
                if (isWeekend) {
                    doc.setFillColor(245, 240, 230);
                    doc.rect(tableX, y, totalW, rowH, 'F');
                }
                doc.setDrawColor(...lineColLight);
                doc.setLineWidth(0.15);
                doc.line(tableX, y + rowH, tableX + totalW, y + rowH);

                cx = tableX;
                cols.forEach(c => {
                    let v = d[c.key];
                    if (c.key === 'breakMin' && v) v = v + ' min';
                    if (c.key === 'hours' && v) v = fmtNum(v) + ' u';
                    if (c.key === 'km' && v) v = v + ' km';
                    if (!v && v !== 0) v = '';
                    const align = LEFT_ALIGN_KEYS.includes(c.key) ? 'left' : 'center';
                    const tx = align === 'left' ? cx + 2 : cx + c.w / 2;
                    const ty = y + rowH / 2 + 1.5;
                    doc.setFontSize(9);
                    doc.setFont(pdfFont, 'normal');
                    doc.setTextColor(...ink900);
                    let txt = String(v);
                    if (c.key === 'desc' && txt.length > 78) txt = txt.substring(0, 75) + '...';
                    if (c.key === 'location' && txt.length > 32) txt = txt.substring(0, 29) + '...';
                    doc.text(txt, tx, ty, { align });
                    cx += c.w;
                });

                totalHours += d.hours || 0;
                totalKm += d.km || 0;
                if (idx === 5) satHours += d.hours || 0;
                else if (idx === 6) sunHours += d.hours || 0;
                else weekdayHours += d.hours || 0;
                y += rowH;
            });

            doc.setDrawColor(...lineColLight);
            cx = tableX;
            for (let i = 0; i <= cols.length; i++) {
                doc.line(cx, y - rowH * data.days.length - headerH, cx, y);
                if (i < cols.length) cx += cols[i].w;
            }
            doc.setDrawColor(...lineCol);
            doc.setLineWidth(0.3);
            doc.rect(tableX, y - rowH * data.days.length - headerH, totalW, headerH + rowH * data.days.length);

            // Summary KPI strip + opmerkingen
            y += 4;
            const kpis = [
                { label: 'REGULIER MA–VR', value: fmtNum(weekdayHours), unit: 'u',  accent: false },
                { label: 'ZATERDAG',       value: fmtNum(satHours),     unit: 'u',  accent: false },
                { label: 'ZONDAG/FEEST',   value: fmtNum(sunHours),     unit: 'u',  accent: false },
                { label: 'REIS KM',        value: (totalKm || 0).toLocaleString('nl-NL'), unit: 'km', accent: false },
                { label: 'TOTAAL TE FACTUREREN', value: fmtNum(totalHours), unit: 'uur', accent: true }
            ];
            const kpiW = 24;
            const kpiH = 26;
            const kpiTotalW = kpiW * kpis.length;
            let kx = ml;
            kpis.forEach((k) => {
                if (k.accent) {
                    doc.setFillColor(...ktsBlue);
                    doc.rect(kx, y, kpiW, kpiH, 'F');
                } else {
                    doc.setFillColor(248, 248, 244);
                    doc.rect(kx, y, kpiW, kpiH, 'F');
                    doc.setDrawColor(...lineColLight);
                    doc.setLineWidth(0.15);
                    doc.rect(kx, y, kpiW, kpiH);
                }
                doc.setFontSize(7);
                doc.setFont(pdfFont, 'normal');
                doc.setTextColor(...(k.accent ? [255,255,255] : ink400));
                doc.text(k.label, kx + kpiW/2, y + 5, { align: 'center', maxWidth: kpiW - 2 });
                doc.setFontSize(20);
                doc.setFont(pdfFont, 'bold');
                doc.setTextColor(...(k.accent ? [255,255,255] : ink900));
                doc.text(k.value, kx + kpiW/2, y + 18, { align: 'center' });
                doc.setFontSize(8);
                doc.setFont(pdfFont, 'normal');
                doc.setTextColor(...(k.accent ? [255,255,255] : ink500));
                doc.text(k.unit, kx + kpiW/2, y + 23, { align: 'center' });
                kx += kpiW;
            });

            const opmX = ml + kpiTotalW + 6;
            const opmW = pw - mr - opmX;
            // Bepaal of er extra kosten zijn · bepaalt cel-label en hoogte
            const hasExpenses = data.expenses && data.expenses.length > 0;
            const cellLabel = hasExpenses ? 'OPMERKINGEN & EXTRA KOSTEN' : 'OPMERKINGEN';

            doc.setFillColor(248, 248, 244);
            doc.rect(opmX, y, opmW, kpiH, 'F');
            doc.setFontSize(7);
            doc.setFont(pdfFont, 'normal');
            doc.setTextColor(...ink400);
            doc.text(cellLabel, opmX + 3, y + 5);

            // Bouw één lijst van regels: opmerking-tekst + expense-rijen
            const lines = [];
            if (data.opmerkingen) {
                const opmLines = doc.splitTextToSize(data.opmerkingen, opmW - 6);
                opmLines.forEach(l => lines.push({ text: l, kind: 'note' }));
            }
            if (hasExpenses) {
                const fmtAmt = (n) => '€ ' + (n || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                data.expenses.forEach(exp => {
                    const label = exp.catLabel || exp.cat;
                    const desc = exp.desc ? ' ' + exp.desc : '';
                    const txt = `• ${label}:${desc} ·${fmtAmt(exp.amount)}`;
                    // Wrap lange tekst zodat hij in de cel past
                    const wrapped = doc.splitTextToSize(txt, opmW - 6);
                    wrapped.forEach(l => lines.push({ text: l, kind: 'expense' }));
                });
            }

            // Render maximaal 5 regels (cel is 26mm hoog, regelhoogte 3.8mm)
            doc.setFontSize(8.5);
            const maxLines = Math.floor((kpiH - 7) / 3.8);
            lines.slice(0, maxLines).forEach((line, i) => {
                doc.setFont(pdfFont, line.kind === 'expense' ? 'normal' : 'normal');
                doc.setTextColor(...(line.kind === 'expense' ? ink500 : ink900));
                doc.text(line.text, opmX + 3, y + 9 + i * 3.8);
            });
            // Als er meer regels zijn dan past, toon "+ N meer"
            if (lines.length > maxLines) {
                doc.setFontSize(7);
                doc.setTextColor(...ink400);
                doc.text(`+ ${lines.length - maxLines} meer`, opmX + opmW - 18, y + kpiH - 2);
            }
            doc.setDrawColor(...lineColLight);
            doc.setLineWidth(0.15);
            doc.rect(opmX, y, opmW, kpiH);

            y += kpiH + 4;

            // Handtekening-boxen (met IMAGE-support)
            const sigBoxW = (uw - 6) / 2;
            const sigBoxH = 32;
            doc.setDrawColor(...lineCol);
            doc.setLineWidth(0.2);

            // Box 1: Opdrachtnemer
            doc.rect(ml, y, sigBoxW, sigBoxH);
            doc.setFontSize(8);
            doc.setFont(pdfFont, 'bold');
            doc.setTextColor(...ink400);
            doc.text('HANDTEKENING OPDRACHTNEMER', ml + 2, y + 3.5);
            if (data.sign && data.sign.zzpImage) {
                try { doc.addImage(data.sign.zzpImage, 'PNG', ml + 4, y + 5, sigBoxW - 8, sigBoxH - 14); } catch (e) {}
            }
            doc.setFont(pdfFont, 'normal');
            doc.setTextColor(...ink900);
            doc.setFontSize(9);
            doc.text((data.sign && data.sign.zzpName) || data.user.name, ml + 2, y + sigBoxH - 2);
            if (data.sign && data.sign.zzpDate) doc.text(data.sign.zzpDate, ml + sigBoxW - 2, y + sigBoxH - 2, { align: 'right' });

            // Box 2: Opdrachtgever
            const sig2x = ml + sigBoxW + 6;
            doc.rect(sig2x, y, sigBoxW, sigBoxH);
            doc.setFont(pdfFont, 'bold');
            doc.setTextColor(...ink400);
            doc.setFontSize(8);
            doc.text('HANDTEKENING OPDRACHTGEVER', sig2x + 2, y + 3.5);
            if (data.sign && data.sign.clientImage) {
                try { doc.addImage(data.sign.clientImage, 'PNG', sig2x + 4, y + 5, sigBoxW - 8, sigBoxH - 14); } catch (e) {}
            }
            doc.setFont(pdfFont, 'normal');
            doc.setTextColor(...ink900);
            doc.setFontSize(9);
            doc.text((data.sign && data.sign.clientName) || '', sig2x + 2, y + sigBoxH - 2);
            if (data.sign && data.sign.clientDate) doc.text(data.sign.clientDate, ml + uw - 2, y + sigBoxH - 2, { align: 'right' });

            // Footer
            doc.setFontSize(7);
            doc.setFont(pdfFont, 'normal');
            doc.setTextColor(...ink400);
            const footerY = ph - 5;
            doc.text('Op deze opdracht zijn de Algemene Voorwaarden Detachering 2026 van Kuijpers Technical Services BV van toepassing.', ml, footerY);
            doc.text('KvK 93410557  ·  BTW NL866385368B01', pw - mr, footerY, { align: 'right' });

            if (options.save) {
                const fileName = options.fileName || (typeof ktsWeekstaatName === 'function'
                    ? ktsWeekstaatName(data.year, data.weekNumber, data.user.name, (data.project && data.project.project_code) || '')
                    : `KTS-Weekstaat_${data.year}-W${String(data.weekNumber).padStart(2,'0')}.pdf`);
                doc.save(fileName);
            }
            return doc;
        }

        // Productie-wrapper: returned doc voor download/upload elders
        async function generateWeekstaat() {
            if (!window.jspdf) { showToast('⚠️ PDF library nog niet geladen'); return null; }
            const data = adaptWeekstaatDataFromGlobals();
            const doc = await generateWeekstaatPdf(data, { save: false });
            return doc;
        }

        // ===== DOWNLOAD FUNCTIES =====
        // ===== OPSLAGMAP (File System Access API) =====
        async function chooseSaveFolder(type) {
            if (!window.showDirectoryPicker) {
                showToast('⚠️ Je browser ondersteunt geen mapkiezer · gebruik Chrome of Edge');
                return;
            }
            try {
                const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
                if (type && savedFolderHandles.hasOwnProperty(type)) {
                    savedFolderHandles[type] = handle;
                    updateFolderUIByType(type, handle.name);
                    showToast(`✅ ${type.charAt(0).toUpperCase() + type.slice(1)} map: ${handle.name}`);
                } else {
                    // Legacy: enkele map voor alles
                    savedFolderHandle = handle;
                    updateFolderUI(handle.name);
                    showToast(`✅ Opslagmap: ${handle.name}`);
                }
            } catch (e) {
                if (e.name !== 'AbortError') console.error('Map kiezen mislukt:', e);
            }
        }

        function updateFolderUI(folderName) {
            const icon = document.getElementById('folder-icon');
            const label = document.getElementById('folder-label');
            const path = document.getElementById('folder-path');
            const picker = document.getElementById('folder-picker');
            if (icon) icon.textContent = '✅';
            if (label) label.textContent = folderName;
            if (path) path.textContent = 'PDF\'s worden hier opgeslagen';
            if (picker) { picker.style.borderColor = 'var(--kts-blue)'; picker.style.background = 'var(--app-info-soft)'; }
        }

        function updateFolderUIByType(type, folderName) {
            const el = document.getElementById('folder-' + type);
            if (el) {
                el.textContent = '✅ ' + folderName;
                el.style.color = 'var(--kts-blue)';
            }
        }

        // ===== DATABASE BACKUP =====
        // Volledige backup van alle Supabase tabellen + Storage buckets naar een door
        // de gebruiker gekozen lokale map (typisch OneDrive). Maakt een tijdgestempelde
        // submap met database.json + per-bucket subfolders + manifest.json + README.
        async function adminBackupSupabase() {
            if (!window.showDirectoryPicker) {
                showToast('⚠️ Je browser ondersteunt geen mapkiezer · gebruik Chrome of Edge');
                return;
            }
            const sb = getSupabase();
            if (!sb) { showToast('⚠️ Niet verbonden met database'); return; }

            let folderHandle;
            try {
                folderHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
            } catch (e) {
                if (e.name !== 'AbortError') showToast('⚠️ Map kiezen mislukt: ' + e.message);
                return;
            }

            const ok = await confirmAsync(
                `Backup maken naar map "${folderHandle.name}"?\n\nAlle tabellen + PDF's uit Storage worden gedownload.\nDit kan een paar minuten duren afhankelijk van de hoeveelheid data.`
            );
            if (!ok) return;

            // Tijdgestempelde submap aanmaken
            const now = new Date();
            const pad = n => String(n).padStart(2, '0');
            const stamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
            const backupName = `kts-backup-${stamp}`;
            let backupDir;
            try {
                backupDir = await folderHandle.getDirectoryHandle(backupName, { create: true });
            } catch (e) {
                showToast('⚠️ Submap aanmaken mislukt: ' + e.message);
                return;
            }

            const progress = showBackupProgress();
            const errors = [];

            // === DATABASE TABELLEN ===
            // Werkelijke tabellen · geverifieerd tegen pg_tables 2026-07-03.
            // Onbekende of niet-toegankelijke worden gelogd in manifest met
            // error · backup faalt niet op een enkele tabel.
            const TABLES = [
                'users', 'companies', 'projects', 'user_projects', 'fill_delegates',
                'time_entries', 'week_status', 'week_summaries', 'expenses', 'rates',
                'inkooporder_weeks', 'invoices', 'approvals',
                'inspection_templates', 'inspections', 'inspection_photos',
                'error_log', 'audit_log'
            ];
            const dbDump = { exportedAt: now.toISOString(), tables: {} };
            const tableCounts = {};
            let totalRecords = 0;
            for (const table of TABLES) {
                progress.update(`Tabel: ${table}…`);
                try {
                    const { data, error } = await sb.from(table).select('*');
                    if (error) {
                        // Onbekende tabel of RLS · niet fataal, maar wel loggen
                        dbDump.tables[table] = { error: error.message, rows: [] };
                        tableCounts[table] = { error: error.message, count: 0 };
                        continue;
                    }
                    dbDump.tables[table] = { count: data.length, rows: data };
                    tableCounts[table] = { count: data.length };
                    totalRecords += data.length;
                } catch (e) {
                    dbDump.tables[table] = { error: e.message, rows: [] };
                    tableCounts[table] = { error: e.message, count: 0 };
                }
            }

            progress.update('Database dump schrijven…');
            try {
                await backupWriteJson(backupDir, 'database.json', dbDump);
            } catch (e) {
                progress.close();
                showToast('⚠️ Database dump schrijven mislukt: ' + e.message);
                return;
            }

            // === STORAGE BUCKETS ===
            // Werkelijke bucketnamen · geverifieerd via storage.buckets 2026-07-02
            const BUCKETS = ['weekstaten', 'approvals', 'facturen', 'inkooporders', 'inspections'];
            const bucketCounts = {};
            let totalFiles = 0;
            for (const bucket of BUCKETS) {
                progress.update(`Storage: ${bucket}…`);
                try {
                    const bucketDir = await backupDir.getDirectoryHandle(bucket, { create: true });
                    const downloaded = await backupDownloadBucket(sb, bucket, bucketDir, progress);
                    bucketCounts[bucket] = { count: downloaded };
                    totalFiles += downloaded;
                } catch (e) {
                    // Bucket bestaat niet of geen rechten · overslaan
                    bucketCounts[bucket] = { count: 0, error: e.message };
                }
            }

            // === MANIFEST + README ===
            progress.update('Manifest schrijven…');
            const manifest = {
                backupName,
                exportedAt: now.toISOString(),
                appVersion: 'v213',
                totalRecords,
                totalFiles,
                tables: tableCounts,
                storage: bucketCounts
            };
            try {
                await backupWriteJson(backupDir, 'manifest.json', manifest);
                await backupWriteText(backupDir, 'README.md', backupBuildReadme(manifest));
            } catch (e) {
                progress.close();
                showToast('⚠️ Manifest schrijven mislukt: ' + e.message);
                return;
            }

            progress.close();
            showToast(`✅ Backup klaar · ${totalRecords} records + ${totalFiles} bestanden in ${backupName}`);
        }

        async function backupDownloadBucket(sb, bucket, dir, progress, prefix = '') {
            let count = 0;
            const { data: items, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000 });
            if (error) throw new Error(error.message);
            for (const item of (items || [])) {
                const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
                // Supabase storage: mappen hebben id===null, bestanden hebben een id.
                if (!item.id) {
                    try {
                        const safeFolderName = item.name.replace(/[<>:"/\\|?*]/g, '_');
                        const subDir = await dir.getDirectoryHandle(safeFolderName, { create: true });
                        count += await backupDownloadBucket(sb, bucket, subDir, progress, itemPath);
                    } catch (e) {
                        console.warn(`Submap ${bucket}/${itemPath} overgeslagen:`, e.message);
                    }
                } else {
                    progress.update(`Storage: ${bucket}/${itemPath}`);
                    try {
                        const { data, error: dlErr } = await sb.storage.from(bucket).download(itemPath);
                        if (dlErr) { console.warn(`Download ${bucket}/${itemPath}:`, dlErr.message); continue; }
                        const safeName = item.name.replace(/[<>:"/\\|?*]/g, '_');
                        await backupWriteBlob(dir, safeName, data);
                        count++;
                    } catch (e) {
                        console.warn(`Download error ${bucket}/${itemPath}:`, e.message);
                    }
                }
            }
            return count;
        }

        async function backupWriteJson(dir, name, obj) {
            const h = await dir.getFileHandle(name, { create: true });
            const w = await h.createWritable();
            await w.write(JSON.stringify(obj, null, 2));
            await w.close();
        }
        async function backupWriteText(dir, name, text) {
            const h = await dir.getFileHandle(name, { create: true });
            const w = await h.createWritable();
            await w.write(text);
            await w.close();
        }
        async function backupWriteBlob(dir, name, blob) {
            const h = await dir.getFileHandle(name, { create: true });
            const w = await h.createWritable();
            await w.write(blob);
            await w.close();
        }

        function backupBuildReadme(m) {
            const ts = new Date(m.exportedAt).toLocaleString('nl-NL');
            const tableLines = Object.entries(m.tables)
                .map(([t, info]) => info.error
                    ? `- ${t}: overgeslagen (${info.error})`
                    : `- ${t}: ${info.count} rijen`)
                .join('\n');
            const storageLines = Object.entries(m.storage)
                .map(([b, info]) => info.error
                    ? `- ${b}: niet beschikbaar`
                    : `- ${b}: ${info.count} bestanden`)
                .join('\n');
            return `# KTS Uren & Inspecties App · Backup ${m.backupName}

Gemaakt op: ${ts}
App-versie: ${m.appVersion}

## Inhoud
- ${m.totalRecords} database records
- ${m.totalFiles} storage-bestanden

## Tabellen
${tableLines}

## Storage
${storageLines}

## Bestanden in deze map
- database.json · alle tabellen als JSON
- manifest.json · samenvatting met aantallen
- weekstaten/, facturen/, inkooporders/, etc. · originele PDF's per bucket

## Restore
Als je data wilt terugzetten:
1. Voor database: open database.json en importeer per tabel via Supabase SQL editor of een Node.js script. Volg de volgorde: companies → users → projects → user_projects → rates → time_entries → week_status → expenses → invoices → inkooporders → inkooporder_weeks → inspecties.
2. Voor storage-bestanden: upload de mappen terug naar de bijbehorende Supabase Storage buckets met behoud van pad-structuur.

Tip: bewaar dit hele mapje veilig en let op dat OneDrive zelf ook versie-historie houdt.
`;
        }

        function showBackupProgress() {
            let overlay = document.getElementById('backup-progress-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'backup-progress-overlay';
                overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
                overlay.innerHTML = `
                    <div style="background:var(--app-surface);color:var(--text);padding:24px;border-radius:14px;min-width:280px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.4);border:1px solid var(--border)">
                        <div style="font-weight:700;font-size:1rem;margin-bottom:12px;display:flex;align-items:center;gap:8px">
                            <span style="font-size:1.2rem">📦</span> Backup wordt gemaakt…
                        </div>
                        <div id="backup-progress-msg" style="font-size:0.85rem;color:var(--muted);min-height:1.4em;word-break:break-all">Bezig…</div>
                        <div style="margin-top:14px;height:4px;background:var(--app-bg-deep);border-radius:2px;overflow:hidden;position:relative">
                            <div style="position:absolute;top:0;height:100%;background:var(--kts-accent-light);border-radius:2px;animation:bkpPulse 1.6s ease-in-out infinite"></div>
                        </div>
                        <style>@keyframes bkpPulse { 0% { left:-30%; width:30% } 50% { left:35%; width:40% } 100% { left:100%; width:30% } }</style>
                    </div>
                `;
                document.body.appendChild(overlay);
            }
            return {
                update: (msg) => {
                    const el = document.getElementById('backup-progress-msg');
                    if (el) el.textContent = msg;
                },
                close: () => { if (overlay && overlay.parentNode) overlay.remove(); }
            };
        }

        // Haal de juiste folder handle op voor een document type
        function getFolderHandle(type) {
            if (type && savedFolderHandles[type]) return savedFolderHandles[type];
            return savedFolderHandle; // fallback naar enkele map
        }

        async function savePdfToFolder(pdfDoc, fileName, type) {
            const handle = getFolderHandle(type);
            if (!handle) return false;
            try {
                const perm = await handle.queryPermission({ mode: 'readwrite' });
                if (perm !== 'granted') {
                    const req = await handle.requestPermission({ mode: 'readwrite' });
                    if (req !== 'granted') return false;
                }
                const fileHandle = await handle.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                const pdfBlob = pdfDoc.output('blob');
                await writable.write(pdfBlob);
                await writable.close();
                return true;
            } catch (e) {
                console.error('PDF opslaan mislukt:', e);
                return false;
            }
        }

        async function downloadWeekstaat() {
            // Laad expenses uit DB zodat ze in de PDF "Extra kosten"-sectie verschijnen
            const sbDw = getSupabase();
            if (sbDw && currentUser && currentProject) {
                await loadExpEntriesForWeek(sbDw, currentUser.id, currentProject.id, currentWeekNumber, currentYear);
            }
            const doc = await generateWeekstaat();
            if (doc) {
                const projCode = currentProject ? currentProject.project_code : 'KTS';
                const userName = currentUser ? currentUser.name.replace(/\s+/g,'_') : '';
                const fileName = ktsWeekstaatName(currentYear, currentWeekNumber, userName, projCode);
                const saved = await savePdfToFolder(doc, fileName, 'weekstaten');
                if (!saved) doc.save(fileName);
                showToast(saved ? '✓ Weekstaat opgeslagen in map' : '✓ Weekstaat gedownload');
            }
        }

        // VERWIJDERD 2026-07-02: hier stond een tweede (parameterloze) functie
        // downloadInkooporder() die de latere downloadInkooporder(path) op regel
        // ~13480 volledig overschaduwde (laatste declaratie wint in JS). De dode
        // versie gebruikte bovendien currentProject.code (bestaat niet · heet
        // project_code) en het legacy document_numbers-pad.

        // ===== HANDTEKENING CANVAS =====
        let signatureData = { zzp: null, client: null, clientName: '', clientEmail: '' };
        let _adminSignOverride = null; // als admin tekent namens een gebruiker
        // Staat aan zolang confirmSignatures() bezig is (PDF genereren, uploaden,
        // status schrijven). Onderscheidt "modal sluit omdat de flow loopt" van
        // "admin annuleert" · bij annuleren draait closeModal de identiteits-
        // wissel direct terug (zie closeModal in app-ui.js).
        let _signFlowBusy = false;
        const sigCanvases = {};
        const sigContexts = {};
        let sigDrawing = false;

        function initSignatureCanvas(type) {
            const canvas = document.getElementById('sig-canvas-' + type);
            if (!canvas) return;
            const ctx = canvas.getContext('2d');

            // Hi-DPI support
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);

            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            sigCanvases[type] = canvas;
            sigContexts[type] = ctx;

            // Guard tegen dubbele listeners: de modal kan meerdere keren geopend
            // worden en dit canvas-element blijft in de DOM bestaan. De maat/stijl-
            // reset hierboven moet elke keer, maar de listeners maar een keer ·
            // anders tekent elke mousemove dubbel/driedubbel. De oude closures
            // blijven geldig (zelfde canvas + zelfde 2d-context object).
            if (canvas._sigListenersAttached) {
                if (canvas._resetStrokes) canvas._resetStrokes();
                return;
            }
            canvas._sigListenersAttached = true;

            let drawing = false;
            let hasStrokes = false;

            function getPos(e) {
                const r = canvas.getBoundingClientRect();
                const touch = e.touches ? e.touches[0] : e;
                return { x: touch.clientX - r.left, y: touch.clientY - r.top };
            }

            function startDraw(e) {
                e.preventDefault();
                drawing = true;
                const p = getPos(e);
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
            }

            function draw(e) {
                if (!drawing) return;
                e.preventDefault();
                const p = getPos(e);
                ctx.lineTo(p.x, p.y);
                ctx.stroke();
                hasStrokes = true;
            }

            function endDraw(e) {
                if (!drawing) return;
                drawing = false;
                if (hasStrokes) {
                    // Sla signature op met compressie: downsize naar max 800px + JPEG
                    // (PNG signatures werden 1-2 MB elk, weekstaat-PDF werd daardoor 4 MB).
                    // JPEG q=0.75 op witte bg geeft ~50-150 KB per signature, visueel
                    // nauwelijks verschil voor handtekeningen.
                    try {
                        const tmp = document.createElement('canvas');
                        const targetW = Math.min(canvas.width, 800);
                        const scale = targetW / canvas.width;
                        tmp.width = targetW;
                        tmp.height = Math.round(canvas.height * scale);
                        const tctx = tmp.getContext('2d');
                        tctx.fillStyle = '#ffffff';
                        tctx.fillRect(0, 0, tmp.width, tmp.height);
                        tctx.drawImage(canvas, 0, 0, tmp.width, tmp.height);
                        signatureData[type] = tmp.toDataURL('image/jpeg', 0.75);
                    } catch (e) {
                        // Fallback bij browser-issue: gewoon PNG
                        signatureData[type] = canvas.toDataURL('image/png');
                    }
                    updateSignatureUI();
                }
            }

            // Muis events
            canvas.addEventListener('mousedown', startDraw);
            canvas.addEventListener('mousemove', draw);
            canvas.addEventListener('mouseup', endDraw);
            canvas.addEventListener('mouseleave', endDraw);

            // Touch events
            canvas.addEventListener('touchstart', startDraw, { passive: false });
            canvas.addEventListener('touchmove', draw, { passive: false });
            canvas.addEventListener('touchend', endDraw);

            // Store hasStrokes check
            canvas._hasStrokes = () => hasStrokes;
            canvas._resetStrokes = () => { hasStrokes = false; };
        }

        function toggleClientSignature() {
            const checked = document.getElementById('sig-client-toggle')?.checked;
            const section = document.getElementById('sig-client-section');
            if (section) section.style.display = checked ? 'block' : 'none';
            if (!checked) {
                // Wis client handtekening als checkbox uit gaat
                clearSignature('client');
                const nameEl = document.getElementById('sig-client-name');
                const emailEl = document.getElementById('sig-client-email');
                if (nameEl) nameEl.value = '';
                if (emailEl) emailEl.value = '';
            } else {
                // Init canvas als die nog niet klaar is
                setTimeout(() => initSignatureCanvas('client'), 100);
            }
        }

        function clearSignature(type) {
            const canvas = sigCanvases[type];
            const ctx = sigContexts[type];
            if (!canvas || !ctx) return;
            const dpr = window.devicePixelRatio || 1;
            ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
            signatureData[type] = null;
            if (canvas._resetStrokes) canvas._resetStrokes();
            updateSignatureUI();
        }

        function updateSignatureUI() {
            // ZZP status
            const zzpStatus = document.getElementById('sig-zzp-status');
            if (zzpStatus) {
                zzpStatus.textContent = signatureData.zzp ? '✓ Getekend' : 'Teken hierboven met je vinger of muis';
                zzpStatus.style.color = signatureData.zzp ? 'var(--green)' : 'var(--muted)';
            }

            // Bevestig-knop: actief als ZZP handtekening gezet
            const btn = document.getElementById('sig-confirm-btn');
            if (btn) {
                btn.disabled = !signatureData.zzp;
                btn.style.opacity = signatureData.zzp ? '1' : '0.5';
            }
        }

        function openSignatureModal() {
            if (!currentUser || !currentUser.id) { showToast('⚠️ Log in om te ondertekenen (niet beschikbaar in demo)'); return; }
            const weekStatus = getWeekStatus();
            if (!weekStatus.editable) { showToast('⚠️ ' + weekStatus.reason); return; }
            // Weekstaat moet eerst opgeslagen zijn
            if (!currentWeekDbStatus || currentWeekDbStatus === 'concept') {
                showToast('⚠️ Sla de weekstaat eerst op voordat je kunt ondertekenen');
                return;
            }
            const total = weekData.reduce((s,e) => s + e.hours, 0);
            if (total === 0) { showToast('⚠️ Vul eerst uren in'); return; }

            // Reset
            signatureData = { zzp: null, client: null };

            // Reset opdrachtgever checkbox en sectie
            const clientToggle = document.getElementById('sig-client-toggle');
            if (clientToggle) clientToggle.checked = false;
            const clientSection = document.getElementById('sig-client-section');
            if (clientSection) clientSection.style.display = 'none';

            document.getElementById('signature-modal').classList.add('active');

            // Init canvassen na modal open (nodig voor correcte afmetingen)
            setTimeout(() => {
                initSignatureCanvas('zzp');
                // Client canvas wordt pas geinitialiseerd als checkbox aan gaat
                updateSignatureUI();
            }, 100);
        }

        // Laad persistent opgeslagen extra kosten uit de expenses-tabel voor een
        // (user, project, week, year) en push ze naar de globale expEntries array.
        // Wordt aangeroepen vóór PDF-generatie zodat de "Extra kosten"-sectie op de
        // weekstaat-PDF gevuld wordt vanuit de DB (i.p.v. alleen vanuit de oude
        // in-memory Kosten-tab).
        async function loadExpEntriesForWeek(sb, userId, projectId, weekNumber, year) {
            if (!sb || !userId || !projectId || !weekNumber || !year) return;
            if (typeof expEntries === 'undefined' || !Array.isArray(expEntries)) return;
            try {
                let { data: exps, error: expErr } = await sb.from('expenses')
                    .select('cat, amount, description, entry_date, quantity, unit_price')
                    .eq('user_id', userId).eq('project_id', projectId)
                    .eq('week_number', weekNumber).eq('year', year);
                if (expErr && /quantity|unit_price/.test(expErr.message || '')) {
                    ({ data: exps } = await sb.from('expenses')
                        .select('cat, amount, description, entry_date')
                        .eq('user_id', userId).eq('project_id', projectId)
                        .eq('week_number', weekNumber).eq('year', year));
                }
                const labels = {
                    transport:'Transport', parkeren:'Parkeren', maaltijd:'Maaltijd',
                    meals:'Maaltijd', materiaal:'Materiaal', huur:'Huur',
                    tolheffing:'Tolheffingen', veerboot:'Veerboot',
                    doorbelasting:'Doorbelasting', other:'Overig'
                };
                // Vervang expEntries volledig met DB-data. Dit zorgt dat oude
                // in-memory entries van een andere week niet doorlekken.
                expEntries.length = 0;
                (exps || []).forEach((e, i) => {
                    let desc = e.description || '';
                    if (e.quantity && e.unit_price) {
                        const qtyStr = Number(e.quantity) % 1 === 0 ? Number(e.quantity).toString() : Number(e.quantity).toFixed(2);
                        const unitStr = '€' + Number(e.unit_price).toFixed(2).replace('.', ',');
                        if (!desc.includes('×') && !desc.toLowerCase().startsWith(qtyStr + ' ')) {
                            desc = `${qtyStr}× ` + desc + ` á ${unitStr}`;
                        }
                    }
                    expEntries.push({
                        id: 'db-' + i,
                        cat: e.cat || 'other',
                        catLabel: labels[e.cat] || 'Overig',
                        desc: desc,
                        amount: parseFloat(e.amount) || 0,
                        date: e.entry_date || '',
                        quantity: e.quantity || null,
                        unit_price: e.unit_price || null
                    });
                });
            } catch (e) { /* tabel/kolom niet aanwezig · fallback */ }
        }

        async function confirmSignatures() {
            if (!signatureData.zzp) { showToast('⚠️ ZZP\'er handtekening is verplicht'); return; }
            // Opmerkingen opslaan
            const opmEl = document.getElementById('sig-opmerkingen');
            if (opmEl) weekOpmerkingen = opmEl.value.trim();
            const btn = document.getElementById('sig-confirm-btn');
            if (btn) { btn.innerHTML = '⏳ Ondertekenen...'; btn.disabled = true; }
            // Flag AAN vóór het sluiten: de closeModal-hook mag de identiteits-
            // wissel (ondertekenen namens) nu niet terugdraaien · dat doet de
            // finally van deze flow zelf zodra alles is afgerond
            _signFlowBusy = true;
            closeModal('signature-modal');

            // Check of opdrachtgever ook getekend heeft
            const clientSigned = !!signatureData.client;
            const clientName = document.getElementById('sig-client-name')?.value?.trim() || '';
            const clientEmail = document.getElementById('sig-client-email')?.value?.trim() || '';
            // Bewaar in signatureData zodat generateWeekstaat() het kan gebruiken
            signatureData.clientName = clientName;
            signatureData.clientEmail = clientEmail;

            try {
                if (clientSigned) {
                    // Opdrachtgever heeft ter plekke getekend → direct goedgekeurd
                    await updateWeekStatus('verstuurd'); // eerst status op verstuurd

                    // Sla goedkeuring op in week_status
                    const sb = getSupabase();
                    if (sb && currentUser && currentProject) {
                        const token = crypto.randomUUID();
                        await sb.from('week_status')
                            .update({
                                approval_token: token,
                                approval_status: 'goedgekeurd',
                                approval_completed_at: new Date().toISOString(),
                                approver_name: clientName || 'Opdrachtgever (ter plekke)',
                                approver_email: clientEmail || null,
                                client_signature_url: signatureData.client
                            })
                            .eq('user_id', currentUser.id)
                            .eq('project_id', currentProject.id)
                            .eq('week_number', currentWeekNumber)
                            .eq('year', currentYear);
                    }

                    logAudit('week_ondertekend_goedgekeurd', {
                        week: currentWeekNumber,
                        approver: clientName || 'ter plekke',
                        approver_email: clientEmail
                    });
                    notifyOtherTabs();
                    showToast('✅ Week ' + currentWeekNumber + ' ondertekend & goedgekeurd · PDF wordt gegenereerd...');

                    // Automatisch PDF genereren + downloaden
                    try {
                        if (!window.jspdf) {
                            for (let w = 0; w < 10; w++) { await new Promise(r => setTimeout(r, 500)); if (window.jspdf) break; }
                        }
                        // Laad expenses uit DB zodat ze op de PDF verschijnen
                        if (sb && currentUser && currentProject) {
                            await loadExpEntriesForWeek(sb, currentUser.id, currentProject.id, currentWeekNumber, currentYear);
                        }
                        const weekstaat = await generateWeekstaat();
                        if (weekstaat) {
                            const projCode = currentProject ? currentProject.project_code : 'KTS';
                            const userName = currentUser ? currentUser.name.replace(/\s+/g,'_') : '';
                            const fileName = ktsWeekstaatName(currentYear, currentWeekNumber, userName, projCode);
                            const wsSaved = await savePdfToFolder(weekstaat, fileName, 'weekstaten');
                            if (!wsSaved) weekstaat.save(fileName);

                            // Backup naar Supabase Storage
                            try {
                                const pdfBase64 = weekstaat.output('datauristring').split(',')[1];
                                const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
                                const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
                                const storagePath = `${currentYear}/week-${currentWeekNumber}/${fileName}`;
                                await sb.storage.from('weekstaten').upload(storagePath, pdfBlob, { upsert: true, contentType: 'application/pdf' });
                            } catch(e) { console.warn('Storage backup overgeslagen:', e); }

                            showToast('✅ Weekstaat goedgekeurd & PDF gedownload');
                        }
                    } catch(pdfErr) { console.warn('PDF generatie na goedkeuring:', pdfErr); }

                    // Doorklik-flow: voor admins (zzp heeft geen IO-tab toegang).
                    // Twee scenarios:
                    //   A. Admin tekent in zijn eigen ZZP-modal (currentUser.role==='admin')
                    //   B. Admin tekent namens iemand anders (_adminSignOverride actief —
                    //      dan is currentUser de target zzp, niet de admin)
                    // In beide gevallen willen we de doorklik aanbieden.
                    const isAdminInOverride = !!(_adminSignOverride && _adminSignOverride.originalUser && _adminSignOverride.originalUser.role === 'admin');
                    const isAdminDirect = !!(currentUser && currentUser.role === 'admin');
                    if ((isAdminDirect || isAdminInOverride) && typeof askContinueAsync === 'function') {
                        // Bewaar target-info NU · in override-mode gaat currentUser
                        // straks bij restore weer terug naar de admin
                        const targetUserId = currentUser.id;
                        const targetProjectId = currentProject ? currentProject.id : null;
                        const targetWeek = currentWeekNumber;
                        const targetYear = currentYear;

                        try {
                            const wantIO = await askContinueAsync({
                                title: 'Weekstaat goedgekeurd',
                                message: `Week ${targetWeek}/${targetYear} is goedgekeurd door beide partijen.<br>Wil je nu direct een inkooporder voor deze week maken?`,
                                confirmLabel: 'Ja, naar inkooporder',
                                cancelLabel: 'Niet nu',
                                iconSvg: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#07567F" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>'
                            });
                            if (wantIO && typeof switchAdminTab === 'function') {
                                // In override-mode: zet eerst admin-state terug zodat switchAdminTab
                                // werkt (admin-tab is geen toegang voor target zzp). De finally-block
                                // doet dit anders zelf, maar dan ben ik al weg uit deze functie.
                                if (isAdminInOverride && typeof restoreAdminSignOverride === 'function') {
                                    restoreAdminSignOverride();
                                    if (typeof loadWeekstaten === 'function') loadWeekstaten();
                                }
                                // Maand uit ISO-week · gebruik bestaande helper i.p.v. setDate-magic
                                const monday = (typeof getWeekMondayFromWeekNumber === 'function')
                                    ? getWeekMondayFromWeekNumber(targetYear, targetWeek)
                                    : new Date(targetYear, 0, 1 + (targetWeek - 1) * 7);
                                const targetMonth = monday.getMonth() + 1;

                                switchAdminTab('inkooporders');
                                setTimeout(async () => {
                                    if (typeof loadInkooporderFilters === 'function') {
                                        await loadInkooporderFilters();
                                    }
                                    const projEl = document.getElementById('io-filter-project');
                                    const userEl = document.getElementById('io-filter-user');
                                    const yearEl = document.getElementById('io-filter-year');
                                    const monthEl = document.getElementById('io-filter-month');
                                    if (projEl && targetProjectId) projEl.value = targetProjectId;
                                    if (userEl && targetUserId) userEl.value = targetUserId;
                                    if (yearEl) yearEl.value = String(targetYear);
                                    // io-filter-month options gebruiken 2-digit zero-padded values
                                    if (monthEl) monthEl.value = String(targetMonth).padStart(2, '0');
                                    if (userEl && typeof autoFillCompanyForUser === 'function') autoFillCompanyForUser();
                                    const useWeekEl = document.getElementById('io-use-week');
                                    const weekWrap = document.getElementById('io-week-selector');
                                    const weekEl = document.getElementById('io-filter-week');
                                    if (useWeekEl) useWeekEl.checked = true;
                                    if (weekWrap) weekWrap.style.display = '';
                                    if (weekEl) {
                                        if (!Array.from(weekEl.options).some(o => String(o.value) === String(targetWeek))) {
                                            const opt = document.createElement('option');
                                            opt.value = targetWeek;
                                            opt.textContent = `Week ${targetWeek}`;
                                            weekEl.appendChild(opt);
                                        }
                                        weekEl.value = String(targetWeek);
                                    }
                                    if (typeof previewPO === 'function') previewPO();
                                }, 300);
                            }
                        } catch (e) { console.warn('Weekstaat→IO doorklik faalde:', e); }
                    }
                } else {
                    // Alleen ZZP'er getekend · direct ondertekenen + versturen in één stap
                    const sb = getSupabase();

                    // 1. Eerst opslaan naar Supabase · forceAllDays omdat de gebruiker
                    // de hele week formeel bevestigt door te ondertekenen
                    if (sb && currentUser && currentUser.id) {
                        await saveWeekToSupabase({ forceAllDays: true });
                    }

                    // 2. Wacht op jsPDF als die nog laadt
                    if (!window.jspdf) {
                        for (let w = 0; w < 10; w++) { await new Promise(r => setTimeout(r, 500)); if (window.jspdf) break; }
                    }

                    // 3. Laad expenses uit DB zodat ze op de PDF verschijnen
                    if (sb && currentUser && currentProject) {
                        await loadExpEntriesForWeek(sb, currentUser.id, currentProject.id, currentWeekNumber, currentYear);
                    }

                    // 4. Genereer PDF met handtekening
                    const weekstaat = await generateWeekstaat();
                    if (!weekstaat) throw new Error('PDF generatie mislukt');

                    const projCode = currentProject ? currentProject.project_code : 'KTS';
                    const userNameSlug = currentUser ? currentUser.name.replace(/\s+/g, '_') : '';
                    const fileName = ktsWeekstaatName(currentYear, currentWeekNumber, userNameSlug, projCode);

                    // 4. Download PDF lokaal
                    const wsSaved = await savePdfToFolder(weekstaat, fileName, 'weekstaten');
                    if (!wsSaved) weekstaat.save(fileName);

                    // 5. Backup naar Supabase Storage
                    if (sb) {
                        try {
                            const pdfBase64 = weekstaat.output('datauristring').split(',')[1];
                            const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
                            const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
                            const storagePath = `${currentYear}/week-${currentWeekNumber}/${fileName}`;
                            await sb.storage.from('weekstaten').upload(storagePath, pdfBlob, { upsert: true, contentType: 'application/pdf' });
                        } catch(e) { console.warn('Storage backup overgeslagen:', e); }

                        // 6. OneDrive upload (optioneel)
                        try {
                            const pdfBase64 = weekstaat.output('datauristring').split(',')[1];
                            const { data, error } = await sb.functions.invoke('submit-weekstaat', {
                                body: {
                                    pdfBase64: pdfBase64,
                                    fileName: fileName,
                                    weekNumber: currentWeekNumber,
                                    year: currentYear,
                                    userName: currentUser ? currentUser.name : 'Onbekend',
                                    projectCode: projCode,
                                    projectName: currentProject ? currentProject.name : ''
                                }
                            });
                            if (data && !error) {
                                console.log('OneDrive upload OK');
                            }
                        } catch(odErr) { console.warn('OneDrive upload overgeslagen:', odErr); }
                    }

                    // 7. Status op verstuurd
                    await updateWeekStatus('verstuurd');
                    logAudit('week_ondertekend_verstuurd', { week: currentWeekNumber });
                    notifyOtherTabs();

                    // 8. Geen notificatie-mail meer · de weekstaat staat vanaf nu
                    // (status 'verstuurd') direct in de app. De admin ziet 'm in
                    // Beheer > Weekstaten met een teller-badge op nieuwe binnenkomsten.
                    showToast('✅ Week ' + currentWeekNumber + ' ondertekend & verstuurd · PDF gedownload');
                }
                if (!_adminSignOverride) await renderOverview();
            } catch (err) {
                showToast('⚠️ Ondertekenen & versturen mislukt · probeer opnieuw');
                console.error('Sign+submit error:', err);
            } finally {
                _signFlowBusy = false;
                if (btn) { btn.innerHTML = 'Ondertekenen & versturen'; btn.disabled = false; }
                // Herstel globals als admin namens gebruiker tekende
                if (_adminSignOverride) {
                    restoreAdminSignOverride();
                    loadWeekstaten(); // admin lijst verversen
                }
            }
        }

        // ===== WEEK VERSTUREN =====
        async function submitWeek() {
            if (!currentUser || !currentUser.id) { showToast('⚠️ Log in om te versturen (niet beschikbaar in demo)'); return; }
            if (!signatureData.zzp) { showToast('⚠️ Onderteken eerst de week'); return; }
            // Weekstaat moet opgeslagen zijn
            if (!currentWeekDbStatus || currentWeekDbStatus === 'concept') {
                showToast('⚠️ Sla de weekstaat eerst op voordat je kunt versturen');
                return;
            }
            const total = weekData.reduce((s,e) => s + e.hours, 0);
            if (total === 0) { showToast('⚠️ Vul eerst uren in'); return; }
            if (!await confirmAsync(`Weet je zeker dat je week ${currentWeekNumber} wilt versturen?`)) return;

            const btn = document.getElementById('submit-week-btn') || document.getElementById('sign-week-btn');
            if (btn) { btn.innerHTML = '⏳ Versturen...'; btn.disabled = true; }

            try {
                // 1. Eerst opslaan naar Supabase · forceAllDays bij submitWeek
                // omdat de gebruiker de hele week verstuurd (definitief)
                if (getSupabase() && currentUser && currentUser.id) {
                    await saveWeekToSupabase({ forceAllDays: true });
                }

                // 2. Gegevens verzamelen
                const projCode = currentProject ? currentProject.project_code : 'KTS';
                const userName = currentUser ? currentUser.name : 'Onbekend';
                const projectName = currentProject ? currentProject.name : '';

                // 3. Wacht op jsPDF als die nog laadt
                if (!window.jspdf) {
                    if (btn) btn.innerHTML = '📄 PDF library laden...';
                    for (let w = 0; w < 10; w++) {
                        await new Promise(r => setTimeout(r, 500));
                        if (window.jspdf) break;
                    }
                }

                // 4. Laad expenses uit DB zodat ze op de PDF verschijnen
                const sbSubmit = getSupabase();
                if (sbSubmit && currentUser && currentProject) {
                    await loadExpEntriesForWeek(sbSubmit, currentUser.id, currentProject.id, currentWeekNumber, currentYear);
                }

                // 5. Genereer PDF met handtekeningen
                if (btn) btn.innerHTML = '📄 PDF genereren...';
                const weekstaat = await generateWeekstaat();
                if (!weekstaat) throw new Error('PDF generatie mislukt · herlaad de pagina en probeer opnieuw');

                const projCodeSubmit = currentProject ? currentProject.project_code : 'KTS';
                const fileName = ktsWeekstaatName(currentYear, currentWeekNumber, userName, projCodeSubmit);

                // 5. Download PDF lokaal (ZZP'er heeft geen OneDrive toegang)
                weekstaat.save(fileName);

                // 6. Upload naar Supabase Storage (backup) + OneDrive via Edge Function
                const sb = getSupabase();
                if (sb) {
                    const pdfBase64 = weekstaat.output('datauristring').split(',')[1];

                    // 6a. Supabase Storage backup
                    try {
                        if (btn) btn.innerHTML = '💾 PDF backup opslaan...';
                        const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
                        const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
                        const storagePath = `${currentYear}/week-${currentWeekNumber}/${fileName}`;
                        const { error: storageError } = await sb.storage.from('weekstaten').upload(storagePath, pdfBlob, { upsert: true, contentType: 'application/pdf' });
                        if (storageError) {
                            console.warn('Storage upload fout:', storageError.message);
                        } else {
                            console.log('PDF backup opgeslagen:', storagePath);
                        }
                    } catch (storageErr) {
                        console.warn('Supabase Storage upload overgeslagen:', storageErr.message);
                    }

                    // 6b. OneDrive upload (optioneel)
                    try {
                        if (btn) btn.innerHTML = '☁️ Uploaden naar OneDrive...';
                        const { data, error } = await sb.functions.invoke('submit-weekstaat', {
                            body: {
                                pdfBase64: pdfBase64,
                                fileName: fileName,
                                userName: userName,
                                weekNumber: currentWeekNumber,
                                year: currentYear,
                                projectName: projectName,
                            }
                        });
                        if (!error) {
                            showToast('✅ Ook opgeslagen in OneDrive');
                        }
                    } catch (uploadErr) {
                        console.warn('OneDrive upload overgeslagen:', uploadErr.message);
                    }
                }

                // 7. Status bijwerken
                await updateWeekStatus('verstuurd');
                logAudit('week_verstuurd', { week: currentWeekNumber, fileName: fileName });
                notifyOtherTabs();
                if (btn) { btn.innerHTML = '✅ Verstuurd!'; btn.style.background = '#059669'; }
                await renderOverview();

                // 8. Open vooringevulde email
                const mailSubject = encodeURIComponent('Weekstaat week ' + currentWeekNumber + '/' + currentYear + ' - ' + userName + ' - ' + projectName);
                const mailBody = encodeURIComponent(
                    'Beste KTS,\n\n' +
                    'Mijn weekstaat voor week ' + currentWeekNumber + ' is zojuist geüpload naar Onedrive.\n\n' +
                    'Medewerker: ' + userName + '\n' +
                    'Project: ' + projectName + '\n' +
                    'Week: ' + currentWeekNumber + ' / ' + currentYear + '\n' +
                    'Bestand: ' + fileName + '\n\n' +
                    'Met vriendelijke groet,\n' +
                    userName
                );
                window.location.href = 'mailto:uren@kuijpers-ts.nl?subject=' + mailSubject + '&body=' + mailBody;

                showToast('✅ Week ' + currentWeekNumber + ' verstuurd · PDF gedownload en email geopend');

            } catch (err) {
                console.error('Versturen mislukt:', err);
                if (btn) { btn.innerHTML = '✓ Week versturen'; btn.disabled = false; }
                showToast('⚠️ Versturen mislukt: ' + err.message);
            }
        }

        // ===== MAANDFACTUUR · VERWIJDERD 2026-07-03 =====
        // generateMonthlyInvoice() is verwijderd: de trigger-knop was al
        // uitgecommentarieerd en de functie leunde op het niet-bestaande
        // document_numbers-schema. Maandfacturen lopen via Beheer > Facturen.

        async function changeWeek(dir) {
            // Blokkeer navigatie als volgende week te ver in de toekomst is (niet voor admins)
            const isAdmin = currentUser && currentUser.role === 'admin';
            if (dir > 0 && !isAdmin) {
                const nextMonday = new Date(currentWeekMonday);
                nextMonday.setDate(nextMonday.getDate() + 7);
                const thisMonday = getWeekMonday(new Date());
                const maxMonday = new Date(thisMonday);
                maxMonday.setDate(maxMonday.getDate() + 14);
                if (nextMonday > maxMonday) {
                    showToast('🔮 Je kunt maximaal 2 weken vooruit werken');
                    return;
                }
            }

            // Blokkeer navigatie vóór startweek van gebruiker (niet voor admins)
            if (dir < 0 && !isAdmin && currentUser && currentUser.start_week && currentUser.start_year) {
                const sw = parseInt(currentUser.start_week);
                const sy = parseInt(currentUser.start_year);
                if (currentYear < sy || (currentYear === sy && currentWeekNumber <= sw)) {
                    showToast('⛔ Dit is je eerste week');
                    return;
                }
            }

            // Auto-save huidige week als er wijzigingen zijn
            if (weekDataDirty && getSupabase() && currentUser && currentUser.id) {
                try {
                    await saveWeekToSupabase();
                } catch (e) {
                    showToast('⚠️ Auto-save mislukt · wijzigingen niet opgeslagen');
                    console.error('Auto-save fout bij week wissel:', e);
                }
            }

            // Navigeer naar vorige/volgende week
            currentWeekMonday.setDate(currentWeekMonday.getDate() + (dir * 7));
            currentWeekNumber = getISOWeek(currentWeekMonday);
            currentYear = getISOYear(currentWeekMonday);

            // Sync overzicht-maand mee
            overviewMonth = currentWeekMonday.getMonth();
            overviewYear = currentWeekMonday.getFullYear();

            // Reset week data naar standaard
            weekData = defaultWeekData();
            weekSummary = null;
            signatureData = { zzp: null, client: null }; // Reset handtekening bij weekwissel
            expandedDay = -1;
            markClean();

            // Update label
            updateWeekLabel();

            // Laad data uit Supabase als ingelogd
            if (getSupabase() && currentUser && currentUser.id) {
                await loadWeekFromSupabase();
            }

            renderDays();
            renderOverview();
            updateClockUI();
            checkWeekReminder();
        }

        function updateWeekLabel() {
            const label = getWeekLabel();
            document.getElementById('week-label').textContent = label;
            const kostenLabel = document.getElementById('kosten-week-label');
            if (kostenLabel) kostenLabel.textContent = label;
            updateNavButtonStates();
        }

        function updateNavButtonStates() {
            // Max 2 weken vooruit (admins: geen limiet)
            const isAdmin = currentUser && currentUser.role === 'admin';
            const thisMonday = getWeekMonday(new Date());
            const maxMonday = new Date(thisMonday);
            maxMonday.setDate(maxMonday.getDate() + 14);
            const nextMonday = new Date(currentWeekMonday);
            nextMonday.setDate(nextMonday.getDate() + 7);
            const canGoNext = isAdmin || nextMonday <= maxMonday;

            // Startweek check: kan niet verder terug dan start_week/start_year
            let canGoPrev = true;
            if (!isAdmin && currentUser && currentUser.start_week && currentUser.start_year) {
                const sw = parseInt(currentUser.start_week);
                const sy = parseInt(currentUser.start_year);
                canGoPrev = currentYear > sy || (currentYear === sy && currentWeekNumber > sw);
            }

            // Week-knoppen
            ['week-next-btn', 'kosten-next-btn'].forEach(id => {
                const btn = document.getElementById(id);
                if (btn) {
                    btn.disabled = !canGoNext;
                    btn.style.opacity = canGoNext ? '1' : '0.3';
                    btn.style.background = canGoNext ? 'var(--kts-blue)' : '#b0bec5';
                }
            });
            ['week-prev-btn', 'kosten-prev-btn'].forEach(id => {
                const btn = document.getElementById(id);
                if (btn) {
                    btn.disabled = !canGoPrev;
                    btn.style.opacity = canGoPrev ? '1' : '0.3';
                    btn.style.background = canGoPrev ? 'var(--kts-blue)' : '#b0bec5';
                }
            });
        }

        // ===== EXPENSE ACTIONS =====
        function previewExpensePhoto(input) {
            if (!input.files || !input.files[0]) return;
            const file = input.files[0];
            const preview = document.getElementById('exp-photo-preview');
            const img = document.getElementById('exp-photo-img');
            const nameEl = document.getElementById('exp-photo-name');
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = e => { img.src = e.target.result; preview.style.display = 'block'; };
                reader.readAsDataURL(file);
            } else {
                img.src = '';
                preview.style.display = 'block';
            }
            nameEl.textContent = file.name;
        }

        function clearExpensePhoto() {
            document.getElementById('exp-photo-preview').style.display = 'none';
            document.getElementById('exp-photo-img').src = '';
            const cam = document.getElementById('exp-photo-camera');
            const fil = document.getElementById('exp-photo-file');
            if (cam) cam.value = '';
            if (fil) fil.value = '';
        }

        async function addExpense() {
            const cat = document.getElementById('exp-cat').value;
            const amount = parseFloat(document.getElementById('exp-amount').value);
            const desc = document.getElementById('exp-desc').value;
            if (!amount || !desc) { showToast('⚠️ Vul alle velden in'); return; }

            // Dubbel-klik bescherming: knop uit tijdens de async insert, anders
            // kan een snelle tweede klik dezelfde declaratie twee keer opslaan.
            const expSaveBtn = document.querySelector('#expense-modal [onclick="addExpense()"]');
            if (expSaveBtn) {
                if (expSaveBtn.disabled) return;
                expSaveBtn.disabled = true;
            }
            try {

            let invalidatedAfterChange = false;
            const sb = getSupabase();
            // Persistent: schrijf naar expenses-tabel als we ingelogd zijn op huidige
            // week/project. Anders fallback naar in-memory expEntries (bv. demo-modus).
            if (sb && currentUser && currentUser.id && currentProject && currentWeekNumber && currentYear) {
                try {
                    const record = {
                        user_id: currentUser.id,
                        project_id: currentProject.id,
                        week_number: currentWeekNumber,
                        year: currentYear,
                        cat: cat,
                        amount: amount,
                        description: desc,
                        created_by: currentUser.id
                    };
                    const { error } = await sb.from('expenses').insert(record);
                    if (error) {
                        if (/relation.*expenses.*does not exist/i.test(error.message || '')) {
                            console.warn('expenses-tabel niet aanwezig · voer migratie-expenses.sql uit. Fallback naar in-memory.');
                        } else {
                            console.warn('expense insert mislukt · fallback naar in-memory:', error.message);
                        }
                        // Fallback in-memory
                        expEntries.push({ id: expNextId++, cat, icon: catIcons[cat], desc, amount, date: todayLabel(), catLabel: catLabels[cat] });
                    } else {
                        // Reload expenses uit DB zodat in-memory cache klopt
                        await loadExpEntriesForWeek(sb, currentUser.id, currentProject.id, currentWeekNumber, currentYear);
                        // Als de weekstaat al ondertekend/goedgekeurd was: terug naar concept zodat
                        // de PDF/handtekening niet verouderd raakt door de nieuwe declaratie.
                        invalidatedAfterChange = await invalidateApprovalOnChange(currentUser.id, currentProject.id, currentWeekNumber, currentYear);
                    }
                } catch (e) {
                    console.warn('expense insert exception:', e);
                    expEntries.push({ id: expNextId++, cat, icon: catIcons[cat], desc, amount, date: todayLabel(), catLabel: catLabels[cat] });
                }
            } else {
                // Geen sb / niet ingelogd · pure in-memory (demo mode)
                expEntries.push({ id: expNextId++, cat, icon: catIcons[cat], desc, amount, date: todayLabel(), catLabel: catLabels[cat] });
            }

            renderExpenses();
            renderOverview();
            closeModal('expense-modal');
            if (invalidatedAfterChange) {
                showToast('✓ Declaratie toegevoegd · weekstaat teruggezet naar concept (opnieuw ondertekenen nodig)');
            } else {
                showToast('✓ Declaratie toegevoegd');
            }

            } finally {
                if (expSaveBtn) expSaveBtn.disabled = false;
            }
        }

        async function deleteExpense(id) {
            // Bij DB-load expenses krijgen ze id 'db-0', 'db-1', etc · moeten via cat+amount+desc
            // gematched worden. Bij in-memory expenses heb je een numeric id.
            const entry = expEntries.find(e => e.id === id);
            if (!entry) return;
            // Context vastleggen op het moment van klikken · de gebruiker kan
            // tijdens de undo-periode van week/project wisselen
            const ctx = {
                userId: currentUser && currentUser.id,
                projectId: currentProject && currentProject.id,
                weekNumber: currentWeekNumber,
                year: currentYear
            };

            // Optimistisch uit de lijst · de echte DB-delete volgt pas na de
            // undo-periode zodat een misklik nog te annuleren is
            expEntries = expEntries.filter(e => e.id !== id);
            renderExpenses();
            renderOverview();

            showUndoToast('🗑️ Declaratie verwijderd', async () => {
                // Definitief verwijderen uit de database
                const sb = getSupabase();
                let invalidatedAfterChange = false;
                if (sb && ctx.userId && ctx.projectId) {
                    try {
                        let q = sb.from('expenses').delete()
                            .eq('user_id', ctx.userId)
                            .eq('project_id', ctx.projectId)
                            .eq('week_number', ctx.weekNumber)
                            .eq('year', ctx.year)
                            .eq('cat', entry.cat)
                            .eq('amount', entry.amount);
                        if (entry.desc) q = q.eq('description', entry.desc);
                        const { error } = await q;
                        if (error && !/relation.*expenses.*does not exist/i.test(error.message || '')) {
                            console.warn('expense delete mislukt:', error.message);
                        } else if (!error) {
                            // Verwijderen van een declaratie verandert de inhoud van de
                            // weekstaat. Was deze al ondertekend/goedgekeurd? Dan terug
                            // naar concept.
                            invalidatedAfterChange = await invalidateApprovalOnChange(ctx.userId, ctx.projectId, ctx.weekNumber, ctx.year);
                        }
                    } catch (e) { /* fallback · alleen in-memory verwijderd */ }
                }
                if (invalidatedAfterChange) {
                    showToast('⚠️ Weekstaat teruggezet naar concept (opnieuw ondertekenen nodig)');
                }
            }, () => {
                // Geannuleerd: declaratie terugzetten in de lijst
                expEntries.push(entry);
                renderExpenses();
                renderOverview();
                showToast('↩️ Verwijderen geannuleerd');
            });
        }

