        // ===== ADMIN FUNCTIES =====
        // Test-modus volledig uitgefaseerd 2026-07-03: de app draait permanent
        // in productie. De is_test-kolommen bestaan nog in de database; de
        // filters op is_test !== true blijven als vangnet tegen zwerfdata.

        // Helper: actieve gebruikers voor lijsten/dropdowns.
        // Default: gearchiveerde EN gepauzeerde gebruikers worden verborgen.
        // Met opts.includeArchived=true worden gearchiveerden meegenomen · gebruikt
        // voor de beheer-lijst met "Toon ook gearchiveerd" toggle, en history-views.
        // Met opts.includePaused=true worden gepauzeerden meegenomen · voor de
        // beheer-lijst zodat admin ze kan zien om weer te activeren.
        function getFilteredUsers(opts) {
            const includeArchived = !!(opts && opts.includeArchived);
            const includePaused = !!(opts && opts.includePaused);
            return (window._adminUsers || []).filter(u => {
                if (u.is_test === true) return false;
                if (!includeArchived && u.archived_at) return false;
                if (!includePaused && u.paused_at) return false;
                return true;
            });
        }

        async function goToAdmin() {
            if (!currentUser || currentUser.role !== 'admin') {
                showToast('⚠️ Alleen voor beheerders');
                return;
            }
            document.getElementById('user-menu').style.display = 'none';
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            document.getElementById('screen-admin').classList.add('active');
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelector('.project-selector').style.display = 'none';
            showAdminTiles();
            // Promise bewaren zodat sub-flows (modals, dropdowns) erop kunnen
            // wachten; awaiten zodat de caches gegarandeerd vol zijn voordat de
            // gebruiker een lijst/modal opent. Scherm is al zichtbaar (tiles),
            // dus dit blokkeert de navigatie niet merkbaar.
            window._adminDataPromise = loadAdminData();
            await window._adminDataPromise;
        }

        function switchAdminTab(tab) {
            // Tegels verbergen, terugknop tonen
            const tiles = document.getElementById('admin-tiles');
            const backBar = document.getElementById('admin-back-bar');
            if (tiles) tiles.style.display = 'none';
            if (backBar) backBar.style.display = 'block';

            ['dashboard','projecten','personen','gebruikers','tarieven','bedrijf','inkooporders','facturen','weekstaten','insp-templates','insp-overzicht'].forEach(t => {
                const el = document.getElementById('admin-' + t);
                if (el) el.style.display = t === tab ? 'block' : 'none';
            });
            if (tab === 'dashboard') loadDashboard();
            if (tab === 'bedrijf') loadCompanySettings();
            if (tab === 'personen') loadCompanySettings();
            if (tab === 'inkooporders') { loadInkooporderFilters(); loadInkooporders(); }
            if (tab === 'facturen') { loadInvoiceFilters(); loadInvoices(); }
            if (tab === 'weekstaten') loadWeekstaten();
            if (tab === 'insp-templates') inspLoadTemplates();
            if (tab === 'insp-overzicht') inspLoadInspections();
        }

        function showAdminTiles() {
            const tiles = document.getElementById('admin-tiles');
            const backBar = document.getElementById('admin-back-bar');
            if (tiles) tiles.style.display = 'grid';
            if (backBar) backBar.style.display = 'none';
            ['dashboard','projecten','personen','gebruikers','tarieven','bedrijf','inkooporders','facturen','weekstaten','insp-templates','insp-overzicht'].forEach(t => {
                const el = document.getElementById('admin-' + t);
                if (el) el.style.display = 'none';
            });
        }

        // ===== INSTELLINGEN =====
        function getPaymentTermDays(companyId) {
            // Per bedrijf uit cache, fallback 30 dagen
            if (companyId && window._adminCompanies) {
                const comp = window._adminCompanies.find(c => c.id === companyId);
                if (comp && comp.payment_term_days) return parseInt(comp.payment_term_days, 10);
            }
            return 30;
        }
        function loadCompanySettings() {
            // Placeholder · instellingen worden nu per bedrijf opgeslagen
        }

        // ===== DASHBOARD FUNCTIES =====
        let _dashboardChart = null; // Chart.js instance

        // Sequence-teller om race conditions te voorkomen bij snel filteren:
        // alleen de laatste loadDashboard()-aanroep rendert. Vorige in-flight
        // requests detecteren dat hun mySeq is verlopen en stoppen stilletjes.
        let _loadDashboardSeq = 0;
        async function loadDashboard() {
            const sb = getSupabase();
            if (!sb) return;
            const mySeq = ++_loadDashboardSeq;

            const now = new Date();
            const currentYear = now.getFullYear();

            // Maand filter opzetten
            const monthFilter = document.getElementById('dashboard-month-filter');
            if (monthFilter && monthFilter.options.length === 0) {
                // "Heel jaar"-optie bovenaan, daaronder de maanden.
                // Default: huidige maand (zoals voor v172).
                const allOpt = document.createElement('option');
                allOpt.value = 'all';
                allOpt.textContent = 'Heel ' + currentYear;
                monthFilter.appendChild(allOpt);
                const MONTHS = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];
                MONTHS.forEach((m, i) => {
                    const opt = document.createElement('option');
                    opt.value = i;
                    opt.textContent = m + ' ' + currentYear;
                    if (i === now.getMonth()) opt.selected = true;
                    monthFilter.appendChild(opt);
                });
            }

            const filterVal = monthFilter?.value ?? String(now.getMonth());
            const isFullYear = filterVal === 'all';
            const selectedMonth = isFullYear ? -1 : parseInt(filterVal);
            const monthStart = isFullYear
                ? (currentYear + '-01-01')
                : toLocalDateStr(new Date(currentYear, selectedMonth, 1));
            const monthEnd = isFullYear
                ? (currentYear + '-12-31')
                : toLocalDateStr(new Date(currentYear, selectedMonth + 1, 0));
            const yearStart = currentYear + '-01-01';
            const yearEnd = currentYear + '-12-31';

            // Parallel data ophalen · explicit kolommen i.p.v. select('*') voor kleinere payloads
            const [entriesRes, yearEntriesRes, weekStatusRes, ioWeeksRes, ratesRes] = await Promise.all([
                sb.from('time_entries').select('entry_date, total_hours, km, hotel, project_id, user_id').gte('entry_date', monthStart).lte('entry_date', monthEnd),
                sb.from('time_entries').select('entry_date, total_hours, km, hotel, project_id, user_id').gte('entry_date', yearStart).lte('entry_date', yearEnd),
                sb.from('week_status').select('user_id, project_id, week_number, year, status, approval_status').eq('year', currentYear),
                sb.from('inkooporder_weeks').select('user_id, project_id, week_number, year, io_number').eq('year', currentYear),
                sb.from('rates').select('id, user_id, project_id, hourly_rate, km_rate, saturday_multiplier, sunday_holiday_multiplier, valid_from').order('valid_from', { ascending: false })
            ]);

            // Race-guard: er is een nieuwere loadDashboard()-aanroep gestart
            // (user heeft filter snel gewisseld) · stop deze stilletjes om
            // te voorkomen dat oude data over de nieuwe heen wordt gerenderd.
            if (mySeq !== _loadDashboardSeq) return;

            const allRates = ratesRes.data || [];
            // Dashboard toont HISTORISCHE financiële data · neem ook gepauzeerde
            // en afgesloten users mee zodat hun omzet uit voorgaande maanden
            // niet verdwijnt zodra ze worden geheractiveerd of permanent zijn.
            const users = getFilteredUsers({ includeArchived: true, includePaused: true });
            const filteredUserIds = new Set(users.map(u => u.id));
            const filteredProjects = (window._adminProjects || []).filter(p => p.is_test !== true);
            const filteredProjIds = new Set(filteredProjects.map(p => p.id));

            // Filter alle data op test/productie gebruikers EN projecten
            const weekStatuses = (weekStatusRes.data || []).filter(w => filteredUserIds.has(w.user_id) && (!w.project_id || filteredProjIds.has(w.project_id)));
            const ioWeeks = (ioWeeksRes.data || []).filter(p => filteredUserIds.has(p.user_id) && (!p.project_id || filteredProjIds.has(p.project_id)));
            const projects = filteredProjects.filter(p => p.status === 'active');

            // Alleen entries van definitieve weekstaten (verstuurd/goedgekeurd) meenemen
            const definitieveWeken = new Set();
            weekStatuses.forEach(ws => {
                if (ws.status === 'verstuurd') {
                    definitieveWeken.add(`${ws.user_id}_${ws.project_id}_${ws.week_number}_${ws.year}`);
                }
            });
            function isDefinitiefEntry(e) {
                if (!e.entry_date) return false;
                const wn = getISOWeek(new Date(e.entry_date + 'T12:00:00'));
                const yr = new Date(e.entry_date + 'T12:00:00').getFullYear();
                return definitieveWeken.has(`${e.user_id}_${e.project_id}_${wn}_${yr}`);
            }
            const monthEntries = (entriesRes.data || []).filter(e => filteredUserIds.has(e.user_id) && (!e.project_id || filteredProjIds.has(e.project_id)) && isDefinitiefEntry(e));
            const yearEntries = (yearEntriesRes.data || []).filter(e => filteredUserIds.has(e.user_id) && (!e.project_id || filteredProjIds.has(e.project_id)) && isDefinitiefEntry(e));

            // Rate lookup helper: user+project → rate, project → rate, default
            function getRate(userId, projectId) {
                const userRate = allRates.find(r => r.user_id === userId && r.project_id === projectId);
                if (userRate) return { hourly: parseFloat(userRate.hourly_rate) || 85, km: parseFloat(userRate.km_rate) || 0.50, sat: parseFloat(userRate.saturday_multiplier) || 1.5, sun: parseFloat(userRate.sunday_holiday_multiplier) || 2.0 };
                const projRate = allRates.find(r => !r.user_id && r.project_id === projectId);
                if (projRate) return { hourly: parseFloat(projRate.hourly_rate) || 85, km: parseFloat(projRate.km_rate) || 0.50, sat: parseFloat(projRate.saturday_multiplier) || 1.5, sun: parseFloat(projRate.sunday_holiday_multiplier) || 2.0 };
                return { hourly: 85, km: 0.50, sat: 1.5, sun: 2.0 };
            }

            // Omzet berekenen voor een set entries
            function calcRevenue(entries) {
                let total = 0;
                entries.forEach(e => {
                    const hours = parseFloat(e.total_hours) || 0;
                    const km = parseFloat(e.km) || 0;
                    const rate = getRate(e.user_id, e.project_id);
                    const dow = new Date(e.entry_date + 'T12:00:00').getDay();
                    if (dow === 6) total += hours * rate.hourly * rate.sat;
                    else if (dow === 0) total += hours * rate.hourly * rate.sun;
                    else total += hours * rate.hourly;
                    total += km * rate.km;
                });
                return total;
            }

            // Bewaar data voor Excel export
            window._dashboardExportData = { monthEntries, yearEntries, users, projects, calcRevenue, currentYear, selectedMonth, isFullYear };

            // Render alle secties
            renderDashboardStats(monthEntries, yearEntries, weekStatuses, ioWeeks, selectedMonth, currentYear, calcRevenue, isFullYear);
            renderDashboardChart(yearEntries, currentYear, calcRevenue);
            renderMedewerkerOverzicht(monthEntries, weekStatuses, users, selectedMonth, currentYear);
            renderProjectCards(monthEntries, projects, users, selectedMonth, currentYear, calcRevenue);
            renderPOStatus(weekStatuses, ioWeeks, users, projects, currentYear);
        }

        function renderDashboardStats(monthEntries, yearEntries, weekStatuses, ioWeeks, selectedMonth, year, calcRevenue, isFullYear) {
            const omzetMaand = calcRevenue(monthEntries);

            // Vorige maand
            const prevMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
            const prevYear = selectedMonth === 0 ? year - 1 : year;
            const prevStart = toLocalDateStr(new Date(prevYear, prevMonth, 1));
            const prevEnd = toLocalDateStr(new Date(prevYear, prevMonth + 1, 0));
            const prevEntries = yearEntries.filter(e => e.entry_date >= prevStart && e.entry_date <= prevEnd);
            const omzetVorig = calcRevenue(prevEntries);

            // Jaar totaal
            const omzetJaar = calcRevenue(yearEntries);

            // Totaal uren in periode
            const totalUren = monthEntries.reduce((s, e) => s + (parseFloat(e.total_hours) || 0), 0);

            // Openstaande weken (verstuurd maar nog niet op IO)
            const verstuurdeWeken = weekStatuses.filter(w => w.status === 'verstuurd');
            const ioWeekSet = new Set(ioWeeks.map(p => `${p.user_id}_${p.project_id}_${p.week_number}`));
            const openWeeks = verstuurdeWeken.filter(w => !ioWeekSet.has(`${w.user_id}_${w.project_id}_${w.week_number}`));

            // Wachtend op goedkeuring
            const pendingApprovals = weekStatuses.filter(w => w.approval_status === 'ter_goedkeuring');

            // Dynamische labels: jaar-view toont jaartotaal, maand-view toont maand
            const MONTHS_LONG = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];
            const urenLabel  = isFullYear ? `Uren ${year}`  : `Uren ${MONTHS_LONG[selectedMonth]}`;

            // Layout: grote tegel toont altijd JAARTOTAAL (overzicht-cijfer).
            // Daaronder 2 kleinere tegels naast elkaar:
            //   bij maand-filter: Vorige maand · Deze maand
            //   bij jaar-filter:  Gem. per maand · Actieve medewerkers
            const now = new Date();
            const maandenTotNu = (year === now.getFullYear()) ? (now.getMonth() + 1) : 12;
            const gemPerMaand = maandenTotNu > 0 ? (omzetJaar / maandenTotNu) : 0;
            const uniekeUsers = new Set(monthEntries.map(e => e.user_id)).size;

            const linksLabel = isFullYear ? 'Gem. per maand' : 'Vorige maand';
            const linksValue = isFullYear ? fmtEuro(gemPerMaand) : fmtEuro(omzetVorig);
            const rechtsLabel = isFullYear
                ? 'Actieve medewerkers'
                : `Omzet ${MONTHS_LONG[selectedMonth]}`;
            const rechtsValue = isFullYear ? String(uniekeUsers) : fmtEuro(omzetMaand);

            const el = document.getElementById('dashboard-stats');
            el.innerHTML = `
                <div class="stat-card highlight" style="grid-column:1/-1">
                    <div class="stat-value" style="color:white;font-size:1.8rem">${fmtEuro(omzetJaar)}</div>
                    <div class="stat-label" style="color:rgba(255,255,255,0.7)">Totaal ${year}</div>
                </div>
                <div class="stat-card" style="background:#1e40af;color:white">
                    <div class="stat-value" style="color:white">${linksValue}</div>
                    <div class="stat-label" style="color:rgba(255,255,255,0.7)">${linksLabel}</div>
                </div>
                <div class="stat-card" style="background:#059669;color:white">
                    <div class="stat-value" style="color:white">${rechtsValue}</div>
                    <div class="stat-label" style="color:rgba(255,255,255,0.7)">${rechtsLabel}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${fmt(totalUren)}</div>
                    <div class="stat-label">${urenLabel}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="${pendingApprovals.length > 0 ? 'color:#f59e0b' : 'color:#10b981'}">${pendingApprovals.length}</div>
                    <div class="stat-label">Wachtend op goedkeuring</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="${openWeeks.length > 0 ? 'color:#f59e0b' : 'color:#10b981'}">${openWeeks.length}</div>
                    <div class="stat-label">Weken zonder inkooporder</div>
                </div>
            `;
        }

        function renderDashboardChart(yearEntries, year, calcRevenue) {
            if (typeof Chart === 'undefined') {
                document.getElementById('dashboard-chart').parentElement.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.8rem">Chart.js wordt geladen...</div>';
                return;
            }

            const MONTHS_SHORT = ['Jan','Feb','Mrt','Apr','Mei','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
            const monthlyRevenue = [];

            for (let m = 0; m < 12; m++) {
                const mStart = toLocalDateStr(new Date(year, m, 1));
                const mEnd = toLocalDateStr(new Date(year, m + 1, 0));
                const mEntries = yearEntries.filter(e => e.entry_date >= mStart && e.entry_date <= mEnd);
                monthlyRevenue.push(calcRevenue(mEntries));
            }

            const canvas = document.getElementById('dashboard-chart');
            const ctx = canvas.getContext('2d');

            if (_dashboardChart) _dashboardChart.destroy();

            _dashboardChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: MONTHS_SHORT,
                    datasets: [{
                        label: 'Omzet',
                        data: monthlyRevenue,
                        backgroundColor: 'rgba(7, 86, 127, 0.85)',
                        borderColor: '#07567F',
                        borderWidth: 1,
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(ctx) { return '€ ' + ctx.parsed.y.toLocaleString('nl-NL', { minimumFractionDigits: 2 }); }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { callback: v => '€' + (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v), font: { size: 10 } },
                            grid: { color: 'rgba(0,0,0,0.05)' }
                        },
                        x: { ticks: { font: { size: 10 } }, grid: { display: false } }
                    }
                }
            });
        }

        function renderMedewerkerOverzicht(monthEntries, weekStatuses, users, selectedMonth, year) {
            const el = document.getElementById('dashboard-medewerkers');
            if (!users.length) { el.innerHTML = '<div style="color:var(--muted);font-size:0.8rem;text-align:center;padding:10px">Geen gebruikers</div>'; return; }

            // Per user: uren + weekstaat status
            let html = '';
            users.forEach(u => {
                const userEntries = monthEntries.filter(e => e.user_id === u.id);
                const userHours = userEntries.reduce((s, e) => s + (parseFloat(e.total_hours) || 0), 0);

                // Weekstaat status voor deze maand
                const userWeekStatuses = weekStatuses.filter(ws => ws.user_id === u.id);

                // Bepaal weken in deze maand (vanaf startdatum gebruiker)
                const firstDay = new Date(year, selectedMonth, 1);
                const lastDay = new Date(year, selectedMonth + 1, 0);
                const userStartDate = u.created_at ? new Date(u.created_at) : null;
                const userStartWeek = userStartDate ? getISOWeek(userStartDate) : 0;
                const userStartYear = userStartDate ? userStartDate.getFullYear() : 0;
                let weekBadges = '';
                let d = new Date(firstDay);
                const seenWeeks = new Set();
                while (d <= lastDay) {
                    const wn = getISOWeek(d);
                    if (!seenWeeks.has(wn)) {
                        seenWeeks.add(wn);
                        // Sla weken over die vóór de startdatum van de gebruiker vallen
                        if (userStartDate && (year < userStartYear || (year === userStartYear && wn < userStartWeek))) {
                            d.setDate(d.getDate() + 1);
                            continue;
                        }
                        const ws = userWeekStatuses.find(w => w.week_number === wn);
                        if (ws && ws.status === 'verstuurd') {
                            weekBadges += `<span style="display:inline-block;width:20px;height:20px;border-radius:4px;background:var(--app-ok-soft);color:var(--app-ok);font-size:0.6rem;text-align:center;line-height:20px;font-weight:700" title="Week ${wn}: verstuurd">${wn}</span>`;
                        } else if (ws && (ws.status === 'opgeslagen' || ws.status === 'ondertekend')) {
                            weekBadges += `<span style="display:inline-block;width:20px;height:20px;border-radius:4px;background:var(--app-warn-soft);color:var(--app-warn);font-size:0.6rem;text-align:center;line-height:20px;font-weight:700" title="Week ${wn}: ${ws.status}">${wn}</span>`;
                        } else {
                            weekBadges += `<span style="display:inline-block;width:20px;height:20px;border-radius:4px;background:var(--app-bg-deep);color:var(--muted);font-size:0.6rem;text-align:center;line-height:20px;font-weight:700" title="Week ${wn}: niet ingevuld">${wn}</span>`;
                        }
                    }
                    d.setDate(d.getDate() + 1);
                }

                // Laatst actief
                let actief = '';
                if (u.last_active_at) {
                    const diff = Math.floor((Date.now() - new Date(u.last_active_at).getTime()) / 60000);
                    if (diff < 5) actief = '<span style="color:#10b981;font-size:0.65rem">● Online</span>';
                    else if (diff < 60) actief = `<span style="color:var(--muted);font-size:0.65rem">${diff}m geleden</span>`;
                    else if (diff < 1440) actief = `<span style="color:var(--muted);font-size:0.65rem">${Math.floor(diff/60)}u geleden</span>`;
                    else actief = `<span style="color:var(--muted);font-size:0.65rem">${Math.floor(diff/1440)}d geleden</span>`;
                }

                html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
                    <div style="min-width:0">
                        <div style="font-weight:600;font-size:0.8rem;display:flex;align-items:center;gap:6px">${escapeHtml(u.name || u.email)} ${actief}</div>
                        <div style="display:flex;gap:2px;margin-top:4px;flex-wrap:wrap">${weekBadges}</div>
                    </div>
                    <div style="text-align:right;flex-shrink:0">
                        <div style="font-weight:700;font-size:0.9rem;color:var(--kts-blue)">${fmt(userHours)}</div>
                        <div style="font-size:0.65rem;color:var(--muted)">uren</div>
                    </div>
                </div>`;
            });

            el.innerHTML = html || '<div style="color:var(--muted);font-size:0.8rem;text-align:center;padding:10px">Geen data</div>';
        }

        function renderProjectCards(monthEntries, projects, users, selectedMonth, year, calcRevenue) {
            const el = document.getElementById('dashboard-projecten');
            if (!projects.length) { el.innerHTML = '<div style="color:var(--muted);font-size:0.8rem;text-align:center;padding:10px">Geen actieve projecten</div>'; return; }

            let html = '';
            projects.forEach(p => {
                const projEntries = monthEntries.filter(e => e.project_id === p.id);
                if (projEntries.length === 0) return; // Skip projecten zonder uren

                const totalHours = projEntries.reduce((s, e) => s + (parseFloat(e.total_hours) || 0), 0);
                const totalRevenue = calcRevenue(projEntries);
                const activeUsers = new Set(projEntries.map(e => e.user_id));

                // Medewerker namen
                const userNames = [...activeUsers].map(uid => {
                    const u = users.find(u => u.id === uid);
                    return u ? (u.name || u.email).split(' ')[0] : '?';
                }).join(', ');

                html += `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start">
                        <div>
                            <div style="font-weight:700;font-size:0.8rem;color:var(--kts-blue)">${escapeHtml(p.project_code)}</div>
                            <div style="font-size:0.75rem;color:var(--muted)">${escapeHtml(p.name)}</div>
                        </div>
                        <div style="text-align:right">
                            <div style="font-weight:700;font-size:0.85rem">${fmtEuro(totalRevenue)}</div>
                            <div style="font-size:0.65rem;color:var(--muted)">${fmt(totalHours)} · ${activeUsers.size} ${activeUsers.size === 1 ? 'persoon' : 'personen'}</div>
                        </div>
                    </div>
                    <div style="font-size:0.65rem;color:var(--muted);margin-top:2px">👤 ${userNames}</div>
                </div>`;
            });

            el.innerHTML = html || '<div style="color:var(--muted);font-size:0.8rem;text-align:center;padding:10px">Geen uren deze maand</div>';
        }

        function renderPOStatus(weekStatuses, ioWeeks, users, projects, year) {
            const el = document.getElementById('dashboard-io-status');

            // Groepeer per user + project
            const groups = {};
            weekStatuses.filter(ws => ws.status === 'verstuurd').forEach(ws => {
                const key = `${ws.user_id}_${ws.project_id}`;
                if (!groups[key]) groups[key] = { userId: ws.user_id, projectId: ws.project_id, weeks: {} };
                groups[key].weeks[ws.week_number] = { verstuurd: true, opPO: false };
            });

            // PO status markeren
            const ioSet = new Set(ioWeeks.map(p => `${p.user_id}_${p.project_id}_${p.week_number}`));
            Object.values(groups).forEach(g => {
                Object.keys(g.weeks).forEach(wn => {
                    if (ioSet.has(`${g.userId}_${g.projectId}_${wn}`)) {
                        g.weeks[wn].opPO = true;
                    }
                });
            });

            if (Object.keys(groups).length === 0) {
                el.innerHTML = '<div style="color:var(--muted);font-size:0.8rem;text-align:center;padding:10px">Geen verstuurde weekstaten</div>';
                return;
            }

            let html = '';
            Object.values(groups).forEach(g => {
                const user = users.find(u => u.id === g.userId);
                const project = projects.find(p => p.id === g.projectId);
                const userName = user ? (user.name || user.email).split(' ')[0] : '?';
                const projCode = project ? project.project_code : '?';

                const weekNums = Object.keys(g.weeks).map(Number).sort((a, b) => a - b);
                let weekDots = '';
                weekNums.forEach(wn => {
                    const w = g.weeks[wn];
                    if (w.opPO) {
                        weekDots += `<span style="display:inline-block;width:22px;height:22px;border-radius:4px;background:var(--app-info-soft);color:var(--app-info);font-size:0.6rem;text-align:center;line-height:22px;font-weight:700" title="Week ${wn}: op inkooporder">📋</span>`;
                    } else {
                        weekDots += `<span style="display:inline-block;width:22px;height:22px;border-radius:4px;background:var(--app-ok-soft);color:var(--app-ok);font-size:0.6rem;text-align:center;line-height:22px;font-weight:700" title="Week ${wn}: verstuurd, nog geen inkooporder">${wn}</span>`;
                    }
                });

                const openCount = weekNums.filter(wn => !g.weeks[wn].opPO).length;
                const statusText = openCount === 0
                    ? '<span style="color:#10b981;font-size:0.65rem">Alle weken op inkooporder</span>'
                    : `<span style="color:#f59e0b;font-size:0.65rem">${openCount} ${openCount === 1 ? 'week' : 'weken'} nog open</span>`;

                html += `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <div style="font-weight:600;font-size:0.8rem">${userName} · <span style="color:var(--kts-blue)">${projCode}</span></div>
                        ${statusText}
                    </div>
                    <div style="display:flex;gap:2px;margin-top:4px;flex-wrap:wrap">${weekDots}</div>
                </div>`;
            });

            el.innerHTML = html;
        }

        function exportDashboardExcel() {
            if (typeof XLSX === 'undefined') { showToast('⚠️ SheetJS wordt nog geladen'); return; }
            const d = window._dashboardExportData;
            if (!d) { showToast('⚠️ Laad eerst het dashboard'); return; }

            const wb = XLSX.utils.book_new();
            const MONTHS_NL = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];
            const periodLabel = d.isFullYear ? ('Heel ' + d.currentYear) : (MONTHS_NL[d.selectedMonth] + ' ' + d.currentYear);

            // Sheet 1: Uren per medewerker per project
            const urenRows = [];
            d.users.forEach(u => {
                const userEntries = d.monthEntries.filter(e => e.user_id === u.id);
                if (userEntries.length === 0) return;
                // Groepeer per project
                const projGroups = {};
                userEntries.forEach(e => {
                    const pid = e.project_id || 'geen';
                    if (!projGroups[pid]) projGroups[pid] = { hours: 0, km: 0, hotel: 0, omzet: 0 };
                    projGroups[pid].hours += parseFloat(e.total_hours) || 0;
                    projGroups[pid].km += parseFloat(e.km) || 0;
                    projGroups[pid].hotel += parseFloat(e.hotel) || 0;
                });
                Object.entries(projGroups).forEach(([pid, g]) => {
                    const proj = d.projects.find(p => p.id === pid);
                    const projEntries = userEntries.filter(e => (e.project_id || 'geen') === pid);
                    urenRows.push({
                        'Medewerker': u.name || u.email,
                        'Project': proj ? proj.project_code : '-',
                        'Projectnaam': proj ? proj.name : '-',
                        'Uren': Math.round(g.hours * 100) / 100,
                        'Km': Math.round(g.km),
                        'Hotel': Math.round(g.hotel),
                        'Omzet': Math.round(d.calcRevenue(projEntries) * 100) / 100
                    });
                });
            });
            if (urenRows.length > 0) {
                const ws1 = XLSX.utils.json_to_sheet(urenRows);
                ws1['!cols'] = [{wch:20},{wch:14},{wch:25},{wch:8},{wch:6},{wch:6},{wch:12}];
                XLSX.utils.book_append_sheet(wb, ws1, 'Uren ' + periodLabel);
            }

            // Sheet 2: Omzet per maand (jaarcijfers)
            const maandRows = [];
            for (let m = 0; m < 12; m++) {
                const mStart = toLocalDateStr(new Date(d.currentYear, m, 1));
                const mEnd = toLocalDateStr(new Date(d.currentYear, m + 1, 0));
                const mEntries = d.yearEntries.filter(e => e.entry_date >= mStart && e.entry_date <= mEnd);
                const mHours = mEntries.reduce((s, e) => s + (parseFloat(e.total_hours) || 0), 0);
                maandRows.push({
                    'Maand': MONTHS_NL[m],
                    'Uren': Math.round(mHours * 100) / 100,
                    'Omzet': Math.round(d.calcRevenue(mEntries) * 100) / 100
                });
            }
            const ws2 = XLSX.utils.json_to_sheet(maandRows);
            ws2['!cols'] = [{wch:12},{wch:8},{wch:12}];
            XLSX.utils.book_append_sheet(wb, ws2, 'Omzet ' + d.currentYear);

            // Sheet 3: Detail entries
            const detailRows = d.monthEntries.map(e => {
                const u = d.users.find(u => u.id === e.user_id);
                const p = d.projects.find(p => p.id === e.project_id);
                return {
                    'Datum': e.entry_date,
                    'Medewerker': u ? (u.name || u.email) : '-',
                    'Project': p ? p.project_code : '-',
                    'Omschrijving': e.description || '',
                    'Start': e.start_time || '',
                    'Eind': e.end_time || '',
                    'Uren': parseFloat(e.total_hours) || 0,
                    'Km': parseFloat(e.km) || 0,
                    'Hotel': parseFloat(e.hotel) || 0
                };
            }).sort((a, b) => a.Datum.localeCompare(b.Datum));
            if (detailRows.length > 0) {
                const ws3 = XLSX.utils.json_to_sheet(detailRows);
                ws3['!cols'] = [{wch:12},{wch:20},{wch:14},{wch:30},{wch:6},{wch:6},{wch:6},{wch:6},{wch:6}];
                XLSX.utils.book_append_sheet(wb, ws3, 'Detail ' + periodLabel);
            }

            const fileName = 'KTS_Dashboard_' + periodLabel.replace(/\s+/g, '_') + '.xlsx';
            XLSX.writeFile(wb, fileName);
            showToast('✓ ' + fileName + ' gedownload');
        }

        async function loadAdminData() {
            const sb = getSupabase();
            if (!sb) { showToast('⚠️ Niet verbonden met database'); return; }

            // Projecten laden
            const { data: projects } = await sb.from('projects').select('*, client_company_id(id, name, email, contact_name), io_company_id').order('created_at', { ascending: false });
            window._adminProjects = projects || [];
            const filteredProjects = (projects || []).filter(p => p.is_test !== true);
            const projList = document.getElementById('admin-project-list');
            if (filteredProjects && filteredProjects.length > 0) {
                projList.innerHTML = filteredProjects.map((p) => {
                    const idx = (window._adminProjects || []).indexOf(p);
                    return `
                    <div class="entry-card" style="flex-direction:column;align-items:stretch;gap:6px;cursor:pointer" onclick="openAdminModal('project', ${idx})">
                        <div style="display:flex;justify-content:space-between;align-items:center">
                            <div>
                                <div style="font-weight:700;font-size:0.9rem">${escapeHtml(p.name)}${p.is_test ? ' <span style="background:var(--app-warn-soft);color:var(--app-warn);padding:1px 6px;border-radius:4px;font-size:0.6rem;font-weight:700;vertical-align:middle">TEST</span>' : ''}</div>
                                <div style="font-size:0.75rem;color:var(--muted)">${escapeHtml(p.project_code)} · ${escapeHtml(p.location || '')} · ${escapeHtml(p.client_name || '')}</div>
                            </div>
                            <span class="status-badge ${p.status === 'active' ? 'status-approved' : 'status-draft'}">${p.status}</span>
                        </div>
                    </div>`;
                }).join('');
            } else {
                projList.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.85rem">Geen projecten gevonden</div>';
            }

            // Actieve gebruikers laden
            const { data: appUsers } = await sb.from('users').select('*').order('name');
            window._adminUsers = appUsers || [];
            const userList = document.getElementById('admin-user-list');
            // Toggle "Toon afgesloten" bepaalt of afgesloten users meegenomen worden.
            // Gepauzeerde gebruikers altijd tonen in de beheer-lijst (anders kan admin
            // ze niet weer activeren); voor andere screens worden ze wel verborgen.
            const showArchivedUsers = document.getElementById('admin-show-archived-users')?.checked || false;
            const filteredUsers = getFilteredUsers({ includeArchived: showArchivedUsers, includePaused: true });

            // Tel afgesloten users in dezelfde test/productie-modus zodat de toggle
            // toont "🔒 Toon afgesloten (3)" · admin ziet hoeveel er te heractiveren zijn.
            const archivedCount = (window._adminUsers || []).filter(u => {
                if (u.is_test === true) return false;
                return !!u.archived_at;
            }).length;
            const countEl = document.getElementById('admin-archived-count');
            if (countEl) countEl.textContent = archivedCount > 0 ? `(${archivedCount})` : '';
            if (filteredUsers && filteredUsers.length > 0) {
                userList.innerHTML = filteredUsers.map((u) => {
                    const idx = (window._adminUsers || []).indexOf(u);
                    const flags = [];
                    if (u.allow_km !== false) flags.push('Km');
                    if (u.allow_thuiswerk !== false) flags.push('Thuis');
                    if (u.allow_hotel !== false) flags.push('Hotel');
                    if (u.show_rates !== false) flags.push('Tarieven');
                    if (u.can_declare_expenses !== false) flags.push('Declaraties');
                    if (u.allow_inspecties) flags.push('Inspecties');
                    if (u.allow_administratie) flags.push('Administratie');
                    const flagsHtml = flags.map(f => '<span style="background:var(--app-info-soft);color:var(--app-info);padding:1px 6px;border-radius:4px;font-size:0.65rem">' + f + '</span>').join(' ');
                    const priceInfo = [];
                    if (u.km_single_trip) priceInfo.push(u.km_single_trip + ' km');
                    if (u.hotel_rate) priceInfo.push('€' + u.hotel_rate + '/nacht');
                    // Laatst actief berekenen
                    let laatstActief = 'Nog niet ingelogd';
                    const loginTs = u.last_active_at;
                    if (loginTs) {
                        const d = new Date(loginTs);
                        const nu = new Date();
                        const diffMs = nu - d;
                        const diffMin = Math.floor(diffMs / 60000);
                        const diffUur = Math.floor(diffMs / 3600000);
                        const diffDag = Math.floor(diffMs / 86400000);
                        if (diffMin < 5) laatstActief = 'Nu actief';
                        else if (diffMin < 60) laatstActief = diffMin + ' min geleden';
                        else if (diffUur < 24) laatstActief = diffUur + ' uur geleden';
                        else if (diffDag < 7) laatstActief = diffDag + ' dag' + (diffDag > 1 ? 'en' : '') + ' geleden';
                        else laatstActief = d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
                    }
                    const isNuActief = laatstActief === 'Nu actief';
                    const activityColor = isNuActief ? '#059669' : 'var(--muted)';
                    const activityDot = isNuActief ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#059669;margin-right:3px"></span>' : '';

                    // Archief/pauze/anonymisering badges + actie-knoppen.
                    const isArchived = !!u.archived_at;
                    const isPaused = !!u.paused_at;
                    const isAnonymized = !!u.anonymized_at;
                    // Volgorde is essentieel: EERST backslash-escapen voor de
                    // JS-string context, DAN escapeHtml voor het attribuut. De HTML-
                    // parser decodeert &#039; terug naar ' voordat de onclick-JS
                    // geparsed wordt · andersom breekt een naam met apostrof de handler.
                    const safeName = escapeHtml((u.name || u.email || '').replace(/'/g, "\\'"));
                    const testBadge = u.is_test ? ' <span style="background:var(--app-warn-soft);color:var(--app-warn);padding:1px 6px;border-radius:4px;font-size:0.6rem;font-weight:700;vertical-align:middle">TEST</span>' : '';
                    const archivedBadge = isArchived ? ' <span style="background:var(--app-idle-soft);color:var(--muted);padding:1px 6px;border-radius:4px;font-size:0.6rem;font-weight:700;vertical-align:middle" title="Afgesloten op ' + new Date(u.archived_at).toLocaleDateString('nl-NL') + (u.archive_reason ? ' ·' + escapeHtml(u.archive_reason) : '') + '">🔒 AFGESLOTEN</span>' : '';
                    const pausedBadge = isPaused ? ' <span style="background:var(--app-warn-soft);color:var(--app-warn);border:1px solid var(--app-warn-line);padding:1px 6px;border-radius:4px;font-size:0.6rem;font-weight:700;vertical-align:middle" title="Gepauzeerd op ' + new Date(u.paused_at).toLocaleDateString('nl-NL') + (u.pause_reason ? ' ·' + escapeHtml(u.pause_reason) : '') + '">⏸️ GEPAUZEERD</span>' : '';
                    const anonBadge = isAnonymized ? ' <span style="background:var(--app-alert-soft);color:var(--app-alert);padding:1px 6px;border-radius:4px;font-size:0.6rem;font-weight:700;vertical-align:middle" title="PII verwijderd op ' + new Date(u.anonymized_at).toLocaleDateString('nl-NL') + '">🕶️ ANONIEM</span>' : '';

                    // Actie-knoppen per status:
                    //   - Afgesloten (archived) → unarchive-knop (+ anonymize na 7 jaar)
                    //   - Gepauzeerd → unpause-knop
                    //   - Actief → pauze + afsluit-knoppen naast elkaar
                    let actionBtn = '';
                    if (isArchived) {
                        actionBtn = `<button onclick="event.stopPropagation();adminUnarchiveUser('${u.id}', '${safeName}')" class="btn btn-sm" style="padding:4px 8px;font-size:0.7rem;background:var(--app-ok-soft);color:var(--app-ok);border:1px solid var(--app-ok-line)" title="Heractiveren · gebruiker weer actief">↩️</button>`;
                        const archivedAge = (Date.now() - new Date(u.archived_at).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
                        if (archivedAge >= 7 && !isAnonymized) {
                            actionBtn += `<button onclick="event.stopPropagation();adminAnonymizeUser('${u.id}', '${safeName}')" class="btn btn-sm" style="padding:4px 8px;font-size:0.7rem;background:var(--app-alert-soft);color:var(--app-alert);border:1px solid var(--app-alert-line)" title="PII verwijderen (>7 jaar oud)">🕶️</button>`;
                        }
                    } else if (isPaused) {
                        actionBtn = `<button onclick="event.stopPropagation();adminUnpauseUser('${u.id}', '${safeName}')" class="btn btn-sm" style="padding:4px 8px;font-size:0.7rem;background:var(--app-ok-soft);color:var(--app-ok);border:1px solid var(--app-ok-line)" title="Pauze opheffen · gebruiker kan weer inloggen">▶️</button>`;
                    } else {
                        // Actief: pauzeer + afsluit naast elkaar
                        actionBtn = `<button onclick="event.stopPropagation();adminPauseUser('${u.id}', '${safeName}')" class="btn btn-sm" style="padding:4px 8px;font-size:0.7rem;background:var(--app-warn-soft);color:var(--app-warn);border:1px solid var(--app-warn-line)" title="Pauzeer (tijdelijk geen login, reversibel)">⏸️</button>`;
                        actionBtn += `<button onclick="event.stopPropagation();adminArchiveUser('${u.id}', '${safeName}')" class="btn btn-sm" style="padding:4px 8px;font-size:0.7rem;background:var(--app-idle-soft);color:var(--muted);border:1px solid var(--border)" title="Afsluiten (definitief, data blijft 7 jaar bewaard voor AVG)">🔒</button>`;
                    }

                    const cardOpacity = (isArchived || isPaused) ? '0.65' : '1';
                    return `
                    <div class="entry-card" style="flex-direction:column;align-items:stretch;gap:4px;cursor:pointer;opacity:${cardOpacity}" onclick="openAdminModal('gebruiker', ${idx})">
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
                            <div style="flex:1;min-width:0">
                                <div style="font-weight:700;font-size:0.9rem">${escapeHtml(u.name || u.email)}${testBadge}${pausedBadge}${archivedBadge}${anonBadge}</div>
                                <div style="font-size:0.75rem;color:var(--muted)">${escapeHtml(u.email)}${priceInfo.length ? ' · ' + priceInfo.join(' · ') : ''}</div>
                                <div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:3px">${flagsHtml}</div>
                                ${laatstActief ? '<div style="font-size:0.7rem;color:' + activityColor + ';margin-top:3px">' + activityDot + laatstActief + '</div>' : ''}
                            </div>
                            <div style="display:flex;gap:4px;align-items:center;flex-shrink:0">
                                ${actionBtn}
                                <span class="status-badge ${u.role === 'admin' ? 'status-signed' : 'status-draft'}" style="text-transform:uppercase">${u.role}</span>
                            </div>
                        </div>
                    </div>`;
                }).join('');
            } else {
                userList.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.85rem">Geen gebruikers gevonden</div>';
            }

            // Bedrijven laden (ZZP, klant, KTS)
            const { data: companies } = await sb.from('companies').select('*').order('name');
            window._adminCompanies = companies || [];
            const showArchived = document.getElementById('admin-show-archived')?.checked || false;
            const filteredCompanies = (companies || []).filter(c => {
                if (c.is_test === true) return false;
                if (!showArchived && c.archived) return false;
                return true;
            });
            const persList = document.getElementById('admin-persoon-list');
            if (filteredCompanies && filteredCompanies.length > 0) {
                persList.innerHTML = filteredCompanies.map((c) => {
                    const idx = (window._adminCompanies || []).indexOf(c);
                    // Contactpersonen namen ophalen
                    let contactNames = [];
                    try {
                        let contacts = c.contacts;
                        if (typeof contacts === 'string') contacts = JSON.parse(contacts);
                        if (contacts && contacts.length > 0) {
                            contactNames = contacts.filter(ct => ct.name).map(ct => ct.name);
                        }
                    } catch(e) {}
                    // Fallback: oude contact_name
                    if (contactNames.length === 0 && c.contact_name) contactNames = [c.contact_name];
                    const contactHtml = contactNames.length > 0
                        ? contactNames.map(n => `<div style="font-weight:700;font-size:0.9rem">${escapeHtml(n)}</div>`).join('')
                        : `<div style="font-weight:700;font-size:0.9rem">${escapeHtml(c.name)}</div>`;
                    const showCompanyLine = contactNames.length > 0;
                    return `
                    <div class="entry-card" style="flex-direction:column;align-items:stretch;gap:2px;cursor:pointer" onclick="openAdminModal('persoon', ${idx})">
                        <div style="display:flex;justify-content:space-between;align-items:flex-start">
                            <div>
                                ${contactHtml}
                                <div style="font-size:0.75rem;color:var(--muted)">${showCompanyLine ? escapeHtml(c.name) + ' · ' : ''}${escapeHtml(c.city || '')}${c.kvk_number ? ' · KVK ' + escapeHtml(c.kvk_number) : ''}${c.is_test ? ' <span style="background:var(--app-warn-soft);color:var(--app-warn);padding:1px 6px;border-radius:4px;font-size:0.6rem;font-weight:700;vertical-align:middle">TEST</span>' : ''}${c.archived ? ' <span style="background:var(--app-bg-deep);color:#6b7280;padding:1px 6px;border-radius:4px;font-size:0.6rem;font-weight:700;vertical-align:middle">ARCHIEF</span>' : ''}</div>
                            </div>
                            <span class="status-badge status-draft" style="text-transform:uppercase">${escapeHtml(c.type || '')}</span>
                        </div>
                    </div>`;
                }).join('');
            } else {
                persList.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.85rem">Geen bedrijven gevonden</div>';
            }

            // Tarieven laden (user_id verwijst naar auth.users, dus apart users ophalen)
            const { data: rates } = await sb.from('rates').select('*, project_id(id, name, project_code, is_test)').order('valid_from', { ascending: false });
            window._adminRates = rates || [];
            // Haal user-namen op voor weergave
            const { data: allUsersForRates } = await sb.from('users').select('id, name, email');
            const userMap = {};
            if (allUsersForRates) allUsersForRates.forEach(u => { userMap[u.id] = escapeHtml(u.name || u.email); });

            const tariefList = document.getElementById('admin-tarief-list');
            // Filter tarieven: toon alleen tarieven van projecten die passen bij test/productie modus
            const filteredRates = (rates || []).filter(r => {
                const proj = typeof r.project_id === 'object' ? r.project_id : null;
                if (!proj) return true; // geen project gekoppeld → altijd tonen
                return proj.is_test !== true;
            });
            if (filteredRates && filteredRates.length > 0) {
                tariefList.innerHTML = filteredRates.map((r) => {
                    const idx = (window._adminRates || []).indexOf(r);
                    const proj = r.project_id || {};
                    const userName = r.user_id ? (userMap[r.user_id] || 'Onbekende gebruiker') : 'Alle medewerkers';
                    const funcTitle = r.function_title ? ` · ${escapeHtml(r.function_title)}` : '';
                    return `
                    <div class="entry-card" style="flex-direction:column;align-items:stretch;gap:4px;cursor:pointer" onclick="openAdminModal('tarief', ${idx})">
                        <div style="display:flex;justify-content:space-between;align-items:center">
                            <div>
                                <div style="font-weight:700;font-size:0.9rem">${escapeHtml(proj.name || 'Onbekend project')}</div>
                                <div style="font-size:0.75rem;color:var(--muted)">${userName}${funcTitle}</div>
                                <div style="font-size:0.7rem;color:var(--muted)">${escapeHtml(proj.project_code || '')} · vanaf ${r.valid_from}${r.valid_to ? ' t/m ' + r.valid_to : ''}</div>
                            </div>
                            <div style="text-align:right">
                                <div style="font-weight:700;color:var(--kts-blue)" title="Inkooptarief · wat KTS aan zzp betaalt">€${r.hourly_rate}/u <span style="font-size:0.65rem;color:var(--muted);font-weight:500">in</span></div>
                                ${r.hourly_rate_sale ? '<div style="font-weight:700;color:#A56A1F;font-size:0.85rem" title="Verkooptarief · wat KTS aan klant factureert">€' + r.hourly_rate_sale + '/u <span style="font-size:0.65rem;color:var(--muted);font-weight:500">verk</span></div>' : ''}
                                ${r.km_rate ? '<div style="font-size:0.7rem;color:var(--muted)">€' + r.km_rate + '/km</div>' : ''}
                            </div>
                        </div>
                    </div>`;
                }).join('');
            } else {
                tariefList.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.85rem">Geen tarieven gevonden</div>';
            }
        }

        // ===== INKOOPORDER FUNCTIONS =====
        function loadInkooporderFilters() {
            const now = new Date();
            const curYear = now.getFullYear();
            const curMonth = now.getMonth(); // 0-indexed

            // Vul project dropdown
            const projSel = document.getElementById('io-filter-project');
            if (projSel && window._adminProjects) {
                projSel.innerHTML = '<option value="">-- Selecteer project --</option>' +
                    window._adminProjects.map(p => `<option value="${p.id}">${escapeHtml(p.project_code)} | ${escapeHtml(p.name)}</option>`).join('');
            }

            // Vul medewerker dropdown
            const userSel = document.getElementById('io-filter-user');
            if (userSel && window._adminUsers) {
                userSel.innerHTML = '<option value="">-- Selecteer medewerker --</option>' +
                    getFilteredUsers().map(u => `<option value="${u.id}">${escapeHtml(u.name || u.email)}</option>`).join('');
                userSel.onchange = () => autoFillCompanyForUser();
            }

            // Vul jaar dropdown · alleen huidig jaar + volgend jaar
            const yearSel = document.getElementById('io-filter-year');
            if (yearSel) {
                yearSel.innerHTML = [curYear, curYear + 1].map(y =>
                    `<option value="${y}" ${y === curYear ? 'selected' : ''}>${y}</option>`
                ).join('');
            }

            // Vul maand dropdown · voorinvullen op huidige maand
            const monthSel = document.getElementById('io-filter-month');
            if (monthSel) {
                const months = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];
                monthSel.innerHTML = months.map((m, i) =>
                    `<option value="${String(i+1).padStart(2,'0')}" ${i === curMonth ? 'selected' : ''}>${m}</option>`
                ).join('');
                monthSel.onchange = () => populateWeekDropdown();
            }

            // Week checkbox listener
            const useWeekCb = document.getElementById('io-use-week');
            if (useWeekCb) {
                useWeekCb.onchange = () => {
                    const weekSel = document.getElementById('io-week-selector');
                    if (weekSel) weekSel.style.display = useWeekCb.checked ? 'block' : 'none';
                    if (useWeekCb.checked) populateWeekDropdown();
                };
            }

            // Initieel week dropdown vullen
            populateWeekDropdown();
        }

        function autoFillCompanyForUser() {
            // Placeholder · bedrijf info wordt getoond bij preview via aggregatePOData
        }

        function populateWeekDropdown() {
            const yearVal = document.getElementById('io-filter-year').value;
            const monthVal = document.getElementById('io-filter-month').value;
            if (!yearVal || !monthVal) {
                document.getElementById('io-filter-week').innerHTML = '<option value="">-- Selecteer week --</option>';
                return;
            }

            const year = parseInt(yearVal);
            const month = parseInt(monthVal);
            const firstDay = new Date(year, month - 1, 1);
            const lastDay = new Date(year, month, 0);
            const weeks = new Set();

            // Gebruik ISO weeknummers (zelfde als de rest van de app)
            for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
                weeks.add(getISOWeek(d));
            }

            const weekSel = document.getElementById('io-filter-week');
            if (weekSel) {
                const sortedWeeks = Array.from(weeks).sort((a, b) => a - b);
                weekSel.innerHTML = '<option value="">-- Selecteer week --</option>' +
                    sortedWeeks.map(w => {
                        // Bereken maandag en vrijdag van deze week
                        const mon = getWeekMonday(new Date(year, month - 1, 1));
                        // Zoek de juiste maandag voor dit weeknummer
                        const jan4 = new Date(year, 0, 4);
                        const monOfWeek = new Date(jan4);
                        monOfWeek.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (w - 1) * 7);
                        const friOfWeek = new Date(monOfWeek);
                        friOfWeek.setDate(monOfWeek.getDate() + 4);
                        const fmtD = d => `${d.getDate()} ${['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'][d.getMonth()]}`;
                        return `<option value="${w}">Week ${w} (${fmtD(monOfWeek)} t/m ${fmtD(friOfWeek)})</option>`;
                    }).join('');
            }
        }

        // ===== Archief-filter state voor inkooporders =====
        let _ioFilter = { status: 'open', year: String(new Date().getFullYear()) };
        function setIoFilter(status) {
            _ioFilter.status = status;
            document.querySelectorAll('[data-io-status]').forEach(b => {
                b.classList.toggle('active', b.dataset.ioStatus === status);
            });
            loadInkooporders();
        }
        function setIoYearFilter(year) {
            _ioFilter.year = year || '';
            loadInkooporders();
        }

        async function adminMarkIoPaid(ioNumber, paid) {
            const sb = getSupabase();
            if (!sb) return;
            const updates = paid
                ? { paid_at: new Date().toISOString(), paid_by: currentUser?.id || null }
                : { paid_at: null, paid_by: null };
            // Markeer ALLE weken van deze IO (combi-IO heeft meerdere rijen met zelfde io_number)
            const { error } = await sb.from('inkooporder_weeks').update(updates).eq('io_number', ioNumber);
            if (error) { showToast('❌ ' + error.message); return; }
            showToast(paid ? `✓ Inkooporder ${ioNumber} → betaald` : `↩ Inkooporder ${ioNumber} → open`);
            loadInkooporders();
        }

        async function loadInkooporders() {
            const sb = getSupabase();
            if (!sb) return;
            const listEl = document.getElementById('io-list');
            if (!listEl) return;
            listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.85rem">Laden...</div>';

            try {
                // Haal inkooporder records op uit inkooporder_weeks (gegroepeerd per io_number).
                // storage_path is sinds mei 2026 expliciet opgeslagen · voor oude IO's NULL.
                // paid_at is sinds mei 2026 beschikbaar (archief-filter).
                let ioWeeks, ioErr;
                ({ data: ioWeeks, error: ioErr } = await sb.from('inkooporder_weeks')
                    .select('io_number, user_id, project_id, year, month, week_number, created_at, storage_path, paid_at')
                    .order('created_at', { ascending: false }));
                // Fallback voor oude DB zonder paid_at kolom
                if (ioErr && /paid_at/.test(ioErr.message || '')) {
                    ({ data: ioWeeks, error: ioErr } = await sb.from('inkooporder_weeks')
                        .select('io_number, user_id, project_id, year, month, week_number, created_at, storage_path')
                        .order('created_at', { ascending: false }));
                }
                // Fallback voor oude DB zonder storage_path kolom
                if (ioErr && /storage_path/.test(ioErr.message || '')) {
                    ({ data: ioWeeks, error: ioErr } = await sb.from('inkooporder_weeks')
                        .select('io_number, user_id, project_id, year, month, week_number, created_at')
                        .order('created_at', { ascending: false }));
                }

                if (ioErr) throw ioErr;

                // Filter op test/productie modus
                const filteredUserIds = new Set(getFilteredUsers().map(u => u.id));
                const filteredPOWeeks = (ioWeeks || []).filter(pw => filteredUserIds.has(pw.user_id));

                // Groepeer per io_number · pak één storage_path/paid_at per groep
                const ioMap = {};
                filteredPOWeeks.forEach(pw => {
                    if (!ioMap[pw.io_number]) {
                        ioMap[pw.io_number] = {
                            io_number: pw.io_number,
                            user_id: pw.user_id,
                            project_id: pw.project_id,
                            year: pw.year,
                            month: pw.month,
                            weeks: [],
                            storage_path: pw.storage_path || null,
                            paid_at: pw.paid_at || null,
                            created_at: pw.created_at
                        };
                    }
                    ioMap[pw.io_number].weeks.push(pw.week_number);
                    if (!ioMap[pw.io_number].storage_path && pw.storage_path) {
                        ioMap[pw.io_number].storage_path = pw.storage_path;
                    }
                    // IO geldt als betaald zodra ALLE weken paid_at hebben
                    if (!pw.paid_at) ioMap[pw.io_number].paid_at = null;
                });

                let ioList = Object.values(ioMap).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

                // Vul jaar-dropdown op basis van wat in DB zit
                const yearsInData = [...new Set(ioList.map(i => i.year).filter(Boolean))].sort((a,b) => b-a);
                const yearSel = document.getElementById('io-year-filter');
                if (yearSel) {
                    const currentVal = _ioFilter.year;
                    const yearOpts = ['<option value="">Alle jaren</option>'].concat(
                        yearsInData.map(y => `<option value="${y}"${String(y) === currentVal ? ' selected' : ''}>${y}</option>`)
                    );
                    yearSel.innerHTML = yearOpts.join('');
                    if (currentVal && !yearsInData.includes(parseInt(currentVal))) {
                        yearSel.value = '';
                        _ioFilter.year = '';
                    } else {
                        yearSel.value = currentVal;
                    }
                }

                // Filter op archief-status
                if (_ioFilter.status === 'open')   ioList = ioList.filter(io => !io.paid_at);
                if (_ioFilter.status === 'paid')   ioList = ioList.filter(io =>  io.paid_at);
                // Filter op jaar
                if (_ioFilter.year) ioList = ioList.filter(io => String(io.year) === _ioFilter.year);

                if (!ioList || ioList.length === 0) {
                    const leegMsg = _ioFilter.status === 'paid'
                        ? 'Nog geen betaalde inkooporders in archief'
                        : _ioFilter.status === 'open'
                            ? 'Geen open inkooporders. Alles is betaald.'
                            : 'Nog geen inkooporders gegenereerd';
                    listEl.innerHTML = `<div style="text-align:center;padding:30px;color:var(--muted);font-size:0.85rem">${leegMsg}</div>`;
                    return;
                }

                // Haal namen op voor weergave
                const userMap = {};
                (window._adminUsers || []).forEach(u => { userMap[u.id] = escapeHtml(u.name || u.email); });
                const projMap = {};
                (window._adminProjects || []).forEach(p => { projMap[p.id] = escapeHtml(p.project_code + ' · ' + p.name); });
                const MONTHS_SHORT = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];

                listEl.innerHTML = ioList.map(io => {
                    const userName = userMap[io.user_id] || 'Onbekend';
                    const projLabel = projMap[io.project_id] || 'Onbekend';
                    const sortedWeeks = io.weeks.sort((a,b) => a-b);
                    const wekenTekst = sortedWeeks.join(', ');
                    const maandTekst = MONTHS_SHORT[io.month - 1] + ' ' + io.year;
                    const datumTekst = new Date(io.created_at).toLocaleDateString('nl-NL');
                    const projCode = (window._adminProjects || []).find(p => p.id === io.project_id)?.project_code || '';
                    // Path: gebruik opgeslagen storage_path; fallback naar reconstructie voor oude IO's.
                    // Oud format: io_number.replace(/\s+/g, '_') + '.pdf'
                    const storagePath = io.storage_path
                        || `${io.year}/${projCode}/${(io.io_number || '').replace(/\s+/g, '_')}.pdf`;
                    const isPaid = !!io.paid_at;
                    const paidBadge = isPaid
                        ? `<span class="archief-paid-badge" title="Betaald op ${new Date(io.paid_at).toLocaleDateString('nl-NL')}">✓ Betaald</span>`
                        : '';
                    const safeIo = io.io_number.replace(/'/g, "\\'");
                    const paidBtn = isPaid
                        ? `<button onclick="adminMarkIoPaid('${safeIo}', false)" class="btn btn-sm" style="white-space:nowrap;padding:6px 10px;background:var(--app-bg-tint);color:var(--app-ink-700);border:1px solid var(--app-line)" title="Markeer als open">↩</button>`
                        : `<button onclick="adminMarkIoPaid('${safeIo}', true)" class="btn btn-sm" style="white-space:nowrap;padding:6px 10px;background:var(--app-ok-soft);color:var(--app-ok);border:1px solid var(--app-ok-line)" title="Markeer als betaald">✓</button>`;

                    return `<div class="entry-card" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
                        <div style="flex:1;min-width:0">
                            <div style="font-weight:600;font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${io.io_number} ${paidBadge}</div>
                            <div style="font-size:0.75rem;color:var(--muted)">${userName} · ${projLabel}</div>
                            <div style="font-size:0.7rem;color:var(--muted)">Week ${wekenTekst} · ${maandTekst} · ${datumTekst}</div>
                        </div>
                        <div style="display:flex;gap:4px;align-items:center">
                            ${paidBtn}
                            <button onclick="mailInkooporder('${storagePath}','${safeIo}','${io.user_id}','${io.project_id}')" class="btn btn-sm" style="white-space:nowrap;padding:6px 10px;background:var(--app-ok-soft);color:var(--app-ok);border:1px solid var(--app-ok-line)" title="Mailen naar opdrachtnemer">📧</button>
                            <button onclick="downloadInkooporder('${storagePath}')" class="btn btn-primary btn-sm" style="white-space:nowrap;padding:6px 10px">📄</button>
                            <button onclick="adminDeleteIO('${safeIo}')" class="btn btn-sm" style="white-space:nowrap;padding:6px 10px;background:var(--app-alert-soft);color:var(--app-alert);border:1px solid var(--app-alert-line)" title="Verwijderen">🗑️</button>
                        </div>
                    </div>`;
                }).join('');

            } catch (err) {
                console.error('Inkooporders laden mislukt:', err);
                listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--app-alert);font-size:0.85rem">Fout bij laden: ' + err.message + '</div>';
            }
        }

        async function downloadInkooporder(path) {
            const sb = getSupabase();
            if (!sb) return;
            try {
                const { data, error } = await sb.storage.from('inkooporders').download(path);
                if (error) throw error;
                const url = URL.createObjectURL(data);
                const a = document.createElement('a');
                a.href = url;
                a.download = path.split('/').pop();
                a.click();
                URL.revokeObjectURL(url);
                showToast('✓ PDF gedownload');
            } catch (err) {
                showToast('❌ Download mislukt: ' + err.message);
            }
        }

        async function mailInkooporder(storagePath, ioNumber, userId, projectId) {
            const sb = getSupabase();
            if (!sb) return;
            try {
                // Zoek het ZZP-bedrijf (opdrachtnemer) via de user. Multi-stage flow:
                // invoice_via_company_id heeft voorrang op company_id (= eigen BV)
                // zodat de IO/mail naar de juiste factureren-via-bedrijf gaat.
                const user = (window._adminUsers || []).find(u => u.id === userId);
                let recipientEmail = '';
                let recipientName = '';

                const supplierId = (user && user.invoice_via_company_id) || (user && user.company_id) || null;
                if (supplierId) {
                    const { data: zzpComp } = await sb.from('companies').select('*').eq('id', supplierId).single();
                    if (zzpComp) {
                        recipientEmail = zzpComp.email_po || zzpComp.email || '';
                        recipientName = zzpComp.contact_name || zzpComp.name || '';
                    }
                }

                // Project info
                const project = (window._adminProjects || []).find(p => p.id === projectId);
                const projName = project ? project.name : '';
                const projCode = project ? project.project_code : '';

                // Download PDF eerst
                const { data, error } = await sb.storage.from('inkooporders').download(storagePath);
                if (error) {
                    showToast('⚠️ PDF niet gevonden in storage · genereer de inkooporder opnieuw');
                    return;
                }
                const url = URL.createObjectURL(data);
                const a = document.createElement('a');
                a.href = url;
                a.download = storagePath.split('/').pop();
                a.click();
                URL.revokeObjectURL(url);

                // Open mailto
                const aanhef = recipientName ? recipientName.split(' ')[0] : '';
                const subject = encodeURIComponent(`Inkooporder ${ioNumber} · ${projCode}`);
                const body = encodeURIComponent(
                    `Hoi ${aanhef},\n\n` +
                    `Hierbij de inkooporder ${ioNumber} voor project ${projCode}${projName ? ' (' + projName + ')' : ''}.\n\n` +
                    `De PDF is als bijlage bijgevoegd.\n\n` +
                    `Met vriendelijke groet,\n` +
                    `Kuijpers Technical Services`
                );
                window.location.href = 'mailto:' + recipientEmail + '?subject=' + subject + '&body=' + body;
                showToast('✓ PDF gedownload · voeg deze als bijlage toe aan de e-mail');
            } catch (err) {
                showToast('❌ Fout: ' + err.message);
            }
        }

        async function adminDeleteIO(ioNumber) {
            if (!await confirmAsync(`Inkooporder "${ioNumber}" verwijderen?\n\nDe weken worden weer vrijgegeven en kunnen opnieuw op een inkooporder gezet worden.`, true)) return;
            const sb = getSupabase();
            if (!sb) return;
            try {
                // Haal PO-info op voor storage path · incl. opgeslagen storage_path indien aanwezig
                let ioWeeks;
                try {
                    ({ data: ioWeeks } = await sb.from('inkooporder_weeks')
                        .select('project_id, year, storage_path')
                        .eq('io_number', ioNumber)
                        .limit(1));
                } catch (e) {
                    // Fallback voor oude DB zonder storage_path
                    ({ data: ioWeeks } = await sb.from('inkooporder_weeks')
                        .select('project_id, year')
                        .eq('io_number', ioNumber)
                        .limit(1));
                }

                // Verwijder inkooporder_weeks records
                const { error: delErr } = await sb.from('inkooporder_weeks')
                    .delete().eq('io_number', ioNumber);
                if (delErr) throw delErr;

                // Probeer PDF uit storage te verwijderen · beide paden (nieuwe + oude naming)
                // zodat we ook PDFs kunnen opruimen die vóór de naming-migratie zijn aangemaakt.
                if (ioWeeks && ioWeeks.length > 0) {
                    const pw = ioWeeks[0];
                    const projCode = (window._adminProjects || []).find(p => p.id === pw.project_id)?.project_code || '';
                    const pathsToTry = [];
                    if (pw.storage_path) pathsToTry.push(pw.storage_path);
                    if (projCode) {
                        // Oude naming-fallback
                        pathsToTry.push(`${pw.year}/${projCode}/${ioNumber.replace(/\s+/g, '_')}.pdf`);
                    }
                    if (pathsToTry.length > 0) {
                        try { await sb.storage.from('inkooporders').remove(pathsToTry); } catch (e) {}
                    }
                }

                showToast('✓ Inkooporder verwijderd · weken zijn weer beschikbaar');
                loadInkooporders();
            } catch (err) {
                console.error('IO verwijderen mislukt:', err);
                showToast('❌ Verwijderen mislukt: ' + err.message);
            }
        }

        // ===== FACTUUR GENERATOR =====
        function loadInvoiceFilters() {
            const projSel = document.getElementById('inv-filter-project');
            const userSel = document.getElementById('inv-filter-user');
            const yearSel = document.getElementById('inv-filter-year');
            const monthSel = document.getElementById('inv-filter-month');
            if (!projSel) return;

            // Projecten · array.map().join() i.p.v. innerHTML += in loop (1 reflow vs N reflows)
            if (projSel.options.length <= 1 && window._adminProjects) {
                const projOpts = (window._adminProjects || [])
                    .filter(p => p.status === 'active')
                    .map(p => `<option value="${p.id}">${escapeHtml(p.project_code)} | ${escapeHtml(p.name)}</option>`)
                    .join('');
                projSel.insertAdjacentHTML('beforeend', projOpts);
            }
            // Users · voeg "Alle medewerkers" toe voor combi-factuur (meerdere zzp's op 1 factuur)
            userSel.innerHTML = '<option value="">-- Selecteer medewerker --</option>' +
                '<option value="__ALL__">👥 Alle medewerkers (combi-factuur)</option>' +
                getFilteredUsers().map(u => `<option value="${u.id}">${escapeHtml(u.name || u.email)}</option>`).join('');
            // Jaar · array-join i.p.v. 3× reflow
            if (yearSel.options.length <= 1) {
                const y = new Date().getFullYear();
                const yearOpts = [y - 1, y, y + 1]
                    .map(yr => `<option value="${yr}" ${yr === y ? 'selected' : ''}>${yr}</option>`)
                    .join('');
                yearSel.insertAdjacentHTML('beforeend', yearOpts);
            }
            // Maanden · array-join i.p.v. 12× reflow
            if (monthSel.options.length <= 1) {
                const MONTHS = ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December'];
                const monthOpts = MONTHS
                    .map((m, i) => `<option value="${i + 1}" ${i === new Date().getMonth() ? 'selected' : ''}>${m}</option>`)
                    .join('');
                monthSel.insertAdjacentHTML('beforeend', monthOpts);
            }
        }

        async function previewInvoice() {
            const userIdRaw = document.getElementById('inv-filter-user').value;
            const projectId = document.getElementById('inv-filter-project').value;
            const year = document.getElementById('inv-filter-year').value;
            const month = document.getElementById('inv-filter-month').value;
            const skipIO = !!document.getElementById('inv-skip-io')?.checked;

            if (!userIdRaw || !projectId || !year || !month) {
                showToast('⚠️ Selecteer project, medewerker, jaar en maand');
                return;
            }

            // Combi-mode: '__ALL__' = alle medewerkers met IO-weken (of weekstaten) op dit project/maand
            const isCombi = userIdRaw === '__ALL__';
            const userId = isCombi ? null : userIdRaw;

            const sb = getSupabase();
            if (!sb) return;

            // Bron-weken bepalen:
            //  - Default: IO-weken uit inkooporder_weeks (admin moet eerst IO maken)
            //  - skipIO=true: verstuurde/goedgekeurde weekstaten uit week_status
            //    (voor wanneer onderaannemer zelf factureert · geen IO nodig)
            let ioWeeks;
            if (skipIO) {
                // Haal verstuurde/goedgekeurde weekstaten op voor dit project+maand
                const yrInt = parseInt(year);
                const moInt = parseInt(month);
                // Maand-grenzen voor entry_date matching → ISO-week binnen die maand
                const firstDayDate = new Date(yrInt, moInt - 1, 1);
                const lastDayDate = new Date(yrInt, moInt, 0);
                let wsQuery = sb.from('week_status').select('user_id, week_number, status')
                    .eq('project_id', projectId)
                    .eq('year', yrInt)
                    .in('status', ['verstuurd', 'ondertekend']);
                if (!isCombi) wsQuery = wsQuery.eq('user_id', userId);
                const { data: wsRows } = await wsQuery;
                // Filter: alleen weken die binnen de gekozen maand vallen
                ioWeeks = (wsRows || []).filter(ws => {
                    const monday = (typeof getWeekMondayFromWeekNumber === 'function')
                        ? getWeekMondayFromWeekNumber(yrInt, ws.week_number)
                        : new Date(yrInt, 0, 1 + (ws.week_number - 1) * 7);
                    // Week valt in deze maand als de maandag in deze maand zit OF (bij overlap-weken) op een ander manier
                    // Simpel: gebruik de "month" van de maandag
                    return monday.getMonth() + 1 === moInt;
                }).map(ws => ({
                    io_number: null, // geen IO · losse weekstaat
                    week_number: ws.week_number,
                    user_id: ws.user_id
                }));
            } else {
                // IO-weken ophalen · single user: gefilterd op user_id; combi: ALLE users op dit project+maand
                let ioQuery = sb.from('inkooporder_weeks')
                    .select('io_number, week_number, user_id')
                    .eq('project_id', projectId)
                    .eq('year', parseInt(year))
                    .eq('month', parseInt(month));
                if (!isCombi) ioQuery = ioQuery.eq('user_id', userId);
                const { data: rows } = await ioQuery;
                ioWeeks = rows || [];
            }

            if (!ioWeeks || ioWeeks.length === 0) {
                const preview = document.getElementById('inv-preview');
                const content = document.getElementById('inv-preview-content');
                const subj = isCombi ? 'project/maand' : 'medewerker/project/maand';
                const msg = skipIO
                    ? `⚠️ Geen verstuurde weekstaten gevonden voor deze ${subj} combinatie.<br>
                       <span style="font-size:0.8rem;color:var(--muted)">De medewerker moet eerst zijn weekstaten ondertekenen & versturen.</span>`
                    : `⚠️ Er ${isCombi ? 'zijn' : 'is'} nog geen inkooporder${isCombi ? 's' : ''} verstuurd voor deze ${subj} combinatie.<br>
                       <span style="font-size:0.8rem;color:var(--muted)">Genereer eerst de inkooporder(s), of vink "Factuur zonder inkooporder" aan als de onderaannemer zelf factureert.</span>`;
                content.innerHTML = `<div style="text-align:center;color:var(--red);padding:20px;font-size:0.9rem">${msg}</div>`;
                preview.style.display = 'block';
                return;
            }

            // Check of er al een factuur bestaat (single-user only · combi-factuur duplicaten
            // afvangen we via invoice_number)
            let existingInv = null;
            if (!isCombi) {
                const { data: existing } = await sb.from('invoices')
                    .select('invoice_number')
                    .eq('user_id', userId)
                    .eq('project_id', projectId)
                    .eq('year', parseInt(year))
                    .eq('month', parseInt(month));
                existingInv = existing;
            }

            // Aggregate data · alleen voor single-user (combi heeft per-user breakdown)
            if (!isCombi) {
                const ioData = await aggregatePOData(userId, projectId, year, month);
                if (!ioData || ioData.includedWeeks.length === 0) {
                    // Gebruik alle weken die op een PO staan i.p.v. alleen goedgekeurde
                    // Factuur is gebaseerd op PO weken
                }
            }

            // Haal klantbedrijf op via project
            const project = (window._adminProjects || []).find(p => p.id === projectId);
            let clientCompany = null;
            if (project && project.client_company_id) {
                const compId = typeof project.client_company_id === 'object' ? project.client_company_id.id || project.client_company_id : project.client_company_id;
                if (typeof compId === 'string') {
                    const { data: comp } = await sb.from('companies').select('*').eq('id', compId).single();
                    clientCompany = comp;
                } else if (typeof project.client_company_id === 'object') {
                    clientCompany = project.client_company_id;
                }
            }

            // Check welke weken al gefactureerd zijn · per (user_id, week) zodat combi-factuur
            // niet onterecht een week voor user A blokkeert omdat user B al gefactureerd is.
            // Voor single-user mode filteren we op user_id; voor combi pakken we alle facturen
            // die deze users kunnen bevatten.
            let existingInvQuery = sb.from('invoices')
                .select('invoice_number, weeks, user_id, user_ids')
                .eq('project_id', projectId)
                .eq('year', parseInt(year));
            if (!isCombi) existingInvQuery = existingInvQuery.eq('user_id', userId);
            const { data: existingInvWeeks } = await existingInvQuery;

            // Bouw "al gefactureerd" check per (user, week)
            const alreadyInvoicedKeys = new Set(); // key: `${user_id}_${week}`
            const invoicedWeekDetails = []; // voor waarschuwing ·{ user_id, week, invoice }
            (existingInvWeeks || []).forEach(inv => {
                if (!inv.weeks || !Array.isArray(inv.weeks)) return;
                // Single-user factuur: user_id gevuld · markeer voor die user
                // Combi-factuur: user_ids gevuld · markeer voor elke user erin
                const usersOnInv = (inv.user_ids && inv.user_ids.length > 0) ? inv.user_ids
                    : (inv.user_id ? [inv.user_id] : []);
                inv.weeks.forEach(w => {
                    usersOnInv.forEach(uid => {
                        alreadyInvoicedKeys.add(`${uid}_${w}`);
                        invoicedWeekDetails.push({ user_id: uid, week: w, invoice: inv.invoice_number });
                    });
                });
            });

            // Filter IO-weken: verwijder (user, week) combinaties die al gefactureerd zijn
            const filteredIoWeeks = ioWeeks.filter(pw => !alreadyInvoicedKeys.has(`${pw.user_id}_${pw.week_number}`));
            const skippedIoWeeks = ioWeeks.filter(pw => alreadyInvoicedKeys.has(`${pw.user_id}_${pw.week_number}`));

            const filteredIoWeekNums = [...new Set(filteredIoWeeks.map(pw => pw.week_number))];
            const skippedWeeks = [...new Set(skippedIoWeeks.map(pw => pw.week_number))];

            // Bereken factuurregels op basis van PO weken (alleen niet-gefactureerde)
            const yr = parseInt(year);
            const mo = parseInt(month);
            const firstDay = new Date(yr, mo - 1, 1);
            const lastDay = new Date(yr, mo, 0);
            const dateFrom = toLocalDateStr(firstDay);
            const dateTo = toLocalDateStr(lastDay);

            // Welke (user, week) zijn nog open voor facturatie?
            const openIoSet = new Set(filteredIoWeeks.map(pw => `${pw.user_id}_${pw.week_number}`));

            // Welke users zijn van toepassing? Combi: alle unieke users uit IO-weken; single: één.
            const userIdsList = isCombi
                ? [...new Set(filteredIoWeeks.map(pw => pw.user_id))]
                : [userId];

            if (userIdsList.length === 0) {
                const preview = document.getElementById('inv-preview');
                const content = document.getElementById('inv-preview-content');
                content.innerHTML = `<div style="background:var(--app-alert-soft);border:1px solid var(--app-alert-line);border-radius:8px;padding:16px;text-align:center;font-size:0.9rem;color:var(--app-alert)">
                    Alle weken zijn al gefactureerd. Er zijn geen nieuwe (medewerker, week) combinaties om te factureren.
                </div>`;
                preview.style.display = 'block';
                return;
            }

            // Rates ophalen voor het project (incl. user-specifieke overrides)
            const { data: allRates } = await sb.from('rates').select('*')
                .eq('project_id', projectId)
                .order('valid_from', { ascending: false });

            // Helper: pak verkoop-tarief voor een specifieke user (fallback chain:
            // user-specifiek → project-default → hardcoded default)
            function rateForUser(uid) {
                let r = { hourly_rate: 85, km_rate: 0.50, saturday_multiplier: 1.50, sunday_holiday_multiplier: 2.00 };
                if (allRates && allRates.length > 0) {
                    const userRate = allRates.find(rr => rr.user_id === uid);
                    const projRate = allRates.find(rr => !rr.user_id);
                    const found = userRate || projRate;
                    if (found) {
                        const saleRate = parseFloat(found.hourly_rate_sale);
                        r.hourly_rate = (!isNaN(saleRate) && saleRate > 0)
                            ? saleRate
                            : (parseFloat(found.hourly_rate) || 85);
                        r.km_rate = parseFloat(found.km_rate) || 0.50;
                        r.saturday_multiplier = parseFloat(found.saturday_multiplier) || 1.50;
                        r.sunday_holiday_multiplier = parseFloat(found.sunday_holiday_multiplier) || 2.00;
                    }
                }
                return r;
            }

            // Time entries ophalen voor alle relevante users in deze maand op dit project
            const { data: entries } = await sb.from('time_entries').select('*')
                .in('user_id', userIdsList)
                .eq('project_id', projectId)
                .gte('entry_date', dateFrom)
                .lte('entry_date', dateTo);

            // Filter alleen entries waarvan (user, ISO-week) in de open IO-set zit
            const invoiceEntries = (entries || []).filter(e => {
                if (!e.entry_date) return false;
                const isoWeek = getISOWeek(new Date(e.entry_date + 'T12:00:00'));
                return openIoSet.has(`${e.user_id}_${isoWeek}`);
            });

            // User info ophalen voor alle users · naam + hotel-tarief
            const { data: usersData } = await sb.from('users').select('*').in('id', userIdsList);
            const userById = {};
            (usersData || []).forEach(u => { userById[u.id] = u; });

            // Per-user weekData opbouwen
            // Structuur: perUser[userId] = { user, rate, hotelRate, weekData: {weekKey: {...}} }
            const perUser = {};
            userIdsList.forEach(uid => {
                perUser[uid] = {
                    user: userById[uid] || null,
                    rate: rateForUser(uid),
                    hotelRate: (userById[uid] && parseFloat(userById[uid].hotel_rate)) || 110,
                    weekData: {}
                };
            });

            invoiceEntries.forEach(entry => {
                const uid = entry.user_id;
                const bucket = perUser[uid];
                if (!bucket) return;
                const entryDate = new Date(entry.entry_date + 'T12:00:00');
                const isoWeek = getISOWeek(entryDate);
                const weekKey = `week_${isoWeek}`;
                if (!bucket.weekData[weekKey]) {
                    bucket.weekData[weekKey] = { weekNum: isoWeek, year: yr, regHours: 0, satHours: 0, sunHours: 0, totalKm: 0, hotelNights: 0 };
                }
                const hours = parseFloat(entry.total_hours) || 0;
                const day = entryDate.getDay();
                if (day === 6) bucket.weekData[weekKey].satHours += hours;
                else if (day === 0) bucket.weekData[weekKey].sunHours += hours;
                else bucket.weekData[weekKey].regHours += hours;
                bucket.weekData[weekKey].totalKm += parseFloat(entry.km) || 0;
                if (entry.hotel) bucket.weekData[weekKey].hotelNights++;
            });

            // Extra kosten (expenses) ophalen voor alle users in de open IO-weken.
            // Worden per user bewaard in perUser[uid].expenses zodat ze op factuur en
            // in de preview kunnen verschijnen.
            try {
                const weekNumsForExpenses = [...new Set(filteredIoWeeks.map(pw => pw.week_number))];
                if (weekNumsForExpenses.length > 0 && userIdsList.length > 0) {
                    let { data: expsData, error: expsErr } = await sb.from('expenses')
                        .select('user_id, cat, amount, description, week_number, year, quantity, unit_price')
                        .in('user_id', userIdsList)
                        .eq('project_id', projectId)
                        .eq('year', yr)
                        .in('week_number', weekNumsForExpenses);
                    if (expsErr && /quantity|unit_price/.test(expsErr.message || '')) {
                        // Fallback voor DB zonder qty/unit cols
                        ({ data: expsData } = await sb.from('expenses')
                            .select('user_id, cat, amount, description, week_number, year')
                            .in('user_id', userIdsList)
                            .eq('project_id', projectId)
                            .eq('year', yr)
                            .in('week_number', weekNumsForExpenses));
                    }
                    (expsData || []).forEach(e => {
                        const bucket = perUser[e.user_id];
                        if (!bucket) return;
                        // Filter: alleen expenses van weken die in openIoSet zitten
                        // (zodat al gefactureerde week-expenses niet dubbel binnenkomen)
                        if (!openIoSet.has(`${e.user_id}_${e.week_number}`)) return;
                        if (!bucket.expenses) bucket.expenses = [];
                        bucket.expenses.push({
                            cat: e.cat || 'other',
                            amount: parseFloat(e.amount) || 0,
                            description: e.description || '',
                            week_number: e.week_number,
                            quantity: e.quantity || null,
                            unit_price: e.unit_price || null
                        });
                    });
                }
            } catch (e) { /* tabel/kolom niet aanwezig · fallback geen expenses */ }

            // Filter users zonder uren EN zonder expenses (kunnen wel een IO hebben maar geen data)
            Object.keys(perUser).forEach(uid => {
                const hasWeeks = Object.keys(perUser[uid].weekData).length > 0;
                const hasExpenses = perUser[uid].expenses && perUser[uid].expenses.length > 0;
                if (!hasWeeks && !hasExpenses) delete perUser[uid];
            });

            // Backwards-compatibele velden voor single-user mode (preview + adapter logica)
            // gebruiken nog `weekData`, `rate`, `user`, `hotelRate` in single-user pad.
            const firstUid = Object.keys(perUser)[0];
            const single = !isCombi && firstUid ? perUser[firstUid] : null;

            // Sla data op voor PDF generatie
            window._currentInvoiceData = {
                isCombi,
                userId: isCombi ? null : userId,
                userIds: isCombi ? Object.keys(perUser) : null,
                projectId, year: yr, month: mo,
                project, clientCompany,
                perUser, // combi + single pad: hier zit alles in
                // legacy single-user velden (alleen gevuld in non-combi mode):
                user: single ? single.user : null,
                rate: single ? single.rate : { hourly_rate: 85, km_rate: 0.50, saturday_multiplier: 1.50, sunday_holiday_multiplier: 2.00 },
                hotelRate: single ? single.hotelRate : 110,
                weekData: single ? single.weekData : {},
                entries: invoiceEntries, ioWeeks,
                existingInvoice: existingInv && existingInv.length > 0 ? existingInv[0] : null
            };

            // Render preview
            const preview = document.getElementById('inv-preview');
            const content = document.getElementById('inv-preview-content');
            let html = '';

            // Waarschuwing als (user, week) combinaties al gefactureerd zijn
            if (skippedIoWeeks.length > 0) {
                const skippedDetails = skippedIoWeeks.map(pw => {
                    const detail = invoicedWeekDetails.find(d => d.week === pw.week_number && d.user_id === pw.user_id);
                    const userName = escapeHtml(userById[pw.user_id] ? (userById[pw.user_id].name || userById[pw.user_id].email) : 'Onbekend');
                    return `${userName} W${pw.week_number} (${detail ? escapeHtml(detail.invoice) : '?'})`;
                }).join(', ');
                html += `<div style="background:var(--app-warn-soft);border:1px solid #f59e0b;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:0.85rem">
                    ⚠️ ${skippedIoWeeks.length === 1 ? 'is' : 'zijn'} al gefactureerd en ${skippedIoWeeks.length === 1 ? 'wordt' : 'worden'} overgeslagen: ${skippedDetails}
                </div>`;
            }

            // Als geen perUser meer over (alles al gefactureerd of geen uren)
            if (Object.keys(perUser).length === 0) {
                html += `<div style="background:var(--app-alert-soft);border:1px solid var(--app-alert-line);border-radius:8px;padding:16px;text-align:center;font-size:0.9rem;color:var(--app-alert)">
                    Geen factureerbare uren gevonden voor deze selectie.
                </div>`;
                content.innerHTML = html;
                preview.style.display = 'block';
                return;
            }

            html += `<div style="font-weight:600;color:var(--kts-blue);margin-bottom:8px">Factuur aan: ${clientCompany ? escapeHtml(clientCompany.name) : '(Geen klant ingesteld op project)'}</div>`;
            const userNames = Object.keys(perUser).map(uid => escapeHtml(perUser[uid].user?.name || perUser[uid].user?.email || 'Onbekend')).join(', ');
            const headerLabel = isCombi
                ? `<span style="background:var(--app-ok-soft);color:var(--app-ok);padding:2px 8px;border-radius:6px;font-weight:600;font-size:0.75rem;margin-right:6px">👥 COMBI</span>${userNames}`
                : userNames;
            html += `<div style="font-size:0.8rem;color:var(--muted);margin-bottom:12px">${isCombi ? 'Medewerkers' : 'Medewerker'}: ${headerLabel} · Project: ${escapeHtml(project?.project_code || '')} · Maand: ${mo}/${yr}</div>`;

            html += '<table style="width:100%;border-collapse:collapse;font-size:0.85rem">';
            html += '<tr style="border-bottom:1px solid var(--border)"><th style="text-align:left;padding:6px;font-weight:600">Beschrijving</th><th style="text-align:right;padding:6px;font-weight:600">Aantal</th><th style="text-align:right;padding:6px;font-weight:600">Tarief</th><th style="text-align:right;padding:6px;font-weight:600">Bedrag</th></tr>';

            let subtotal = 0;
            Object.keys(perUser).forEach(uid => {
                const bucket = perUser[uid];
                // escapeHtml aan de bron · userName wordt hieronder op 4 plekken in
                // innerHTML geinterpoleerd (combi-header, km-, hotel- en kostenrijen)
                const userName = escapeHtml(bucket.user?.name || bucket.user?.email || 'Onbekend');
                const userRate = bucket.rate;
                const userHotelRate = bucket.hotelRate;

                if (isCombi) {
                    html += `<tr style="background:var(--app-info-soft)"><td colspan="4" style="padding:6px;font-weight:700;color:var(--kts-blue);border-top:2px solid var(--kts-blue)">👤 ${userName}</td></tr>`;
                }

                Object.keys(bucket.weekData).sort().forEach(weekKey => {
                    const week = bucket.weekData[weekKey];
                    const weekLabel = `Week ${String(week.weekNum).padStart(2,'0')}/${week.year}`;
                    if (week.regHours > 0) {
                        const amount = week.regHours * userRate.hourly_rate;
                        html += `<tr><td style="padding:4px 6px">Uren (ma-vr) ·${weekLabel}</td><td style="text-align:right;padding:4px 6px">${fmtDecimal(week.regHours)}</td><td style="text-align:right;padding:4px 6px">${fmtEuro(userRate.hourly_rate)}</td><td style="text-align:right;padding:4px 6px;font-weight:600">${fmtEuro(amount)}</td></tr>`;
                        subtotal += amount;
                    }
                    if (week.satHours > 0) {
                        const amount = week.satHours * userRate.hourly_rate * userRate.saturday_multiplier;
                        html += `<tr><td style="padding:4px 6px">Zaterdaguren ·${weekLabel}</td><td style="text-align:right;padding:4px 6px">${fmtDecimal(week.satHours)}</td><td style="text-align:right;padding:4px 6px">${fmtEuro(userRate.hourly_rate * userRate.saturday_multiplier)}</td><td style="text-align:right;padding:4px 6px;font-weight:600">${fmtEuro(amount)}</td></tr>`;
                        subtotal += amount;
                    }
                    if (week.sunHours > 0) {
                        const amount = week.sunHours * userRate.hourly_rate * userRate.sunday_holiday_multiplier;
                        html += `<tr><td style="padding:4px 6px">Zondaguren ·${weekLabel}</td><td style="text-align:right;padding:4px 6px">${fmtDecimal(week.sunHours)}</td><td style="text-align:right;padding:4px 6px">${fmtEuro(userRate.hourly_rate * userRate.sunday_holiday_multiplier)}</td><td style="text-align:right;padding:4px 6px;font-weight:600">${fmtEuro(amount)}</td></tr>`;
                        subtotal += amount;
                    }
                });

                let userKm = 0, userHotel = 0;
                Object.values(bucket.weekData).forEach(w => { userKm += w.totalKm; userHotel += w.hotelNights; });
                if (userKm > 0) {
                    const kmAmount = userKm * userRate.km_rate;
                    html += `<tr><td style="padding:4px 6px">Kilometers${isCombi ? ' ·' + userName : ''}</td><td style="text-align:right;padding:4px 6px">${userKm.toLocaleString('nl-NL')}</td><td style="text-align:right;padding:4px 6px">${fmtEuro(userRate.km_rate)}</td><td style="text-align:right;padding:4px 6px;font-weight:600">${fmtEuro(kmAmount)}</td></tr>`;
                    subtotal += kmAmount;
                }
                if (userHotel > 0) {
                    const hotelAmount = userHotel * userHotelRate;
                    html += `<tr><td style="padding:4px 6px">Hotelovernachtingen${isCombi ? ' ·' + userName : ''}</td><td style="text-align:right;padding:4px 6px">${userHotel}</td><td style="text-align:right;padding:4px 6px">${fmtEuro(userHotelRate)}</td><td style="text-align:right;padding:4px 6px;font-weight:600">${fmtEuro(hotelAmount)}</td></tr>`;
                    subtotal += hotelAmount;
                }
                // Extra kosten (declaraties) · per user, in volgorde van toevoegen
                const expCatLabelsInv = {
                    transport:'Transport', parkeren:'Parkeren', maaltijd:'Maaltijd',
                    meals:'Maaltijd', materiaal:'Materiaal', huur:'Huur',
                    tolheffing:'Tolheffingen', veerboot:'Veerboot',
                    doorbelasting:'Doorbelasting', other:'Overig'
                };
                if (bucket.expenses && bucket.expenses.length > 0) {
                    bucket.expenses.forEach(exp => {
                        const catLbl = expCatLabelsInv[exp.cat] || 'Overig';
                        const desc = exp.description ? `: ${escapeHtml(exp.description)}` : '';
                        // Aantal kolom: bij quantity+unit_price gebruiken, anders 1×
                        const qty = exp.quantity && exp.quantity > 0 ? exp.quantity : 1;
                        const unit = exp.unit_price && exp.unit_price > 0 ? exp.unit_price : exp.amount;
                        const qtyStr = qty % 1 === 0 ? qty.toString() : qty.toFixed(2);
                        const userSuffix = isCombi ? ' ·' + userName : '';
                        html += `<tr><td style="padding:4px 6px">${catLbl}${desc}${userSuffix}</td><td style="text-align:right;padding:4px 6px">${qtyStr}</td><td style="text-align:right;padding:4px 6px">${fmtEuro(unit)}</td><td style="text-align:right;padding:4px 6px;font-weight:600">${fmtEuro(exp.amount)}</td></tr>`;
                        subtotal += exp.amount;
                    });
                }
            });

            const btw = subtotal * 0.21;
            const total = subtotal + btw;
            html += `<tr style="border-top:2px solid var(--kts-blue)"><td colspan="3" style="padding:6px;font-weight:600">Subtotaal</td><td style="text-align:right;padding:6px;font-weight:600">${fmtEuro(subtotal)}</td></tr>`;
            html += `<tr><td colspan="3" style="padding:4px 6px;color:var(--muted)">BTW 21%</td><td style="text-align:right;padding:4px 6px;color:var(--muted)">${fmtEuro(btw)}</td></tr>`;
            html += `<tr><td colspan="3" style="padding:6px;font-weight:700;color:var(--kts-blue);font-size:1rem">Totaal incl. BTW</td><td style="text-align:right;padding:6px;font-weight:700;color:var(--kts-blue);font-size:1rem">${fmtEuro(total)}</td></tr>`;
            html += '</table>';

            content.innerHTML = html;
            preview.style.display = 'block';

            // Suggestie factuurnummer: 2026-XX (volgend nummer op basis van bestaande facturen)
            const numInput = document.getElementById('inv-custom-number');
            if (numInput) {
                let nextNum = 13; // Extern al t/m 2026-12 gefactureerd
                try {
                    const { data: existing } = await sb.from('invoices')
                        .select('invoice_number')
                        .eq('year', yr);
                    if (existing && existing.length > 0) {
                        existing.forEach(inv => {
                            const match = inv.invoice_number.match(/^\d{4}-(\d+)$/);
                            if (match) nextNum = Math.max(nextNum, parseInt(match[1]) + 1);
                        });
                    }
                } catch(e) {}
                numInput.value = yr + '-' + String(nextNum).padStart(2, '0');
            }
        }

        // ===== FACTUUR PDF (KTS huisstijl) =====
        // Adapter: zet invData om naar PDF-data-structure
        // Single-user: regels[] bevat alleen normale rijen.
        // Combi-mode: regels[] bevat per medewerker een groupHeader + diens rijen.
        function adaptInvoiceData(invData, invoiceNumber, payTermDays) {
            const MONTHS_NL = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
            const today = new Date();
            const todayStr = today.toLocaleDateString('nl-NL', { day:'2-digit', month:'2-digit', year:'numeric' });
            const dueDate = new Date(today);
            dueDate.setDate(dueDate.getDate() + (payTermDays || 30));
            const dueDateStr = dueDate.toLocaleDateString('nl-NL', { day:'2-digit', month:'2-digit', year:'numeric' });

            const monthLabel = (MONTHS_NL[invData.month - 1] || '') + ' ' + invData.year;
            const projectName = (invData.project && invData.project.name) || '';

            // Bouw regels op uit perUser-structuur (zowel combi als single)
            const regels = [];
            const perUser = invData.perUser || {};
            const userIds = Object.keys(perUser);
            const isCombi = !!invData.isCombi;

            userIds.forEach(uid => {
                const bucket = perUser[uid];
                if (!bucket) return;
                const userName = bucket.user ? (bucket.user.name || bucket.user.email) : '';
                const rate = bucket.rate;
                const hotelRate = bucket.hotelRate;

                // Combi: tussenkop per medewerker (zichtbaar in PDF als gekleurde band)
                if (isCombi) {
                    regels.push({ groupHeader: true, label: userName });
                }

                const weekKeys = Object.keys(bucket.weekData || {}).sort();
                weekKeys.forEach(key => {
                    const w = bucket.weekData[key];
                    const weekLabel = `wk ${String(w.weekNum).padStart(2,'0')}/${w.year}`;
                    // In single-mode hebben rijen al "Inzet {naam}" voor de oude look;
                    // In combi-mode is de naam al in de groupHeader, dus weglaten.
                    const inzetDesc = isCombi
                        ? `Inzet · ${projectName}`
                        : `Inzet ${userName} · ${projectName}`;
                    if (w.regHours > 0) {
                        regels.push({ datum: weekLabel, desc: inzetDesc, qty: w.regHours, unit: 'uur', tarief: rate.hourly_rate, btw: 21 });
                    }
                    if (w.satHours > 0) {
                        regels.push({ datum: weekLabel, desc: `Zaterdaguren (toeslag ${Math.round(rate.saturday_multiplier*100)}%)`, qty: w.satHours, unit: 'uur', tarief: rate.hourly_rate * rate.saturday_multiplier, btw: 21 });
                    }
                    if (w.sunHours > 0) {
                        regels.push({ datum: weekLabel, desc: `Zondag-/feestdaguren (toeslag ${Math.round(rate.sunday_holiday_multiplier*100)}%)`, qty: w.sunHours, unit: 'uur', tarief: rate.hourly_rate * rate.sunday_holiday_multiplier, btw: 21 });
                    }
                });
                let userKm = 0, userHotel = 0;
                Object.values(bucket.weekData || {}).forEach(w => { userKm += (w.totalKm || 0); userHotel += (w.hotelNights || 0); });
                if (userKm > 0) {
                    regels.push({ datum: monthLabel, desc: 'Reis kilometers', qty: userKm, unit: 'km', tarief: rate.km_rate, btw: 21 });
                }
                if (userHotel > 0) {
                    regels.push({ datum: monthLabel, desc: 'Hotelovernachtingen', qty: userHotel, unit: 'nacht', tarief: hotelRate || 0, btw: 21 });
                }
                // Extra kosten (declaraties) · per expense een regel op de factuur
                const expCatLabelsFact = {
                    transport:'Transport', parkeren:'Parkeren', maaltijd:'Maaltijd',
                    meals:'Maaltijd', materiaal:'Materiaal', huur:'Huur',
                    tolheffing:'Tolheffingen', veerboot:'Veerboot',
                    doorbelasting:'Doorbelasting', other:'Overig'
                };
                if (bucket.expenses && bucket.expenses.length > 0) {
                    bucket.expenses.forEach(exp => {
                        const catLbl = expCatLabelsFact[exp.cat] || 'Overig';
                        const desc = exp.description ? `${catLbl}: ${exp.description}` : catLbl;
                        const wkLabel = exp.week_number ? `wk ${String(exp.week_number).padStart(2,'0')}/${invData.year}` : monthLabel;
                        // Bij aantal+prijs/stuk: split in qty+tarief; anders qty=1 met totaal als tarief
                        const qty = (exp.quantity && exp.quantity > 0) ? exp.quantity : 1;
                        const tarief = (exp.unit_price && exp.unit_price > 0)
                            ? exp.unit_price
                            : (exp.amount || 0);
                        regels.push({
                            datum: wkLabel,
                            desc: desc,
                            qty: qty,
                            unit: (exp.quantity && exp.unit_price) ? 'stuks' : 'x',
                            tarief: tarief,
                            btw: 21
                        });
                    });
                }
            });

            const klant = invData.clientCompany || {};

            return {
                factuurNum: invoiceNumber,
                factuurDatum: todayStr,
                vervaldatum: dueDateStr,
                klant: {
                    company: klant.name || (invData.project && invData.project.client_name) || '',
                    contact: klant.contact_person ? ('t.a.v. ' + klant.contact_person) : 't.a.v. crediteurenadministratie',
                    email: klant.invoice_email || klant.email || '',
                    address1: klant.address || '',
                    address2: ((klant.postcode || '') + ' ' + (klant.city || '')).trim()
                },
                project: projectName,
                projectCodeKTS: (invData.project && invData.project.project_code) || '',
                projectNummer: (invData.project && invData.project.client_project_number) || '',
                opdrachtNummer: (invData.project && invData.project.opdracht_number) || '',
                poNummer: (invData.project && invData.project.po_number) || '',
                // Loonheffingsnummers · uit invData (project-override) of default uit KTS_INFO.
                // Project kan loonheffingen uitzetten via show_loonheffingen=false.
                loonheffingen: (invData.loonheffingen && invData.loonheffingen.length > 0)
                    ? invData.loonheffingen
                    : ((invData.project && invData.project.show_loonheffingen === false)
                        ? []
                        : (KTS_INFO.loonheffingen || [])),
                regels: regels,
                iban: (typeof KTS_INFO !== 'undefined' && KTS_INFO.iban) ? KTS_INFO.iban : 'NL61 BUNQ 2113 3747 30',
                bic: 'BUNQNL2A',
                paymentTerm: (payTermDays || 30) + ' dagen na factuurdatum'
            };
        }

        // Factuur PDF generator · accepteert data + options, returned doc
        async function generateFactuurPdf(data, options = {}) {
            if (!window.jspdf) { showToast && showToast('⚠️ PDF library nog niet geladen'); return null; }
            const pdfImages = window.KTS_PDF_IMAGES || {};
            const KTS_LOGO_B64 = pdfImages.logo || null;
            const TANDWIEL = pdfImages.tandwiel || null;
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pdfFont = doc.getFontList()['DaxlinePro'] ? 'DaxlinePro' : 'helvetica';

            const pw = 210, ph = 297, ml = 12, mr = 12, mt = 12, uw = pw - ml - mr;
            const ktsBlue = [7, 86, 127];
            const ktsAccent = [58, 156, 197];  // accent-light (#3A9CC5) · website match
            const ink900 = [15, 27, 45];
            const ink500 = [92, 102, 117];
            const ink400 = [138, 147, 161];
            const lineCol = [180, 180, 180];
            const lineColLight = [220, 220, 220];

            // Watermark
            if (TANDWIEL) {
                try {
                    const wmSize = 180;
                    doc.saveGraphicsState && doc.saveGraphicsState();
                    doc.setGState && doc.setGState(new doc.GState({ opacity: 0.08 }));
                    doc.addImage(TANDWIEL, 'PNG', (pw - wmSize) / 2, (ph - wmSize) / 2, wmSize, wmSize);
                    doc.restoreGraphicsState && doc.restoreGraphicsState();
                } catch (e) {}
            }

            let y = mt;

            // Header · tandwiel + FACTUUR (links), KTS logo+adres (rechts)
            doc.setFontSize(20);
            doc.setFont(pdfFont, 'bold');
            doc.setTextColor(...ktsBlue);
            const titleY = y + 6;
            const iconSize = 10;
            if (TANDWIEL) {
                try { doc.addImage(TANDWIEL, 'PNG', ml, titleY - iconSize + 3, iconSize, iconSize); } catch (e) {}
            }
            doc.text('FACTUUR', ml + (TANDWIEL ? iconSize + 3 : 0), titleY);

            // Accent-light hairline onder titel · website-stijl signature
            const titleX_inv = ml + (TANDWIEL ? iconSize + 3 : 0);
            const titleW_inv = doc.getTextWidth('FACTUUR');
            doc.setFillColor(...ktsAccent);
            doc.rect(titleX_inv, titleY + 2, Math.min(titleW_inv, 35), 0.8, 'F');

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

            // Klant-blok onder titel
            y = titleY + 8;
            doc.setFontSize(7);
            doc.setFont(pdfFont, 'bold');
            doc.setTextColor(...ktsAccent);     // eyebrow-stijl 'AAN' (website match)
            doc.text('AAN', ml, y);
            y += 4;
            doc.setFontSize(10);
            doc.setFont(pdfFont, 'bold');
            doc.setTextColor(...ink900);
            doc.text(data.klant.company, ml, y);
            y += 5;
            doc.setFont(pdfFont, 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...ink500);
            [data.klant.contact, data.klant.email, data.klant.address1, data.klant.address2].forEach(line => {
                if (line) { doc.text(line, ml, y); y += 4; }
            });
            y += 6;

            // Info-bar 4 cellen (variabele breedte)
            const infoCells = [
                { label: 'FACTUURNUMMER', value: data.factuurNum,    w: 30 },
                { label: 'FACTUURDATUM',  value: data.factuurDatum,  w: 30 },
                { label: 'VERVALDATUM',   value: data.vervaldatum,   w: 30 },
                { label: 'PROJECT',       value: data.project,       w: uw - 90 }
            ];
            const infoH = 14;
            let icx = ml;
            infoCells.forEach((c) => {
                doc.setFillColor(248, 248, 244);
                doc.rect(icx, y, c.w, infoH, 'F');
                doc.setDrawColor(...lineColLight);
                doc.setLineWidth(0.15);
                doc.rect(icx, y, c.w, infoH);
                doc.setFontSize(7);
                doc.setFont(pdfFont, 'bold');
                doc.setTextColor(...ktsAccent);     // eyebrow-stijl labels (website match)
                doc.text(c.label, icx + 3, y + 4);
                doc.setFont(pdfFont, 'bold');
                doc.setTextColor(...ink900);
                const value = String(c.value || '');
                if (c.label === 'PROJECT') {
                    doc.setFontSize(10);
                    const maxWidth = c.w - 6;
                    if (doc.getTextWidth(value) <= maxWidth) {
                        doc.text(value, icx + 3, y + 11);
                    } else {
                        doc.setFontSize(9);
                        const wrapped = doc.splitTextToSize(value, maxWidth);
                        doc.text(wrapped[0], icx + 3, y + 9);
                        if (wrapped[1]) doc.text(wrapped[1], icx + 3, y + 13);
                    }
                } else {
                    doc.setFontSize(11);
                    doc.text(value, icx + 3, y + 11);
                }
                icx += c.w;
            });
            y += infoH + 4;

            // Project-info als nette 2-koloms tabel · zelfde lettertype als klant-blok,
            // alternerende achtergrondkleur per rij voor leesbaarheid.
            // De project-NAAM zelf staat al in de info-bar ("PROJECT" cel) hierboven —
            // dus die NIET nogmaals in de tabel zetten (dubbele weergave).
            // Volgorde: KTS-projectcode → klant-velden → loonheffingsnummers.
            const projectTableRows = [
                { label: 'KTS-projectcode',      value: data.projectCodeKTS },
                { label: 'Projectnummer klant',  value: data.projectNummer },
                { label: 'Opdrachtnummer',       value: data.opdrachtNummer },
                { label: 'Inkoopordernummer',    value: data.poNummer }
            ].filter(r => r.value);
            // Loonheffingen toevoegen als sub-section
            (data.loonheffingen || []).forEach(l => {
                if (l && l.value) projectTableRows.push({ label: l.label, value: l.value });
            });

            if (projectTableRows.length > 0) {
                const ptRowH = 5.6;
                const ptTableW = uw;
                const ptLabelW = 95; // ruimte voor lange labels zoals "Loonheffingennummer KTDS Holding B.V."
                const ptHeaderH = 0; // geen kop · past compact onder de info-bar
                const ptStartY = y;
                projectTableRows.forEach((row, i) => {
                    const ry = ptStartY + i * ptRowH;
                    // Alternerende achtergrond
                    if (i % 2 === 0) {
                        doc.setFillColor(248, 248, 244);
                        doc.rect(ml, ry, ptTableW, ptRowH, 'F');
                    }
                    // Tekst · zelfde grootte/familie als de klant-info regels (9pt)
                    doc.setFontSize(8.5);
                    doc.setFont(pdfFont, 'bold');
                    doc.setTextColor(...ink500);
                    doc.text(row.label, ml + 2, ry + ptRowH / 2 + 1.4);
                    doc.setFont(pdfFont, 'normal');
                    doc.setTextColor(...ink900);
                    doc.text(String(row.value), ml + ptLabelW, ry + ptRowH / 2 + 1.4);
                });
                // Buitenrand om de tabel
                doc.setDrawColor(...lineColLight);
                doc.setLineWidth(0.15);
                doc.rect(ml, ptStartY, ptTableW, projectTableRows.length * ptRowH);
                y += projectTableRows.length * ptRowH + 4;
            } else {
                y += 4;
            }

            // Items-tabel: Periode | Omschrijving | Aantal | Tarief | Subtotaal | BTW%
            const itemCols = [
                { key:'datum',     label:'PERIODE',      w: 28,  align:'left' },
                { key:'desc',      label:'OMSCHRIJVING', w: 78,  align:'left' },
                { key:'qty',       label:'AANTAL',       w: 22,  align:'right' },
                { key:'tarief',    label:'TARIEF',       w: 22,  align:'right' },
                { key:'subtotal',  label:'SUBTOTAAL',    w: 24,  align:'right' },
                { key:'btw',       label:'BTW %',        w: 12,  align:'right' }
            ];
            const itemTotalW = itemCols.reduce((s,c)=>s+c.w,0);
            const itemHeaderH = 7;
            const itemRowH = 9;
            doc.setFillColor(...ktsBlue);
            doc.rect(ml, y, itemTotalW, itemHeaderH, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.setFont(pdfFont, 'bold');
            let cx = ml;
            itemCols.forEach(c => {
                const tx = c.align === 'left' ? cx + 2 : c.align === 'right' ? cx + c.w - 2 : cx + c.w / 2;
                doc.text(c.label, tx, y + 4.5, { align: c.align });
                cx += c.w;
            });
            y += itemHeaderH;

            const fmtEuroLocal = (n) => '€ ' + (n || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            const items = data.regels || [];
            // Combi-mode: items bevat groupHeader-rijen (geen subtotaal-bijdrage). Voor de
            // tabel-hoogte tellen die ook mee · ze zijn ietsje dunner dan een normale rij.
            const headerRowH = 7;
            // Bereken totale tabel-hoogte aan de hand van de mix
            const calcRowsHeight = () => {
                let h = 0;
                items.forEach(it => { h += it.groupHeader ? headerRowH : itemRowH; });
                // Minimaal 5 normale rijen aan visuele hoogte aanhouden voor lege facturen
                const minNormalRows = 5;
                const normalCount = items.filter(it => !it.groupHeader).length;
                if (normalCount < minNormalRows) h += (minNormalRows - normalCount) * itemRowH;
                return h;
            };
            const tableBodyH = calcRowsHeight();
            const tableYStart = y;

            let subtotaalAll = 0;
            const btwBuckets = {};
            let normalRowIdx = 0; // teller voor zebra-kleur op niet-header rijen
            const lightCellBg = [248, 248, 244];
            const headerBandBg = [232, 240, 248]; // licht KTS-blauw zweem

            items.forEach(item => {
                if (item.groupHeader) {
                    // Tussenkop: gekleurde band over de hele tabel-breedte met de naam links
                    doc.setFillColor(...headerBandBg);
                    doc.rect(ml, y, itemTotalW, headerRowH, 'F');
                    doc.setDrawColor(...lineColLight);
                    doc.setLineWidth(0.15);
                    doc.line(ml, y + headerRowH, ml + itemTotalW, y + headerRowH);
                    doc.setFontSize(9);
                    doc.setFont(pdfFont, 'bold');
                    doc.setTextColor(...ktsBlue);
                    doc.text(item.label || '', ml + 2, y + headerRowH / 2 + 1.4);
                    y += headerRowH;
                    return;
                }

                if (normalRowIdx % 2 === 1) {
                    doc.setFillColor(...lightCellBg);
                    doc.rect(ml, y, itemTotalW, itemRowH, 'F');
                }
                normalRowIdx++;
                doc.setDrawColor(...lineColLight);
                doc.setLineWidth(0.15);
                doc.line(ml, y + itemRowH, ml + itemTotalW, y + itemRowH);

                const subtotal = (item.qty || 0) * (item.tarief || 0);
                subtotaalAll += subtotal;
                btwBuckets[item.btw] = (btwBuckets[item.btw] || 0) + subtotal;
                cx = ml;
                itemCols.forEach(c => {
                    let v = '';
                    if (c.key === 'datum')    v = item.datum;
                    if (c.key === 'desc')     v = item.desc;
                    if (c.key === 'qty')      v = ((item.qty != null) ? item.qty.toLocaleString('nl-NL') : '') + (item.unit ? ' ' + item.unit : '');
                    if (c.key === 'tarief')   v = fmtEuroLocal(item.tarief);
                    if (c.key === 'subtotal') v = fmtEuroLocal(subtotal);
                    if (c.key === 'btw')      v = (item.btw != null ? item.btw + '%' : '');
                    const tx = c.align === 'left' ? cx + 2 : c.align === 'right' ? cx + c.w - 2 : cx + c.w / 2;
                    doc.setFontSize(c.key === 'desc' ? 8.5 : 9);
                    doc.setFont(pdfFont, c.key === 'subtotal' ? 'bold' : 'normal');
                    doc.setTextColor(...ink900);
                    let txt = String(v);
                    if (c.key === 'desc' && txt.length > 64) txt = txt.substring(0, 61) + '...';
                    doc.text(txt, tx, y + itemRowH / 2 + 1.5, { align: c.align });
                    cx += c.w;
                });
                y += itemRowH;
            });

            // Aanvullende lege rijen voor visuele hoogte (alleen single, of als combi te kort is)
            const minNormalRows = 5;
            const normalCount = items.filter(it => !it.groupHeader).length;
            for (let i = normalCount; i < minNormalRows; i++) {
                if (normalRowIdx % 2 === 1) {
                    doc.setFillColor(...lightCellBg);
                    doc.rect(ml, y, itemTotalW, itemRowH, 'F');
                }
                normalRowIdx++;
                doc.setDrawColor(...lineColLight);
                doc.setLineWidth(0.15);
                doc.line(ml, y + itemRowH, ml + itemTotalW, y + itemRowH);
                y += itemRowH;
            }

            // Verticale tabel-lijntjes · alleen tussen normal cells, dus over hele body
            cx = ml;
            doc.setDrawColor(...lineColLight);
            for (let i = 0; i <= itemCols.length; i++) {
                doc.line(cx, tableYStart, cx, y);
                if (i < itemCols.length) cx += itemCols[i].w;
            }
            doc.setDrawColor(...lineCol);
            doc.setLineWidth(0.3);
            doc.rect(ml, tableYStart - itemHeaderH, itemTotalW, itemHeaderH + (y - tableYStart));

            y += 6;

            // Totalen-blok rechts
            const totBlockW = 80;
            const totX = pw - mr - totBlockW;
            const btwRows = Object.entries(btwBuckets).map(([pct, base]) => ({
                pct: parseFloat(pct), base, amount: base * (parseFloat(pct) / 100)
            }));
            const totalIncl = subtotaalAll + btwRows.reduce((s, r) => s + r.amount, 0);
            const totH = 18 + btwRows.length * 5 + 14;
            doc.setFillColor(248, 248, 244);
            doc.rect(totX, y, totBlockW, totH - 12, 'F');
            doc.setDrawColor(...lineColLight);
            doc.rect(totX, y, totBlockW, totH - 12);
            let trY = y + 6;
            doc.setFontSize(8.5);
            doc.setFont(pdfFont, 'normal');
            doc.setTextColor(...ink500);
            doc.text('Subtotaal excl. BTW', totX + 3, trY);
            doc.setFont(pdfFont, 'bold');
            doc.setTextColor(...ink900);
            doc.text(fmtEuroLocal(subtotaalAll), totX + totBlockW - 3, trY, { align: 'right' });
            trY += 6;
            btwRows.forEach(r => {
                doc.setFont(pdfFont, 'normal');
                doc.setTextColor(...ink500);
                doc.text(`BTW ${r.pct}% over ${fmtEuroLocal(r.base)}`, totX + 3, trY);
                doc.setFont(pdfFont, 'bold');
                doc.setTextColor(...ink900);
                doc.text(fmtEuroLocal(r.amount), totX + totBlockW - 3, trY, { align: 'right' });
                trY += 5;
            });
            const totalBandY = y + totH - 12;
            doc.setFillColor(...ktsBlue);
            doc.rect(totX, totalBandY, totBlockW, 12, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(9);
            doc.setFont(pdfFont, 'bold');
            doc.text('TOTAAL TE BETALEN', totX + 3, totalBandY + 4.5);
            doc.setFontSize(13);
            doc.text(fmtEuroLocal(totalIncl), totX + totBlockW - 3, totalBandY + 5, { align: 'right' });

            y += totH + 6;
            y += 12; // 3 witregels lucht voor het betaal-verzoek

            // Betaal-verzoek (2 regels) + IBAN
            doc.setFontSize(9);
            doc.setFont(pdfFont, 'normal');
            doc.setTextColor(...ink900);
            doc.text(`Wij verzoeken u vriendelijk het totaalbedrag van ${fmtEuroLocal(totalIncl)} uiterlijk ${data.vervaldatum} over te maken,`, ml, y);
            y += 4;
            doc.text(`onder vermelding van factuurnummer ${data.factuurNum}, naar onderstaande bankrekening:`, ml, y);
            y += 6;
            doc.setFont(pdfFont, 'bold');
            doc.setTextColor(...ktsBlue);
            doc.text(`IBAN  ${data.iban}`, ml, y);
            doc.setTextColor(...ink500);
            doc.setFont(pdfFont, 'normal');
            doc.setFontSize(8.5);
            doc.text(`t.n.v. Kuijpers Technical Services BV  ·  BIC: ${data.bic}`, ml, y + 4);

            // Footer
            doc.setFontSize(7);
            doc.setFont(pdfFont, 'normal');
            doc.setTextColor(...ink400);
            const footerY = ph - 5;
            doc.text('Op deze factuur zijn de Algemene Voorwaarden 2026 van Kuijpers Technical Services BV van toepassing.', ml, footerY);
            doc.text('KvK 93410557  ·  BTW NL866385368B01', pw - mr, footerY, { align: 'right' });

            if (options.save) {
                const slug = (data.klant.company || '').replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
                const fileName = options.fileName || `KTS-Factuur_${data.factuurNum}${slug ? '_' + slug : ''}.pdf`;
                doc.save(fileName);
            }
            return doc;
        }

        // Productie-wrapper: behoud van duplicaat-check + save/upload-flow
        async function generateInvoicePDF() {
            const invData = window._currentInvoiceData;
            if (!invData) { showToast('⚠️ Maak eerst een preview'); return; }
            if (!window.jspdf) { showToast('⚠️ PDF library nog niet geladen'); return; }

            // Factuurnummer (custom of auto)
            const today = new Date();
            const ddmmyyyy = String(today.getDate()).padStart(2,'0') + String(today.getMonth()+1).padStart(2,'0') + today.getFullYear();
            const customNum = document.getElementById('inv-custom-number')?.value?.trim();
            const invoiceNumber = customNum || ('F-' + (invData.project?.project_code || '') + '-' + ddmmyyyy);

            // Duplicaat-check
            const sb = getSupabase();
            try {
                const { data: dupCheck } = await sb.from('invoices').select('id').eq('invoice_number', invoiceNumber).limit(1);
                if (dupCheck && dupCheck.length > 0) {
                    if (!await confirmAsync('Factuurnummer "' + invoiceNumber + '" bestaat al! Toch doorgaan?')) return;
                }
            } catch(e) { console.warn('Duplicaat check mislukt:', e); }

            const payTermDays = getPaymentTermDays(invData.clientCompany?.id);
            const data = adaptInvoiceData(invData, invoiceNumber, payTermDays);
            const doc = await generateFactuurPdf(data, { save: false });
            if (!doc) return;

            // Filename volgt KTS-naming-conventie: KTS-Factuur_{factuurnum}_{klant}.pdf
            const clientName = invData.clientCompany?.name || invData.project?.client_name || '';
            const fileName = ktsFactuurName(invoiceNumber, clientName);

            // Save lokaal (folder of download)
            const savedInv = await savePdfToFolder(doc, fileName, 'facturen');
            if (!savedInv) doc.save(fileName);

            // Upload naar Supabase
            await uploadInvoiceToSupabase(
                `${invData.year}/${invData.project?.project_code || 'unknown'}/${fileName}`,
                doc.output('arraybuffer'),
                invData,
                invoiceNumber
            );
        }

        async function uploadInvoiceToSupabase(filePath, pdfBuffer, invData, invoiceNumber) {
            const sb = getSupabase();
            if (!sb) return;

            try {
                // Verzamel alle weken + bereken totaal excl. BTW over alle users (single + combi).
                // Inclusief extra kosten (expenses) zodat het totaalbedrag klopt met de factuur.
                const perUser = invData.perUser || {};
                const allWeekNums = new Set();
                let totalExclBtw = 0;
                Object.keys(perUser).forEach(uid => {
                    const bucket = perUser[uid];
                    Object.values(bucket.weekData || {}).forEach(w => {
                        allWeekNums.add(w.weekNum);
                        totalExclBtw += (w.regHours * bucket.rate.hourly_rate)
                            + (w.satHours * bucket.rate.hourly_rate * bucket.rate.saturday_multiplier)
                            + (w.sunHours * bucket.rate.hourly_rate * bucket.rate.sunday_holiday_multiplier)
                            + ((w.totalKm || 0) * bucket.rate.km_rate)
                            + ((w.hotelNights || 0) * (bucket.hotelRate || 0));
                    });
                    // Expenses ook meetellen · en hun weeknummers
                    (bucket.expenses || []).forEach(exp => {
                        if (exp.week_number) allWeekNums.add(exp.week_number);
                        totalExclBtw += parseFloat(exp.amount) || 0;
                    });
                });
                const invoicedWeekNumbers = [...allWeekNums].sort((a, b) => a - b);

                // Insert: combi krijgt user_id=NULL + user_ids=[…], single krijgt user_id=… + user_ids=NULL
                const insertRow = {
                    invoice_number: invoiceNumber,
                    user_id: invData.isCombi ? null : invData.userId,
                    user_ids: invData.isCombi ? invData.userIds : null,
                    project_id: invData.projectId,
                    year: invData.year,
                    month: invData.month,
                    weeks: invoicedWeekNumbers,
                    storage_path: filePath,
                    total_excl_btw: totalExclBtw
                };
                let { error: insertErr } = await sb.from('invoices').insert(insertRow);
                // Fallback voor oude DB zonder user_ids kolom: probeer zonder
                if (insertErr && /user_ids/.test(insertErr.message || '')) {
                    console.warn('user_ids kolom niet aanwezig · fallback zonder. Voer migratie-combi-factuur.sql uit.');
                    delete insertRow.user_ids;
                    if (invData.isCombi && invData.userIds && invData.userIds.length > 0) {
                        // Zet de eerste user als hoofduser zodat de factuur in elk geval zichtbaar blijft
                        insertRow.user_id = invData.userIds[0];
                    }
                    ({ error: insertErr } = await sb.from('invoices').insert(insertRow));
                }
                if (insertErr) throw insertErr;

                showToast('✓ Factuur opgeslagen in database');
                loadInvoices();

                // Email met PDF bijlage + OneDrive upload via Edge Function
                const clientEmail = getContactEmailsByRole(invData.clientCompany, 'receives_factuur');
                const MONTHS_NL = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
                const pdfBytes = new Uint8Array(pdfBuffer); let pdfBin = ''; for (let i = 0; i < pdfBytes.length; i++) pdfBin += String.fromCharCode(pdfBytes[i]); const pdfBase64 = btoa(pdfBin);
                // Filename voor email-bijlage: KTS-Factuur_…
                const clientNameMail = invData.clientCompany?.name || invData.project?.client_name || '';
                const fileName = ktsFactuurName(invoiceNumber, clientNameMail);

                try {
                    showToast('📧 Factuur versturen...');
                    // Combi: alle namen achter elkaar; single: één naam
                    let userNameForMail = invData.user?.name || '';
                    if (invData.isCombi && invData.perUser) {
                        userNameForMail = Object.values(invData.perUser)
                            .map(b => b.user?.name || b.user?.email || '')
                            .filter(Boolean)
                            .join(' + ');
                    }
                    const { data, error } = await sb.functions.invoke('send-invoice', {
                        body: {
                            pdfBase64: pdfBase64,
                            fileName: fileName,
                            invoiceNumber: invoiceNumber,
                            userName: userNameForMail,
                            projectCode: invData.project?.project_code || '',
                            projectName: invData.project?.name || '',
                            period: MONTHS_NL[invData.month - 1] + ' ' + invData.year,
                            paymentTermDays: getPaymentTermDays(invData.clientCompany?.id),
                            totalInclBtw: invData.totalInclBtw || '',
                            recipientEmail: clientEmail || '',
                            recipientName: getContactNameByRole(invData.clientCompany, 'receives_factuur') || '',
                        }
                    });
                    if (!error && data?.success) {
                        showToast('✅ Factuur verstuurd' + (data.email ? ' + email verzonden' : ' naar OneDrive'));
                    } else {
                        console.warn('Edge Function fout:', error || data);
                        showToast('⚠️ OneDrive/email mislukt · PDF is wel lokaal opgeslagen');
                    }
                } catch (edgeErr) {
                    console.warn('Edge Function niet beschikbaar:', edgeErr);
                    showToast('⚠️ Edge Function niet bereikbaar · PDF is wel lokaal opgeslagen');
                }
            } catch (err) {
                console.error('Factuur opslaan mislukt:', err);
                showToast('⚠️ PDF gedownload maar opslaan in database mislukt');
            }
        }

        // ===== Archief-filter state voor facturen =====
        // status: 'open' | 'paid' | 'all'   year: '' (alle) of jaartal als string
        let _invFilter = { status: 'open', year: String(new Date().getFullYear()) };
        function setInvFilter(status) {
            _invFilter.status = status;
            document.querySelectorAll('[data-inv-status]').forEach(b => {
                b.classList.toggle('active', b.dataset.invStatus === status);
            });
            loadInvoices();
        }
        function setInvYearFilter(year) {
            _invFilter.year = year || '';
            loadInvoices();
        }

        async function adminMarkInvoicePaid(id, number, paid) {
            const sb = getSupabase();
            if (!sb) return;
            const updates = paid
                ? { paid_at: new Date().toISOString(), paid_by: currentUser?.id || null }
                : { paid_at: null, paid_by: null };
            const { error } = await sb.from('invoices').update(updates).eq('id', id);
            if (error) { showToast('❌ ' + error.message); return; }
            showToast(paid ? `✓ Factuur ${number} → betaald` : `↩ Factuur ${number} → open`);
            loadInvoices();
        }

        async function loadInvoices() {
            const sb = getSupabase();
            if (!sb) return;
            const listEl = document.getElementById('inv-list');
            if (!listEl) return;
            listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.85rem">Laden...</div>';

            try {
                const { data: invoices, error } = await sb.from('invoices')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (error) throw error;

                // Filter op test/productie modus · combi-factuur (user_ids) telt mee als
                // ten minste één van zijn users in het filter zit
                const filteredUserIds = new Set(getFilteredUsers().map(u => u.id));
                let filteredInvoices = (invoices || []).filter(inv => {
                    if (inv.user_id && filteredUserIds.has(inv.user_id)) return true;
                    if (Array.isArray(inv.user_ids) && inv.user_ids.some(uid => filteredUserIds.has(uid))) return true;
                    return false;
                });

                // Vul jaar-dropdown op basis van wat in DB zit
                const yearsInData = [...new Set(filteredInvoices.map(i => i.year).filter(Boolean))].sort((a,b) => b-a);
                const yearSel = document.getElementById('inv-year-filter');
                if (yearSel) {
                    const currentVal = _invFilter.year;
                    const yearOpts = ['<option value="">Alle jaren</option>'].concat(
                        yearsInData.map(y => `<option value="${y}"${String(y) === currentVal ? ' selected' : ''}>${y}</option>`)
                    );
                    yearSel.innerHTML = yearOpts.join('');
                    // Restore selection als die nog bestaat, anders fallback
                    if (currentVal && !yearsInData.includes(parseInt(currentVal))) {
                        yearSel.value = '';
                        _invFilter.year = '';
                    } else {
                        yearSel.value = currentVal;
                    }
                }

                // Filter op archief-status
                if (_invFilter.status === 'open')   filteredInvoices = filteredInvoices.filter(i => !i.paid_at);
                if (_invFilter.status === 'paid')   filteredInvoices = filteredInvoices.filter(i =>  i.paid_at);
                // Filter op jaar
                if (_invFilter.year) filteredInvoices = filteredInvoices.filter(i => String(i.year) === _invFilter.year);

                if (!filteredInvoices || filteredInvoices.length === 0) {
                    const leegMsg = _invFilter.status === 'paid'
                        ? 'Nog geen betaalde facturen in archief'
                        : _invFilter.status === 'open'
                            ? 'Geen open facturen. Alles is betaald.'
                            : 'Nog geen facturen gegenereerd';
                    listEl.innerHTML = `<div style="text-align:center;padding:30px;color:var(--muted);font-size:0.85rem">${leegMsg}</div>`;
                    return;
                }

                const userMap = {};
                (window._adminUsers || []).forEach(u => { userMap[u.id] = escapeHtml(u.name || u.email); });
                const projMap = {};
                (window._adminProjects || []).forEach(p => { projMap[p.id] = escapeHtml(p.project_code + ' · ' + p.name); });
                const MONTHS_SHORT = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];

                listEl.innerHTML = filteredInvoices.map(inv => {
                    // Combi (user_ids gevuld): toon alle namen + COMBI-badge
                    let userLabel;
                    if (Array.isArray(inv.user_ids) && inv.user_ids.length > 0) {
                        const names = inv.user_ids.map(uid => userMap[uid] || 'Onbekend').join(' + ');
                        userLabel = `<span style="background:var(--app-ok-soft);color:var(--app-ok);padding:1px 6px;border-radius:4px;font-size:0.65rem;font-weight:700;margin-right:4px">👥 COMBI</span>${names}`;
                    } else {
                        userLabel = userMap[inv.user_id] || 'Onbekend';
                    }
                    const projLabel = projMap[inv.project_id] || 'Onbekend';
                    const maandTekst = MONTHS_SHORT[(inv.month || 1) - 1] + ' ' + inv.year;
                    const datumTekst = new Date(inv.created_at).toLocaleDateString('nl-NL');
                    const isPaid = !!inv.paid_at;
                    const paidBadge = isPaid
                        ? `<span class="archief-paid-badge" title="Betaald op ${new Date(inv.paid_at).toLocaleDateString('nl-NL')}">✓ Betaald</span>`
                        : '';
                    const safeNumber = inv.invoice_number.replace(/'/g, "\\'");
                    const paidBtn = isPaid
                        ? `<button onclick="adminMarkInvoicePaid('${inv.id}', '${safeNumber}', false)" class="btn btn-sm" style="white-space:nowrap;padding:6px 10px;background:var(--app-bg-tint);color:var(--app-ink-700);border:1px solid var(--app-line)" title="Markeer als open">↩</button>`
                        : `<button onclick="adminMarkInvoicePaid('${inv.id}', '${safeNumber}', true)" class="btn btn-sm" style="white-space:nowrap;padding:6px 10px;background:var(--app-ok-soft);color:var(--app-ok);border:1px solid var(--app-ok-line)" title="Markeer als betaald">✓</button>`;

                    return `<div class="entry-card" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
                        <div style="flex:1;min-width:0">
                            <div style="font-weight:600;font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">🧾 ${inv.invoice_number} ${paidBadge}</div>
                            <div style="font-size:0.75rem;color:var(--muted)">${userLabel} · ${projLabel}</div>
                            <div style="font-size:0.7rem;color:var(--muted)">${maandTekst} · ${datumTekst}</div>
                        </div>
                        <div style="display:flex;gap:4px;align-items:center">
                            ${paidBtn}
                            <button onclick="downloadInvoice('${inv.storage_path}')" class="btn btn-primary btn-sm" style="white-space:nowrap;padding:6px 10px">📄</button>
                            <button onclick="adminDeleteInvoice('${inv.id}', '${safeNumber}')" class="btn btn-sm" style="white-space:nowrap;padding:6px 10px;background:var(--app-alert-soft);color:var(--app-alert);border:1px solid var(--app-alert-line)" title="Verwijderen">🗑️</button>
                        </div>
                    </div>`;
                }).join('');

            } catch (err) {
                console.error('Facturen laden mislukt:', err);
                listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--app-alert);font-size:0.85rem">Fout bij laden: ' + err.message + '</div>';
            }
        }

        async function downloadInvoice(path) {
            const sb = getSupabase();
            if (!sb) return;
            try {
                const { data, error } = await sb.storage.from('facturen').download(path);
                if (error) throw error;
                const url = URL.createObjectURL(data);
                const a = document.createElement('a');
                a.href = url;
                a.download = path.split('/').pop();
                a.click();
                URL.revokeObjectURL(url);
                showToast('✓ Factuur gedownload');
            } catch (err) {
                showToast('❌ Download mislukt: ' + err.message);
            }
        }

        async function adminDeleteInvoice(invoiceId, invoiceNumber) {
            if (!await confirmAsync(`Factuur "${invoiceNumber}" verwijderen?`, true)) return;
            const sb = getSupabase();
            if (!sb) return;
            try {
                // Haal storage_path op
                const { data: inv } = await sb.from('invoices').select('storage_path').eq('id', invoiceId).single();

                // Verwijder uit invoices tabel
                const { error: delErr } = await sb.from('invoices').delete().eq('id', invoiceId);
                if (delErr) throw delErr;

                // Verwijder PDF uit Storage
                if (inv && inv.storage_path) {
                    await sb.storage.from('facturen').remove([inv.storage_path]);
                }

                showToast('✓ Factuur verwijderd');
                loadInvoices();
            } catch (err) {
                console.error('Factuur verwijderen mislukt:', err);
                showToast('❌ Verwijderen mislukt: ' + err.message);
            }
        }

        // ===== EINDE FACTUUR GENERATOR =====

        async function aggregatePOData(userId, projectId, year, month, weekNumber=null) {
            const sb = getSupabase();
            if (!sb) return null;

            // Bereken datumbereik · uitgebreid zodat weken op maandgrens compleet mee komen
            const yr = parseInt(year);
            const mo = parseInt(month);
            const firstDay = new Date(yr, mo - 1, 1);
            const lastDay = new Date(yr, mo, 0);

            // Uitbreiden: 7 dagen voor begin en 7 dagen na einde van de maand
            // zodat weken op de maandgrens volledig worden meegenomen
            const extendedFrom = new Date(firstDay);
            extendedFrom.setDate(extendedFrom.getDate() - 7);
            const extendedTo = new Date(lastDay);
            extendedTo.setDate(extendedTo.getDate() + 7);
            const dateFrom = toLocalDateStr(extendedFrom);
            const dateTo = toLocalDateStr(extendedTo);

            // Bepaal welke ISO weken bij deze maand horen. Weken worden als
            // "isoJaar-weekNr" gesleuteld: rond de jaarwisseling kan week 1 van
            // het nieuwe ISO-jaar al in december vallen (en week 52/53 van het
            // oude jaar in januari) · zonder het ISO-jaar erbij zou week 1 van
            // 2027 (29-31 dec) botsen met week 1 van 2026 (januari).
            const isoKey = (jr, wk) => `${jr}-${wk}`;
            const monthWeeks = new Set();
            const d = new Date(firstDay);
            while (d <= lastDay) {
                monthWeeks.add(isoKey(getISOYear(new Date(d.getTime())), getISOWeek(new Date(d.getTime()))));
                d.setDate(d.getDate() + 1);
            }
            // ISO-jaren die deze maand kunnen raken (dec: yr en yr+1 · jan: yr-1 en yr)
            const isoYears = [yr - 1, yr, yr + 1];

            // Query time_entries met uitgebreid datumfilter
            let query = sb.from('time_entries').select('*')
                .eq('user_id', userId)
                .eq('project_id', projectId)
                .gte('entry_date', dateFrom)
                .lte('entry_date', dateTo);

            const { data: entries, error: entriesErr } = await query;
            if (entriesErr) {
                console.error('Error loading time entries:', entriesErr);
                return null;
            }

            // Haal week_status op · alleen 'verstuurd' + 'goedgekeurd' weken mee te nemen.
            // .in op isoYears i.p.v. .eq(yr): week_status.year is het ISO-jaar en
            // dat kan rond de jaarwisseling afwijken van het kalenderjaar.
            const { data: weekStatuses } = await sb.from('week_status').select('week_number, year, status, approval_status')
                .eq('user_id', userId)
                .eq('project_id', projectId)
                .in('year', isoYears)
                .eq('status', 'verstuurd');
            const goedgekeurdeWeken = new Set((weekStatuses || []).filter(ws => ws.approval_status === 'goedgekeurd').map(ws => isoKey(ws.year, ws.week_number)));
            const wachtOpGoedkeuring = (weekStatuses || []).filter(ws => ws.approval_status !== 'goedgekeurd');
            console.log('PO: goedgekeurde weken:', [...goedgekeurdeWeken]);
            if (wachtOpGoedkeuring.length > 0) console.log('PO: weken wachtend op goedkeuring:', wachtOpGoedkeuring.map(ws => `W${ws.week_number}/${ws.year} (${ws.approval_status || 'geen'})`));

            // Check welke weken al op een eerdere PO staan (dubbel-beveiliging)
            const { data: existingPOWeeks } = await sb.from('inkooporder_weeks').select('week_number, year, io_number')
                .eq('user_id', userId)
                .eq('project_id', projectId)
                .in('year', isoYears);
            const alOpIO = new Map();
            (existingPOWeeks || []).forEach(pw => alOpIO.set(isoKey(pw.year, pw.week_number), pw.io_number));
            if (alOpIO.size > 0) console.log('PO: weken al op eerdere PO:', Object.fromEntries(alOpIO));

            // Filter op verstuurd + specifiek weeknummer + NIET al op PO
            // + week moet bij de geselecteerde maand horen (hele week mee, ook over maandgrens)
            const skippedWeeks = [];
            const filtered = (entries || []).filter(e => {
                if (!e.entry_date) return false;
                const entryDay = new Date(e.entry_date + 'T12:00:00');
                const isoWeek = getISOWeek(entryDay);
                const key = isoKey(getISOYear(entryDay), isoWeek);
                // Week moet bij de geselecteerde maand horen
                if (!monthWeeks.has(key)) return false;
                // Alleen goedgekeurde weken meenemen (klant moet eerst goedkeuren)
                if (!goedgekeurdeWeken.has(key)) return false;
                // Week al op eerdere PO? Overslaan
                if (alOpIO.has(key)) {
                    if (!skippedWeeks.includes(isoWeek)) skippedWeeks.push(isoWeek);
                    return false;
                }
                if (weekNumber) {
                    if (isoWeek !== parseInt(weekNumber)) return false;
                }
                return true;
            });

            console.log('PO aggregatie:', filtered.length, 'entries gevonden voor', dateFrom, '-', dateTo, weekNumber ? '(week ' + weekNumber + ')' : '');
            if (skippedWeeks.length > 0) console.log('PO: overgeslagen weken (al op PO):', skippedWeeks);

            // Query rates (user-specifiek → project-breed → defaults)
            const { data: allRates } = await sb.from('rates').select('*')
                .eq('project_id', projectId)
                .order('valid_from', { ascending: false });

            let rate = { hourly_rate: 85, km_rate: 0.50, saturday_multiplier: 1.50, sunday_holiday_multiplier: 2.00 };
            if (allRates && allRates.length > 0) {
                // Prioriteit: user-specifiek, daarna project-breed
                const userRate = allRates.find(r => r.user_id === userId);
                const projRate = allRates.find(r => !r.user_id);
                const found = userRate || projRate;
                if (found) {
                    rate.hourly_rate = parseFloat(found.hourly_rate) || 85;
                    rate.km_rate = parseFloat(found.km_rate) || 0.50;
                    rate.saturday_multiplier = parseFloat(found.saturday_multiplier) || 1.50;
                    rate.sunday_holiday_multiplier = parseFloat(found.sunday_holiday_multiplier) || 2.00;
                }
            }
            console.log('PO rate:', rate);

            // Gebruiker ophalen
            const { data: user } = await sb.from('users').select('*').eq('id', userId).single();

            // Bedrijven ophalen via project
            const { data: project_for_companies } = await sb.from('projects').select('client_company_id, io_company_id').eq('id', projectId).single();

            // Factuur-ontvanger (opdrachtgever/eindklant)
            let company = null;
            if (project_for_companies && project_for_companies.client_company_id) {
                const { data: comp } = await sb.from('companies').select('*').eq('id', project_for_companies.client_company_id).single();
                company = comp;
            }

            // IO-ontvanger (opdrachtnemer/tussenpersoon) · als niet ingesteld: zelfde als factuur
            let ioCompany = null;
            if (project_for_companies && project_for_companies.io_company_id) {
                const { data: ioComp } = await sb.from('companies').select('*').eq('id', project_for_companies.io_company_id).single();
                ioCompany = ioComp;
            } else {
                ioCompany = company; // fallback naar factuur-ontvanger
            }

            // ZZP-bedrijf ophalen via user (voor LEVERANCIER op IO).
            // Multi-stage facturatie: als user.invoice_via_company_id gevuld is wordt
            // dat de leverancier (bv. Aad → Hydroart, factureert via HSW). Anders
            // fallback naar de eigen company_id.
            let zzpCompany = null;
            const supplierId = (user && user.invoice_via_company_id) || (user && user.company_id) || null;
            if (supplierId) {
                const { data: zzpComp } = await sb.from('companies').select('*').eq('id', supplierId).single();
                zzpCompany = zzpComp;
            }
            const hotelRate = (user && parseFloat(user.hotel_rate)) || 110;

            // Groepeer per ISO week · year is het ISO-jaar van de week zelf
            // (kan rond de jaarwisseling afwijken van het geselecteerde jaar)
            const weekData = {};
            filtered.forEach(entry => {
                const entryDate = new Date(entry.entry_date + 'T12:00:00');
                const isoWeek = getISOWeek(entryDate);
                const isoYr = getISOYear(entryDate);
                const weekKey = `week_${isoYr}_${String(isoWeek).padStart(2, '0')}`;

                if (!weekData[weekKey]) {
                    weekData[weekKey] = { regHours: 0, satHours: 0, sunHours: 0, totalKm: 0, hotelNights: 0, weekNum: isoWeek, year: isoYr };
                }

                const hours = parseFloat(entry.total_hours) || 0;
                const dayOfWeek = entryDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
                if (dayOfWeek >= 1 && dayOfWeek <= 5) {
                    weekData[weekKey].regHours += hours;
                } else if (dayOfWeek === 6) {
                    weekData[weekKey].satHours += hours;
                } else {
                    weekData[weekKey].sunHours += hours;
                }

                weekData[weekKey].totalKm += parseFloat(entry.km) || 0;
                if (entry.hotel === true) weekData[weekKey].hotelNights += 1;
            });

            // Project info
            const { data: project } = await sb.from('projects').select('*').eq('id', projectId).single();

            // Verzamel welke weken daadwerkelijk op deze PO komen.
            // includedWeeks: alleen weeknummers (voor weergave-teksten).
            // includedWeekPairs: {week, year} met het ISO-jaar per week · gebruikt
            // voor de inkooporder_weeks registratie zodat week 1 van het nieuwe
            // ISO-jaar op een december-IO onder het juiste jaar geboekt wordt.
            const includedWeekPairs = Object.values(weekData)
                .map(w => ({ week: w.weekNum, year: w.year }))
                .sort((a, b) => (a.year - b.year) || (a.week - b.week));
            const includedWeeks = includedWeekPairs.map(p => p.week);

            return {
                userId, projectId, year: yr, month: mo,
                weekNumber: weekNumber ? parseInt(weekNumber) : null,
                user, company, ioCompany, zzpCompany, project, rate, hotelRate, weekData, entries: filtered,
                includedWeeks, includedWeekPairs, skippedWeeks, wachtOpGoedkeuring
            };
        }

        async function previewPO() {
            const userId = document.getElementById('io-filter-user').value;
            const projectId = document.getElementById('io-filter-project').value;
            const year = document.getElementById('io-filter-year').value;
            const month = document.getElementById('io-filter-month').value;
            const useWeek = document.getElementById('io-use-week').checked;
            const weekNumber = useWeek ? document.getElementById('io-filter-week').value : null;

            if (!userId || !projectId || !year || !month) {
                showToast('⚠️ Selecteer project, medewerker, jaar en maand');
                return;
            }

            const ioData = await aggregatePOData(userId, projectId, year, month, weekNumber);
            if (!ioData) {
                showToast('⚠️ Geen data gevonden');
                return;
            }

            // Render preview
            const preview = document.getElementById('io-preview');
            const content = document.getElementById('io-preview-content');

            let html = '';

            // Waarschuwing bij overgeslagen weken (al op eerdere inkooporder)
            if (ioData.skippedWeeks && ioData.skippedWeeks.length > 0) {
                html += `<div style="background:var(--app-warn-soft);border:1px solid #f59e0b;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:0.85rem">
                    ⚠️ <strong>Week ${ioData.skippedWeeks.sort((a,b) => a-b).join(', ')}</strong> staat al op een eerdere inkooporder en is overgeslagen.
                </div>`;
            }

            // Waarschuwing bij weken die wachten op goedkeuring
            if (ioData.wachtOpGoedkeuring && ioData.wachtOpGoedkeuring.length > 0) {
                const waitWeeks = ioData.wachtOpGoedkeuring.map(ws => `Week ${ws.week_number}`).join(', ');
                html += `<div style="background:var(--app-warn-soft);border:1px solid #f59e0b;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:0.85rem">
                    ⏳ <strong>${waitWeeks}</strong> wacht${ioData.wachtOpGoedkeuring.length === 1 ? '' : 'en'} nog op goedkeuring door de opdrachtgever. Alleen goedgekeurde weken worden meegenomen.
                </div>`;
            }

            // Check of er data is
            if (ioData.includedWeeks.length === 0) {
                const reason = (ioData.wachtOpGoedkeuring && ioData.wachtOpGoedkeuring.length > 0)
                    ? 'Er zijn geen goedgekeurde weken beschikbaar. Wacht tot de opdrachtgever de weekstaten heeft goedgekeurd.'
                    : 'Geen nieuwe weken beschikbaar voor inkooporder. Alle verstuurde weken staan al op een eerdere inkooporder.';
                html += `<div style="text-align:center;color:var(--muted);padding:20px;font-size:0.9rem">${reason}</div>`;
                content.innerHTML = html;
                preview.style.display = 'block';
                return;
            }

            html += '<table style="width:100%;border-collapse:collapse;font-size:0.85rem">';
            html += '<tr style="border-bottom:1px solid var(--border)"><th style="text-align:left;padding:6px;font-weight:600">Beschrijving</th><th style="text-align:right;padding:6px;font-weight:600">Uren</th><th style="text-align:right;padding:6px;font-weight:600">Tarief</th><th style="text-align:right;padding:6px;font-weight:600">Bedrag</th></tr>';

            let subtotal = 0;

            // Per week data
            Object.keys(ioData.weekData).sort().forEach(weekKey => {
                const week = ioData.weekData[weekKey];
                const weekLabel = `Week ${String(week.weekNum).padStart(2,'0')}/${week.year}`;

                // Regular hours
                if (week.regHours > 0) {
                    const amount = week.regHours * ioData.rate.hourly_rate;
                    html += `<tr style="border-bottom:1px solid var(--border)"><td style="padding:6px">Reguliere uren (ma-vr) ·${weekLabel}</td><td style="text-align:right;padding:6px">${fmtDecimal(week.regHours)}</td><td style="text-align:right;padding:6px">${fmtEuro(ioData.rate.hourly_rate)}</td><td style="text-align:right;padding:6px;font-weight:600">${fmtEuro(amount)}</td></tr>`;
                    subtotal += amount;
                }

                // Saturday hours
                if (week.satHours > 0) {
                    const amount = week.satHours * ioData.rate.hourly_rate * ioData.rate.saturday_multiplier;
                    html += `<tr style="border-bottom:1px solid var(--border)"><td style="padding:6px">Zaterdaguren ·${weekLabel}</td><td style="text-align:right;padding:6px">${fmtDecimal(week.satHours)}</td><td style="text-align:right;padding:6px">${fmtEuro(ioData.rate.hourly_rate * ioData.rate.saturday_multiplier)}</td><td style="text-align:right;padding:6px;font-weight:600">${fmtEuro(amount)}</td></tr>`;
                    subtotal += amount;
                }

                // Sunday hours
                if (week.sunHours > 0) {
                    const amount = week.sunHours * ioData.rate.hourly_rate * ioData.rate.sunday_holiday_multiplier;
                    html += `<tr style="border-bottom:1px solid var(--border)"><td style="padding:6px">Zondaguren ·${weekLabel}</td><td style="text-align:right;padding:6px">${fmtDecimal(week.sunHours)}</td><td style="text-align:right;padding:6px">${fmtEuro(ioData.rate.hourly_rate * ioData.rate.sunday_holiday_multiplier)}</td><td style="text-align:right;padding:6px;font-weight:600">${fmtEuro(amount)}</td></tr>`;
                    subtotal += amount;
                }
            });

            // Total km
            let totalKm = 0;
            Object.values(ioData.weekData).forEach(w => totalKm += w.totalKm);
            if (totalKm > 0) {
                const kmAmount = totalKm * ioData.rate.km_rate;
                html += `<tr style="border-bottom:1px solid var(--border)"><td style="padding:6px">Kilometrages</td><td style="text-align:right;padding:6px">${totalKm.toLocaleString('nl-NL')}</td><td style="text-align:right;padding:6px">${fmtEuro(ioData.rate.km_rate)}</td><td style="text-align:right;padding:6px;font-weight:600">${fmtEuro(kmAmount)}</td></tr>`;
                subtotal += kmAmount;
            }

            // Total hotel nights
            let totalHotel = 0;
            Object.values(ioData.weekData).forEach(w => totalHotel += w.hotelNights);
            if (totalHotel > 0) {
                const hotelAmount = totalHotel * ioData.hotelRate;
                html += `<tr style="border-bottom:1px solid var(--border)"><td style="padding:6px">Hotelovernachtingen</td><td style="text-align:right;padding:6px">${totalHotel}</td><td style="text-align:right;padding:6px">${fmtEuro(ioData.hotelRate)}</td><td style="text-align:right;padding:6px;font-weight:600">${fmtEuro(hotelAmount)}</td></tr>`;
                subtotal += hotelAmount;
            }

            // Totals · gebruik tokens zodat dark mode netjes blijft
            const btw = subtotal * 0.21;
            const total = subtotal + btw;

            html += '<tr style="background:var(--app-bg-tint)"><td colspan="3" style="padding:8px;text-align:right;font-weight:600">Subtotaal</td><td style="text-align:right;padding:8px;font-weight:600">' + fmtEuroPdf(subtotal) + '</td></tr>';
            html += '<tr style="background:var(--app-bg-tint)"><td colspan="3" style="padding:8px;text-align:right;font-weight:600">BTW 21%</td><td style="text-align:right;padding:8px;font-weight:600">' + fmtEuroPdf(btw) + '</td></tr>';
            html += '<tr style="background:rgba(58,156,197,0.15);font-weight:600"><td colspan="3" style="padding:8px;text-align:right">Totaal incl. BTW</td><td style="text-align:right;padding:8px;color:var(--kts-accent-light)">' + fmtEuroPdf(total) + '</td></tr>';
            html += '</table>';

            // Store ioData globally for PDF generation
            window._currentPOData = ioData;

            content.innerHTML = html;
            preview.style.display = 'block';
        }

        function generateIOPDF() {
            if (!window._currentPOData) {
                showToast('⚠️ Maak eerst een preview');
                return;
            }
            generateIO_PDF(window._currentPOData);
        }

        // ===== INKOOPORDER PDF (KTS huisstijl) =====
        // Adapter: zet ioData (productie-format) om naar PDF-data-structure
        function adaptIOPDFData(ioData) {
            const MONTHS_NL = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
            const today = new Date();
            const dd = String(today.getDate()).padStart(2,'0');
            const mm = String(today.getMonth()+1).padStart(2,'0');
            const yyyy = today.getFullYear();
            const ddmmyyyy = dd + mm + yyyy;
            const dateStr = `${dd}-${mm}-${yyyy}`;
            const poNumber = ioData.project.project_code + '-' + ddmmyyyy;

            const userName = ioData.user ? (ioData.user.name || ioData.user.email) : '';
            const projectName = ioData.project.name || '';
            const monthLabel = MONTHS_NL[ioData.month - 1] + ' ' + ioData.year;

            // Periode-label: bij 1-3 specifiek geselecteerde weken zetten we die er
            // expliciet bij ("Week 19 · mei 2026" / "Weken 19, 20 · mei 2026"). Bij
            // 4+ weken (= effectief de hele maand) houden we het op alleen de maand.
            const includedWeeks = (ioData.includedWeeks || []).slice().sort((a,b) => a-b);
            let periodLabel = monthLabel;
            if (includedWeeks.length >= 1 && includedWeeks.length <= 3) {
                const weekText = includedWeeks.length === 1
                    ? `Week ${includedWeeks[0]}`
                    : `Weken ${includedWeeks.join(', ')}`;
                periodLabel = `${weekText} · ${monthLabel}`;
            }

            // Items: per uren-type, per week
            const items = [];
            let nr = 1;
            const weekKeys = Object.keys(ioData.weekData || {}).sort();
            weekKeys.forEach(weekKey => {
                const w = ioData.weekData[weekKey];
                const weekLabel = `Week ${String(w.weekNum).padStart(2,'0')}/${w.year}`;
                if (w.regHours > 0) {
                    items.push({ nr: nr++, desc: `Reguliere uren ma-vr · ${weekLabel}`, sub: projectName, qty: w.regHours, unit: 'u', price: ioData.rate.hourly_rate });
                }
                if (w.satHours > 0) {
                    const r = ioData.rate.hourly_rate * ioData.rate.saturday_multiplier;
                    items.push({ nr: nr++, desc: `Zaterdaguren (${Math.round(ioData.rate.saturday_multiplier*100)}%) · ${weekLabel}`, sub: projectName, qty: w.satHours, unit: 'u', price: r });
                }
                if (w.sunHours > 0) {
                    const r = ioData.rate.hourly_rate * ioData.rate.sunday_holiday_multiplier;
                    items.push({ nr: nr++, desc: `Zondag-/feestdaguren (${Math.round(ioData.rate.sunday_holiday_multiplier*100)}%) · ${weekLabel}`, sub: projectName, qty: w.sunHours, unit: 'u', price: r });
                }
            });
            // KM en hotel als 1 totaalregel over de hele periode · gebruik periodLabel
            // zodat bij 1 specifieke week ook "Reis kilometers · Week 19 · mei 2026" staat
            let totalKm = 0, totalHotel = 0;
            Object.values(ioData.weekData || {}).forEach(w => { totalKm += (w.totalKm || 0); totalHotel += (w.hotelNights || 0); });
            if (totalKm > 0) {
                items.push({ nr: nr++, desc: `Reis kilometers · ${periodLabel}`, sub: projectName, qty: totalKm, unit: 'km', price: ioData.rate.km_rate });
            }
            if (totalHotel > 0) {
                items.push({ nr: nr++, desc: `Hotelovernachtingen · ${periodLabel}`, sub: projectName, qty: totalHotel, unit: 'nacht', price: ioData.hotelRate || 0 });
            }

            const zzp = ioData.zzpCompany || {};

            return {
                project: { code: ioData.project.project_code },
                separator: '-',
                date: dateStr,
                poNumber: poNumber,
                leverancier: {
                    company: zzp.name || userName || 'Onbekend',
                    contact: zzp.contact_name || '',
                    address1: zzp.address || '',
                    address2: ((zzp.postcode || '') + ' ' + (zzp.city || '')).trim(),
                    phone: '',
                    email: zzp.email || ''
                },
                leveradres: {
                    company: 'Kuijpers Technical Services BV',
                    contact: userName ? ('T.a.v. ' + userName) : 'Crediteurenadministratie',
                    address1: 'Nieuwboerweg 2A',
                    address2: '1738BB, Waarland',
                    phone: '+31 6 5123 9050',
                    email: 'info@kuijpers-ts.nl'
                },
                items: items,
                btwPct: 21,
                transport: 0,
                overige: 0,
                opmerkingen: `Inzet conform goedgekeurde weekstaten.\nPeriode: ${periodLabel}`,
                paymentTerm: '30 dagen na factuurdatum'
            };
        }

        // Inkooporder PDF generator · accepteert data + options, returned doc
        async function generateInkooporderPdf(data, options = {}) {
            if (!window.jspdf) { showToast && showToast('⚠️ PDF library nog niet geladen'); return null; }
            const pdfImages = window.KTS_PDF_IMAGES || {};
            const KTS_LOGO_B64 = pdfImages.logo || null;
            const TANDWIEL = pdfImages.tandwiel || null;
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pdfFont = doc.getFontList()['DaxlinePro'] ? 'DaxlinePro' : 'helvetica';

            const pw = 210, ph = 297, ml = 12, mr = 12, mt = 12, uw = pw - ml - mr;
            const ktsBlue = [7, 86, 127];
            const ktsAccent = [58, 156, 197];  // accent-light (#3A9CC5) · website match
            const ink900 = [15, 27, 45];
            const ink500 = [92, 102, 117];
            const ink400 = [138, 147, 161];
            const lineCol = [180, 180, 180];
            const lineColLight = [220, 220, 220];

            // Watermark
            if (TANDWIEL) {
                try {
                    const wmSize = 180;
                    doc.saveGraphicsState && doc.saveGraphicsState();
                    doc.setGState && doc.setGState(new doc.GState({ opacity: 0.08 }));
                    doc.addImage(TANDWIEL, 'PNG', (pw - wmSize) / 2, (ph - wmSize) / 2, wmSize, wmSize);
                    doc.restoreGraphicsState && doc.restoreGraphicsState();
                } catch (e) {}
            }

            let y = mt;

            // Header · tandwiel + INKOOPORDER (links), KTS logo+adres (rechts)
            doc.setFontSize(20);
            doc.setFont(pdfFont, 'bold');
            doc.setTextColor(...ktsBlue);
            const titleY = y + 6;
            const iconSize = 10;
            if (TANDWIEL) {
                try { doc.addImage(TANDWIEL, 'PNG', ml, titleY - iconSize + 3, iconSize, iconSize); } catch (e) {}
            }
            doc.text('INKOOPORDER', ml + (TANDWIEL ? iconSize + 3 : 0), titleY);

            // Accent-light hairline onder titel · website-stijl signature
            const titleX_io = ml + (TANDWIEL ? iconSize + 3 : 0);
            const titleW_io = doc.getTextWidth('INKOOPORDER');
            doc.setFillColor(...ktsAccent);
            doc.rect(titleX_io, titleY + 2, Math.min(titleW_io, 50), 0.8, 'F');

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

            // Info-bar 4 cellen
            y = headerEndY + 4;
            const infoW = uw / 4;
            const infoH = 14;
            const infoCells = [
                { label: 'PROJECT',         value: data.project.code },
                { label: 'SCHEIDINGSTEKEN', value: data.separator },
                { label: 'DATUM',           value: data.date },
                { label: 'INKOOPORDER-NR',  value: data.poNumber }
            ];
            infoCells.forEach((c, i) => {
                const cx = ml + i * infoW;
                doc.setFillColor(248, 248, 244);
                doc.rect(cx, y, infoW, infoH, 'F');
                doc.setDrawColor(...lineColLight);
                doc.setLineWidth(0.15);
                doc.rect(cx, y, infoW, infoH);
                doc.setFontSize(7);
                doc.setFont(pdfFont, 'bold');
                doc.setTextColor(...ktsAccent);     // eyebrow-stijl labels (website match)
                doc.text(c.label, cx + 3, y + 4);
                doc.setFontSize(11);
                doc.setFont(pdfFont, 'bold');
                doc.setTextColor(...ink900);
                doc.text(String(c.value), cx + 3, y + 11);
            });
            y += infoH + 5;

            // Leverancier + Leveradres blokken
            const blockW = (uw - 4) / 2;
            const blockH = 38;
            const headerBh = 6;
            doc.setFillColor(...ktsBlue);
            doc.rect(ml, y, blockW, headerBh, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.setFont(pdfFont, 'bold');
            doc.text('LEVERANCIER', ml + 3, y + 4.2);
            doc.setFillColor(...ktsBlue);
            doc.rect(ml + blockW + 4, y, blockW, headerBh, 'F');
            doc.text('LEVERADRES', ml + blockW + 7, y + 4.2);
            doc.setFillColor(248, 248, 244);
            doc.rect(ml, y + headerBh, blockW, blockH - headerBh, 'F');
            doc.rect(ml + blockW + 4, y + headerBh, blockW, blockH - headerBh, 'F');
            doc.setDrawColor(...lineColLight);
            doc.setLineWidth(0.15);
            doc.rect(ml, y, blockW, blockH);
            doc.rect(ml + blockW + 4, y, blockW, blockH);

            // Leverancier content
            doc.setFontSize(9);
            doc.setFont(pdfFont, 'bold');
            doc.setTextColor(...ink900);
            let lvY = y + headerBh + 5;
            doc.text(data.leverancier.company, ml + 3, lvY);
            doc.setFont(pdfFont, 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(...ink500);
            [data.leverancier.contact, data.leverancier.address1, data.leverancier.address2, data.leverancier.phone, data.leverancier.email].forEach(line => {
                if (line) { lvY += 4; doc.text(line, ml + 3, lvY); }
            });
            // Leveradres content
            let laY = y + headerBh + 5;
            doc.setFontSize(9);
            doc.setFont(pdfFont, 'bold');
            doc.setTextColor(...ink900);
            doc.text(data.leveradres.company, ml + blockW + 7, laY);
            doc.setFont(pdfFont, 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(...ink500);
            [data.leveradres.contact, data.leveradres.address1, data.leveradres.address2, data.leveradres.phone, data.leveradres.email].forEach(line => {
                if (line) { laY += 4; doc.text(line, ml + blockW + 7, laY); }
            });

            y += blockH + 6;

            // Items-tabel
            const itemCols = [
                { key:'nr',    label:'ITEM #',       w: 18,  align:'center' },
                { key:'desc',  label:'OMSCHRIJVING', w: 92,  align:'left' },
                { key:'qty',   label:'AANTAL',       w: 18,  align:'center' },
                { key:'price', label:'PRIJS / STUK', w: 28,  align:'right' },
                { key:'total', label:'TOTAAL',       w: 30,  align:'right' }
            ];
            const itemTotalW = itemCols.reduce((s,c)=>s+c.w,0);
            const itemHeaderH = 7;
            const itemRowH = 12;

            doc.setFillColor(...ktsBlue);
            doc.rect(ml, y, itemTotalW, itemHeaderH, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.setFont(pdfFont, 'bold');
            let cx = ml;
            itemCols.forEach(c => {
                const tx = c.align === 'left' ? cx + 2 : c.align === 'right' ? cx + c.w - 2 : cx + c.w / 2;
                doc.text(c.label, tx, y + 4.5, { align: c.align });
                cx += c.w;
            });
            y += itemHeaderH;

            const fmtEuroLocal = (n) => '€ ' + (n || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            const items = data.items || [];
            const minRows = Math.max(5, items.length);
            let subtotaal = 0;
            for (let i = 0; i < minRows; i++) {
                const item = items[i];
                if (i % 2 === 1) {
                    doc.setFillColor(248, 248, 244);
                    doc.rect(ml, y, itemTotalW, itemRowH, 'F');
                }
                doc.setDrawColor(...lineColLight);
                doc.setLineWidth(0.15);
                doc.line(ml, y + itemRowH, ml + itemTotalW, y + itemRowH);

                if (item) {
                    const total = (item.qty || 0) * (item.price || 0);
                    subtotaal += total;
                    cx = ml;
                    itemCols.forEach(c => {
                        const tx = c.align === 'left' ? cx + 2 : c.align === 'right' ? cx + c.w - 2 : cx + c.w / 2;
                        if (c.key === 'desc') {
                            let main = item.desc || item.code || '';
                            if (main.length > 80) main = main.substring(0, 77) + '...';
                            doc.setFontSize(8.5);
                            doc.setFont(pdfFont, 'normal');
                            doc.setTextColor(...ink900);
                            doc.text(main, tx, y + 5, { align: 'left' });
                            if (item.sub) {
                                let sub = String(item.sub);
                                if (sub.length > 80) sub = sub.substring(0, 77) + '...';
                                doc.setFontSize(7.5);
                                doc.setTextColor(...ink500);
                                doc.text(sub, tx, y + 9, { align: 'left' });
                            }
                        } else {
                            let v = '';
                            if (c.key === 'nr')    v = item.nr;
                            if (c.key === 'qty')   v = (item.qty != null ? item.qty.toLocaleString('nl-NL') : '') + (item.unit ? ' ' + item.unit : '');
                            if (c.key === 'price') v = fmtEuroLocal(item.price);
                            if (c.key === 'total') v = fmtEuroLocal(total);
                            doc.setFontSize(9);
                            doc.setFont(pdfFont, c.key === 'total' ? 'bold' : 'normal');
                            doc.setTextColor(...ink900);
                            doc.text(String(v), tx, y + itemRowH / 2 + 1.5, { align: c.align });
                        }
                        cx += c.w;
                    });
                }
                y += itemRowH;
            }
            cx = ml;
            doc.setDrawColor(...lineColLight);
            for (let i = 0; i <= itemCols.length; i++) {
                doc.line(cx, y - itemRowH * minRows - itemHeaderH, cx, y);
                if (i < itemCols.length) cx += itemCols[i].w;
            }
            doc.setDrawColor(...lineCol);
            doc.setLineWidth(0.3);
            doc.rect(ml, y - itemRowH * minRows - itemHeaderH, itemTotalW, itemHeaderH + itemRowH * minRows);

            y += 6;

            // Opmerkingen + Totalen
            const totBlockW = 70;
            const opmBlockW = uw - totBlockW - 4;
            const blockH2 = 48;
            doc.setFillColor(248, 248, 244);
            doc.rect(ml, y, opmBlockW, blockH2, 'F');
            doc.setDrawColor(...lineColLight);
            doc.rect(ml, y, opmBlockW, blockH2);
            doc.setFillColor(...ktsBlue);
            doc.rect(ml, y, opmBlockW, headerBh, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.setFont(pdfFont, 'bold');
            doc.text('OPMERKINGEN OF SPECIALE INSTRUCTIES', ml + 3, y + 4.2);
            doc.setFontSize(9);
            doc.setFont(pdfFont, 'normal');
            doc.setTextColor(...ink900);
            if (data.opmerkingen) {
                const lines = doc.splitTextToSize(data.opmerkingen, opmBlockW - 6);
                lines.slice(0, 5).forEach((line, i) => doc.text(line, ml + 3, y + headerBh + 6 + i * 4));
            }
            doc.setFontSize(8);
            doc.setFont(pdfFont, 'normal');
            doc.setTextColor(...ink500);
            doc.text('BETALINGSTERMIJN', ml + 3, y + blockH2 - 8);
            doc.setFontSize(9);
            doc.setFont(pdfFont, 'bold');
            doc.setTextColor(...ink900);
            doc.text(data.paymentTerm, ml + 3, y + blockH2 - 3.5);

            const totX = ml + opmBlockW + 4;
            const subTotalRows = [
                { label: 'Subtotaal',                value: subtotaal },
                { label: `BTW (${data.btwPct}%)`,    value: subtotaal * (data.btwPct / 100) },
                { label: 'Transport',                value: data.transport || 0 },
                { label: 'Overige',                  value: data.overige || 0 },
            ];
            const totalIncl = subtotaal + subtotaal * (data.btwPct / 100) + (data.transport || 0) + (data.overige || 0);
            doc.setFillColor(248, 248, 244);
            doc.rect(totX, y, totBlockW, blockH2, 'F');
            doc.setDrawColor(...lineColLight);
            doc.rect(totX, y, totBlockW, blockH2);
            let totRowY = y + 6;
            doc.setFontSize(8.5);
            subTotalRows.forEach(r => {
                doc.setFont(pdfFont, 'normal');
                doc.setTextColor(...ink500);
                doc.text(r.label, totX + 3, totRowY);
                doc.setFont(pdfFont, 'bold');
                doc.setTextColor(...ink900);
                doc.text(fmtEuroLocal(r.value), totX + totBlockW - 3, totRowY, { align: 'right' });
                totRowY += 6;
            });
            const totalBandY = y + blockH2 - 12;
            doc.setFillColor(...ktsBlue);
            doc.rect(totX, totalBandY, totBlockW, 12, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(9);
            doc.setFont(pdfFont, 'bold');
            doc.text('TOTAAL', totX + 3, totalBandY + 4.5);
            doc.setFontSize(13);
            doc.text(fmtEuroLocal(totalIncl), totX + totBlockW - 3, totalBandY + 5, { align: 'right' });

            // Footer
            doc.setFontSize(7);
            doc.setFont(pdfFont, 'normal');
            doc.setTextColor(...ink400);
            const footerY = ph - 5;
            doc.text('Op deze inkooporder zijn de Algemene Voorwaarden 2026 van Kuijpers Technical Services BV van toepassing.', ml, footerY);
            doc.text('KvK 93410557  ·  BTW NL866385368B01', pw - mr, footerY, { align: 'right' });

            if (options.save) {
                const fileName = options.fileName || `KTS-Inkooporder_${data.poNumber}.pdf`;
                doc.save(fileName);
            }
            return doc;
        }

        // Productie-wrapper: behoud van save/upload-flow
        async function generateIO_PDF(ioData) {
            if (!window.jspdf) { showToast('⚠️ PDF library nog niet geladen'); return; }
            const data = adaptIOPDFData(ioData);
            const doc = await generateInkooporderPdf(data, { save: false });
            if (!doc) return;

            // IO-nummer (intern, voor DB-verwijzing) + filename (KTS-naming-conventie)
            const today = new Date();
            const ddmmyyyy = ktsDateStamp(today);
            const ioNumber = ioData.project.project_code + '-' + ddmmyyyy;
            // Leverancier-naam voor in de filename · het IO-bedrijf (= zzp/leverancier)
            const supplierNameIO = (ioData.zzpCompany && ioData.zzpCompany.name)
                || (ioData.user && (ioData.user.name || ioData.user.email))
                || '';
            // Filename volgt: {PROJ}-{ddmmyyyy}_Inkooporder_W{wk}_{leverancier}.pdf
            // Bij meerdere weken: vervangt W{wk} door {maand}
            const ioWeekRef = (ioData.includedWeeks && ioData.includedWeeks.length === 1)
                ? ioData.includedWeeks[0]
                : null;
            const fileName = ioWeekRef
                ? ktsInkooporderName(ioData.year, ioWeekRef, ioData.project.project_code, supplierNameIO, ddmmyyyy)
                : `${ktsSlug(ioData.project.project_code)}-${ddmmyyyy}_Inkooporder_${String(ioData.month).padStart(2,'0')}-${ioData.year}${supplierNameIO ? '_' + ktsSlug(supplierNameIO) : ''}.pdf`;
            const filePath = `${ioData.year}/${ioData.project.project_code}/${fileName}`;

            // Save lokaal (folder of download)
            const savedIO = await savePdfToFolder(doc, fileName, 'inkooporders');
            if (!savedIO) doc.save(fileName);

            // Upload naar Supabase Storage
            try {
                const pdfBlob = new Blob([doc.output('arraybuffer')], { type: 'application/pdf' });
                await getSupabase().storage.from('inkooporders').upload(filePath, pdfBlob, { upsert: true, contentType: 'application/pdf' });
                console.log('IO PDF uploaded to storage:', filePath);
            } catch (storErr) {
                console.warn('IO PDF upload naar storage mislukt:', storErr.message);
            }

            // Upload metadata naar Supabase
            uploadPOToSupabase(filePath, doc.output('arraybuffer'), ioData, ioNumber);

            // Doorklik-flow: vraag of admin direct een factuur wil maken
            try {
                const wantInvoice = await askContinueAsync({
                    title: 'Inkooporder gegenereerd',
                    message: `${ioNumber} is opgeslagen.<br>Wil je nu direct een factuur richting de eindklant maken?`,
                    confirmLabel: 'Ja, naar factuur',
                    cancelLabel: 'Niet nu',
                    iconSvg: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#07567F" stroke-width="2"><path d="M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16l-3-2-2 2-2-2-2 2-2-2-3 2z"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/></svg>'
                });
                if (wantInvoice) {
                    switchAdminTab('facturen');
                    setTimeout(async () => {
                        if (typeof loadInvoiceFilters === 'function') {
                            await loadInvoiceFilters();
                        }
                        const projEl = document.getElementById('inv-filter-project');
                        const userEl = document.getElementById('inv-filter-user');
                        const yearEl = document.getElementById('inv-filter-year');
                        const monthEl = document.getElementById('inv-filter-month');
                        if (projEl) projEl.value = ioData.project.id || ioData.project_id || '';
                        if (userEl) userEl.value = (ioData.user && ioData.user.id) || ioData.user_id || '';
                        if (yearEl) yearEl.value = String(ioData.year);
                        // Helper: zoek de juiste month-option ongeacht of die '5' of '05' is
                        if (monthEl && ioData.month) {
                            const m = parseInt(ioData.month);
                            const padded = String(m).padStart(2, '0');
                            const unpadded = String(m);
                            // Probeer beide formats · werkt of de options nu padded zijn of niet
                            const matchOpt = Array.from(monthEl.options).find(o => o.value === padded || o.value === unpadded);
                            if (matchOpt) monthEl.value = matchOpt.value;
                        }
                        if (typeof previewInvoice === 'function') previewInvoice();
                    }, 300);
                }
            } catch (e) {
                console.warn('IO→Factuur doorklik faalde:', e);
            }
        }

        async function uploadPOToSupabase(filePath, pdfBuffer, ioData, ioNumber) {
            const sb = getSupabase();
            if (!sb) { showToast('⚠️ Niet verbonden'); return; }

            try {
                // 1. Sla op welke weken op deze inkooporder staan (dubbel-beveiliging).
                // Gebruik de {week, year}-paren zodat het ISO-jaar per week klopt
                // rond de jaarwisseling (fallback naar het IO-jaar voor oude data).
                const weekPairs = (ioData.includedWeekPairs && ioData.includedWeekPairs.length > 0)
                    ? ioData.includedWeekPairs
                    : (ioData.includedWeeks || []).map(wn => ({ week: wn, year: ioData.year }));
                if (weekPairs.length > 0) {
                    const weekRecords = weekPairs.map(p => ({
                        user_id: ioData.userId,
                        project_id: ioData.projectId,
                        year: p.year,
                        week_number: p.week,
                        month: ioData.month,
                        io_number: ioNumber,
                        storage_path: filePath,
                        created_at: new Date().toISOString()
                    }));
                    let { error: weekErr } = await sb.from('inkooporder_weeks').upsert(weekRecords, { onConflict: 'user_id,project_id,year,week_number' });
                    // Fallback voor oude DB zonder storage_path kolom
                    if (weekErr && /storage_path/.test(weekErr.message || '')) {
                        console.warn('storage_path kolom niet aanwezig · fallback. Voer migratie-io-storage-path.sql uit.');
                        const fallback = weekRecords.map(({ storage_path, ...rest }) => rest);
                        ({ error: weekErr } = await sb.from('inkooporder_weeks').upsert(fallback, { onConflict: 'user_id,project_id,year,week_number' }));
                    }
                    if (weekErr) console.warn('Inkooporder weken opslaan mislukt:', weekErr.message);
                    else console.log('Inkooporder weken opgeslagen:', ioData.includedWeeks);
                }

                showToast('✓ Inkooporder opgeslagen in database');
                loadInkooporders();

                // 2. Email met PDF bijlage + OneDrive upload via Edge Function
                const mailTarget = ioData.ioCompany;
                const ioRecipientEmail = getContactEmailsByRole(mailTarget, 'receives_io');
                const userName = ioData.user ? (ioData.user.name || ioData.user.email) : '';
                const projCode = ioData.project ? ioData.project.project_code : '';
                const projName = ioData.project ? ioData.project.name : '';
                const wekenTekst = ioData.includedWeeks.length > 1
                    ? 'weken ' + ioData.includedWeeks.join(', ')
                    : 'week ' + ioData.includedWeeks[0];
                const MONTHS_NL = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
                const maandTekst = MONTHS_NL[ioData.month - 1] + ' ' + ioData.year;
                const pdfBytes = new Uint8Array(pdfBuffer); let pdfBin = ''; for (let i = 0; i < pdfBytes.length; i++) pdfBin += String.fromCharCode(pdfBytes[i]); const pdfBase64 = btoa(pdfBin);
                // Filename voor email-bijlage volgens KTS-naming
                const supplierNameMail = (ioData.zzpCompany && ioData.zzpCompany.name) || userName || '';
                const ddmmyyyyMail = ktsDateStamp(new Date());
                const ioWeekRefMail = (ioData.includedWeeks && ioData.includedWeeks.length === 1)
                    ? ioData.includedWeeks[0] : null;
                const fileName = ioWeekRefMail
                    ? ktsInkooporderName(ioData.year, ioWeekRefMail, projCode, supplierNameMail, ddmmyyyyMail)
                    : `${ktsSlug(projCode)}-${ddmmyyyyMail}_Inkooporder_${String(ioData.month).padStart(2,'0')}-${ioData.year}${supplierNameMail ? '_' + ktsSlug(supplierNameMail) : ''}.pdf`;

                try {
                    showToast('📧 Inkooporder versturen...');
                    const { data, error } = await sb.functions.invoke('send-inkooporder', {
                        body: {
                            pdfBase64: pdfBase64,
                            fileName: fileName,
                            ioNumber: ioNumber,
                            userName: userName,
                            projectCode: projCode,
                            projectName: projName,
                            period: maandTekst + ' (' + wekenTekst + ')',
                            recipientEmail: ioRecipientEmail || '',
                            recipientName: mailTarget ? (getContactNameByRole(mailTarget, 'receives_io') || mailTarget.name) : '',
                        }
                    });
                    if (!error && data?.success) {
                        showToast('✅ Inkooporder verstuurd' + (data.email ? ' + email verzonden' : ' naar OneDrive'));
                    } else {
                        console.warn('Edge Function fout:', error || data);
                        showToast('⚠️ OneDrive/email mislukt · PDF is wel lokaal opgeslagen');
                    }
                } catch (edgeErr) {
                    console.warn('Edge Function niet beschikbaar:', edgeErr);
                    showToast('⚠️ Edge Function niet bereikbaar · PDF is wel lokaal opgeslagen');
                }
            } catch (e) {
                showToast('⚠️ Fout bij opslaan: ' + e.message);
            }
        }

        // ===== ADMIN MODALS: Nieuw/bewerk project/persoon/tarief =====
        let _editingId = null; // ID van het record dat bewerkt wordt (null = nieuw)

        function toggleUserFieldVisibility() {
            const kmWrap = document.getElementById('adm-user-km-wrap');
            const hotelWrap = document.getElementById('adm-user-hotel-wrap');
            if (kmWrap) kmWrap.style.display = document.getElementById('adm-user-km').checked ? '' : 'none';
            if (hotelWrap) hotelWrap.style.display = document.getElementById('adm-user-hotel').checked ? '' : 'none';
        }

        function openAdminModal(type, editIdx) {
            const isEdit = typeof editIdx === 'number';
            _editingId = null;
            let title, fields, existing = null;

            if (type === 'project') {
                existing = isEdit ? (window._adminProjects || [])[editIdx] : null;
                _editingId = existing ? existing.id : null;
                title = existing ? 'Project bewerken' : 'Nieuw project';
                fields = `
                    <div class="form-group" style="margin-bottom:12px"><label>Projectcode</label><input type="text" id="adm-proj-code" placeholder="Bijv. KTS2026_02" value="${existing ? escapeHtml(existing.project_code || '') : ''}"></div>
                    <div class="form-group" style="margin-bottom:12px"><label>Projectnaam</label><input type="text" id="adm-proj-name" placeholder="Bijv. Projectnaam | Omschrijving" value="${existing ? escapeHtml(existing.name || '') : ''}"></div>
                    <div class="form-group" style="margin-bottom:12px"><label>Klantnaam (weergave)</label><input type="text" id="adm-proj-client" placeholder="Bijv. PepsiCo Netherlands B.V." value="${existing ? escapeHtml(existing.client_name || '') : ''}"></div>
                    <div class="form-group" style="margin-bottom:12px"><label>📩 Factuur-ontvanger <span style="font-weight:400;color:var(--muted);font-size:0.75rem">(opdrachtgever / eindklant)</span></label>
                        <select id="adm-proj-factuur-company" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:0.85rem">
                            <option value="">Geen bedrijf gekoppeld</option>
                        </select>
                        <div style="font-size:0.7rem;color:var(--muted);margin-top:3px">Facturen worden naar dit bedrijf gestuurd</div>
                    </div>
                    <div class="form-group" style="margin-bottom:12px"><label>📋 Inkooporder-ontvanger <span style="font-weight:400;color:var(--muted);font-size:0.75rem">(opdrachtnemer / tussenpersoon)</span></label>
                        <select id="adm-proj-io-company" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:0.85rem">
                            <option value="">Zelfde als factuur-ontvanger</option>
                        </select>
                        <div style="font-size:0.7rem;color:var(--muted);margin-top:3px">Inkooporders worden naar dit bedrijf gestuurd (als leeg: zelfde als factuur)</div>
                    </div>
                    <div class="form-group" style="margin-bottom:12px"><label>Locatie</label><input type="text" id="adm-proj-location" placeholder="Bijv. Broek op Langedijk" value="${existing ? escapeHtml(existing.location || '') : ''}"></div>
                    <div class="form-group" style="margin-bottom:12px"><label>Standaard omschrijving werkzaamheden</label><input type="text" id="adm-proj-desc" placeholder="Bijv. commissioning, I/O checks, vendor overleg..." value="${existing ? escapeHtml(existing.default_description || '') : ''}"></div>
                    <div class="form-group" style="margin-bottom:12px"><label>Standaard locatie dagkaart</label><input type="text" id="adm-proj-deflocation" placeholder="Bijv. Broek op Langedijk" value="${existing ? escapeHtml(existing.default_location || '') : ''}"></div>
                    <!-- Km en hotelprijs staan nu bij gebruikersinstellingen -->
                    <div class="form-group" style="margin-bottom:12px"><label>Startdatum</label><input type="date" id="adm-proj-start" value="${existing ? escapeHtml(existing.start_date || '') : ''}"></div>
                    <div class="form-group" style="margin-bottom:12px"><label>Status</label>
                        <select id="adm-proj-status">
                            <option value="active" ${!existing || existing.status === 'active' ? 'selected' : ''}>Actief</option>
                            <option value="paused" ${existing && existing.status === 'paused' ? 'selected' : ''}>Gepauzeerd</option>
                            <option value="closed" ${existing && existing.status === 'closed' ? 'selected' : ''}>Afgesloten</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom:12px">
                        <label>📧 CC-ontvanger(s) bij weekstaat-bevestiging <span style="font-weight:400;color:var(--muted);font-size:0.75rem">(optioneel)</span></label>
                        <input type="text" id="adm-proj-cc-weekstaat"
                            placeholder="bv. info@levvel-epc.nl, ander@klant.nl"
                            value="${existing ? (existing.cc_emails_weekstaat || '').replace(/"/g,'&quot;') : ''}"
                            style="width:100%;padding:8px;border:2px solid var(--app-line);border-radius:8px;font-size:0.85rem;box-sizing:border-box">
                        <div style="font-size:0.7rem;color:var(--muted);margin-top:3px;line-height:1.4">
                            Voor uitzonderlijke gevallen · bv. detachering waarbij de weekstaat ook naar
                            een 2e partij moet zonder dat de facturering via hen loopt. Comma-gescheiden.
                        </div>
                    </div>
                    <div class="form-group" style="margin-bottom:12px">
                        <label>Notities</label>
                        <textarea id="adm-proj-notes" rows="3" placeholder="Afspraken, contactmomenten, bijzonderheden..." style="width:100%;padding:8px;border:2px solid var(--app-line);border-radius:8px;font-size:0.85rem;resize:vertical">${existing ? (existing.notes || '').replace(/</g,'&lt;') : ''}</textarea>
                    </div>
                    ${existing ? '<div style="margin-top:8px;padding-top:12px;border-top:1px solid var(--border)"><label style="font-weight:700;font-size:0.85rem;margin-bottom:8px;display:block">Toegewezen gebruikers</label><div id="adm-proj-users" style="margin-bottom:8px"><span style="color:var(--muted);font-size:0.8rem">Laden...</span></div><div style="display:flex;gap:8px"><select id="adm-proj-user-select" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:0.85rem"><option value="">Kies gebruiker...</option></select><button type="button" class="btn btn-sm btn-primary" onclick="assignUserToProject()" style="white-space:nowrap">+ Toewijzen</button></div></div>' : ''}
                `;
            } else if (type === 'persoon') {
                existing = isEdit ? (window._adminCompanies || [])[editIdx] : null;
                _editingId = existing ? existing.id : null;
                title = existing ? 'Bedrijf bewerken' : 'Nieuw bedrijf';
                fields = `
                    <div class="form-group" style="margin-bottom:12px"><label>Bedrijfsnaam</label><input type="text" id="adm-pers-name" placeholder="Bijv. Bedrijfsnaam B.V." value="${existing ? escapeHtml(existing.name || '') : ''}"></div>
                    <div style="margin-bottom:12px;padding:10px;background:var(--app-bg-tint);border-radius:10px;border:1px solid var(--border)">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                            <label style="font-weight:600;font-size:0.8rem;color:var(--kts-blue)">Contactpersonen</label>
                            <button type="button" class="btn btn-sm" style="padding:3px 10px;font-size:0.7rem" onclick="addExtraContact()">+ Toevoegen</button>
                        </div>
                        <div id="adm-pers-contacts-list"></div>
                    </div>
                    <div class="form-group" style="margin-bottom:12px"><label>Type</label>
                        <select id="adm-pers-type" onchange="updateContactCheckboxVisibility()">
                            <option value="zzp" ${existing && existing.type === 'zzp' ? 'selected' : ''}>ZZP'er</option>
                            <option value="client" ${existing && existing.type === 'client' ? 'selected' : ''}>Klant</option>
                            <option value="kts" ${existing && existing.type === 'kts' ? 'selected' : ''}>KTS medewerker</option>
                        </select>
                    </div>
                    <div class="form-row">
                        <div class="form-group"><label>Adres</label><input type="text" id="adm-pers-addr" placeholder="Straat + nr" value="${existing ? escapeHtml(existing.address || '') : ''}"></div>
                    </div>
                    <div class="form-row" style="margin-top:12px">
                        <div class="form-group"><label>Postcode</label><input type="text" id="adm-pers-postcode" placeholder="1234 AB / 66280" value="${existing ? escapeHtml(existing.postcode || '') : ''}"></div>
                        <div class="form-group"><label>Plaats</label><input type="text" id="adm-pers-city" placeholder="Zeewolde" value="${existing ? escapeHtml(existing.city || '') : ''}"></div>
                    </div>
                    <div class="form-row" style="margin-top:12px">
                        <div class="form-group"><label>Land</label>
                            <select id="adm-pers-country">
                                <option value="Nederland" ${!existing || existing.country === 'Nederland' || !existing.country ? 'selected' : ''}>Nederland</option>
                                <option value="Duitsland" ${existing && existing.country === 'Duitsland' ? 'selected' : ''}>Duitsland</option>
                                <option value="België" ${existing && existing.country === 'België' ? 'selected' : ''}>België</option>
                            </select>
                        </div>
                        <div class="form-group"><label>Telefoon</label><input type="tel" id="adm-pers-phone" placeholder="+31 6 12345678" value="${existing ? escapeHtml(existing.phone || '') : ''}"></div>
                    </div>
                    <div class="form-row" style="margin-top:12px">
                        <div class="form-group"><label>KVK / Handelsregister</label><input type="text" id="adm-pers-kvk" placeholder="89133315 / HRB 101387" value="${existing ? escapeHtml(existing.kvk_number || '') : ''}"></div>
                        <div class="form-group"><label>BTW / USt-IdNr.</label><input type="text" id="adm-pers-btw" placeholder="NL... / DE..." value="${existing ? escapeHtml(existing.btw_number || '') : ''}"></div>
                    </div>
                    <div class="form-group" style="margin-top:12px">
                        <label>Betalingstermijn</label>
                        <div style="display:flex;align-items:center;gap:6px">
                            <input type="number" id="adm-pers-payment-term" min="1" max="365" placeholder="30" value="${existing && existing.payment_term_days ? existing.payment_term_days : '30'}" style="width:80px">
                            <span style="font-size:0.8rem;color:var(--muted)">dagen</span>
                        </div>
                    </div>
                    <div class="form-group" style="margin-top:12px">
                        <label>Notities</label>
                        <textarea id="adm-pers-notes" rows="3" placeholder="Afspraken, bijzonderheden..." style="width:100%;padding:8px;border:2px solid var(--app-line);border-radius:8px;font-size:0.85rem;resize:vertical">${existing ? (existing.notes || '').replace(/</g,'&lt;') : ''}</textarea>
                    </div>
                    <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
                        <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;cursor:pointer">
                            <input type="checkbox" id="adm-pers-archived" ${existing && existing.archived ? 'checked' : ''} style="width:16px;height:16px;accent-color:#6b7280"> Gearchiveerd
                        </label>
                        <div style="font-size:0.7rem;color:var(--muted);margin-left:24px;margin-top:-4px">Gearchiveerde bedrijven worden niet getoond in lijsten en dropdowns</div>
                    </div>
                `;
            } else if (type === 'tarief') {
                existing = isEdit ? (window._adminRates || [])[editIdx] : null;
                _editingId = existing ? existing.id : null;
                title = existing ? 'Tarief bewerken' : 'Nieuw tarief';
                const proj = existing ? existing.project_id : null;
                fields = `
                    <div class="form-group" style="margin-bottom:12px"><label>Project</label><select id="adm-tar-project" onchange="updateTariffKmVisibility()"><option value="">Laden...</option></select></div>
                    <div class="form-group" style="margin-bottom:12px"><label>Medewerker</label><select id="adm-tar-user" onchange="updateTariffKmVisibility()"><option value="">Projectbreed (alle medewerkers)</option></select></div>
                    <div class="form-group" style="margin-bottom:12px"><label>Functie</label><input type="text" id="adm-tar-function" placeholder="Bijv. Maintenance Engineer A" value="${existing ? escapeHtml(existing.function_title || '') : ''}"></div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Inkooptarief (€/u) <span style="color:var(--muted);font-weight:400">: wat KTS aan zzp betaalt</span></label>
                            <input type="number" step="0.01" id="adm-tar-hourly" placeholder="84.00" value="${existing ? escapeHtml(existing.hourly_rate || '') : ''}">
                        </div>
                        <div class="form-group" id="adm-tar-km-wrap"><label>Km-tarief (€)</label><input type="number" step="0.01" id="adm-tar-km" placeholder="0.60" value="${existing ? escapeHtml(existing.km_rate || '') : ''}"></div>
                    </div>
                    <div class="form-group" style="margin-top:12px;padding:10px 12px;background:var(--app-warn-soft);border-radius:8px;border:1px solid #F4D9A0">
                        <label style="display:block;margin-bottom:4px"><strong>Verkooptarief (€/u)</strong> <span style="color:var(--muted);font-weight:400">: wat KTS aan eindklant factureert</span></label>
                        <input type="number" step="0.01" id="adm-tar-hourly-sale" placeholder="Leeg = gebruik inkooptarief" value="${existing && existing.hourly_rate_sale ? existing.hourly_rate_sale : ''}" style="width:100%">
                        <div style="font-size:0.7rem;color:var(--muted);margin-top:4px">⚠️ Dit veld is alleen zichtbaar voor admins. Wordt gebruikt op factuur (KTS → klant). Laat leeg om hetzelfde tarief te factureren als de inkoop.</div>
                    </div>
                    <div class="form-row" style="margin-top:12px">
                        <div class="form-group"><label>Za-toeslag (%)</label><input type="number" step="1" id="adm-tar-sat" placeholder="150" value="${existing ? Math.round(existing.saturday_multiplier * 100) : '150'}"></div>
                        <div class="form-group"><label>Zo-toeslag (%)</label><input type="number" step="1" id="adm-tar-sun" placeholder="200" value="${existing ? Math.round(existing.sunday_holiday_multiplier * 100) : '200'}"></div>
                    </div>
                    <div class="form-row" style="margin-top:12px">
                        <div class="form-group"><label>Geldig vanaf</label><input type="date" id="adm-tar-from" value="${existing ? escapeHtml(existing.valid_from || '') : ''}"></div>
                        <div class="form-group"><label>Geldig t/m (optioneel)</label><input type="date" id="adm-tar-to" value="${existing ? escapeHtml(existing.valid_to || '') : ''}"></div>
                    </div>
                `;
            } else if (type === 'gebruiker') {
                existing = isEdit ? (window._adminUsers || [])[editIdx] : null;
                _editingId = existing ? existing.id : null;
                title = existing ? (existing.name || existing.email) + ' · Instellingen' : 'Gebruiker';
                const chk = (field) => existing && existing[field] !== false ? 'checked' : '';
                fields = `
                    <div style="font-size:0.8rem;color:var(--muted);margin-bottom:12px">${existing ? existing.email : ''}</div>
                    <div class="form-group" style="margin-bottom:16px"><label style="font-weight:600;font-size:0.85rem">Naam</label><input type="text" id="adm-user-name" placeholder="Volledige naam" value="${existing && existing.name ? existing.name : ''}"></div>
                    <div style="font-weight:600;font-size:0.85rem;margin-bottom:8px">Rechten</div>
                    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px">
                        <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;cursor:pointer">
                            <input type="checkbox" id="adm-user-km" ${chk('allow_km')} onchange="toggleUserFieldVisibility()" style="width:16px;height:16px;accent-color:var(--kts-blue)"> Km-vergoeding
                        </label>
                        <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;cursor:pointer">
                            <input type="checkbox" id="adm-user-thuiswerk" ${chk('allow_thuiswerk')} style="width:16px;height:16px;accent-color:var(--kts-blue)"> Thuiswerken
                        </label>
                        <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;cursor:pointer">
                            <input type="checkbox" id="adm-user-hotel" ${chk('allow_hotel')} onchange="toggleUserFieldVisibility()" style="width:16px;height:16px;accent-color:var(--kts-blue)"> Hotelovernachtingen
                        </label>
                        <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;cursor:pointer">
                            <input type="checkbox" id="adm-user-expenses" ${chk('can_declare_expenses')} style="width:16px;height:16px;accent-color:var(--kts-blue)"> Extra kosten declareren
                        </label>
                        <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;cursor:pointer">
                            <input type="checkbox" id="adm-user-rates" ${chk('show_rates')} style="width:16px;height:16px;accent-color:var(--kts-blue)"> Tarieven zichtbaar
                        </label>
                        <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;cursor:pointer">
                            <input type="checkbox" id="adm-user-inspecties" ${chk('allow_inspecties')} style="width:16px;height:16px;accent-color:var(--kts-blue)"> Inspecties
                        </label>
                        <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;cursor:pointer">
                            <input type="checkbox" id="adm-user-administratie" ${chk('allow_administratie')} style="width:16px;height:16px;accent-color:var(--kts-blue)"> Administratie
                        </label>
                    </div>
                    <div style="font-weight:600;font-size:0.85rem;margin-bottom:8px">Startweek</div>
                    <div class="form-row" style="margin-bottom:16px">
                        <div class="form-group"><label>Week</label><input type="number" min="1" max="53" id="adm-user-start-week" placeholder="Bijv. 10" value="${existing && existing.start_week ? existing.start_week : ''}"></div>
                        <div class="form-group"><label>Jaar</label><input type="number" min="2024" max="2030" id="adm-user-start-year" placeholder="Bijv. 2026" value="${existing && existing.start_year ? existing.start_year : ''}"></div>
                    </div>
                    <div style="font-size:0.7rem;color:var(--muted);margin-top:-12px;margin-bottom:16px">Gebruiker kan niet verder terug navigeren dan deze week</div>
                    <div style="font-weight:600;font-size:0.85rem;margin-bottom:8px">Bedrijf (opdrachtnemer)</div>
                    <div class="form-group" style="margin-bottom:12px">
                        <label style="font-size:0.75rem;color:var(--muted)">Eigen BV · verschijnt op weekstaat als "BV-naam | medewerker"</label>
                        <select id="adm-user-company">
                            <option value="">-- Geen bedrijf --</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom:16px">
                        <label style="font-size:0.75rem;color:var(--muted)">Factureert via <span style="color:var(--muted);font-style:italic">(optioneel)</span></label>
                        <select id="adm-user-invoice-via">
                            <option value="">Zelfde als eigen BV</option>
                        </select>
                        <div style="font-size:0.7rem;color:var(--muted);margin-top:3px;line-height:1.4">
                            Voor multi-stage facturatie. Bv. Aad werkt via Hydroart maar factureert via HSW BV.
                            Op de inkooporder is dit het leverancier-bedrijf, op de weekstaat blijft de eigen BV staan.
                        </div>
                    </div>
                    <div style="font-weight:600;font-size:0.85rem;margin-bottom:8px">Tarieven</div>
                    <div class="form-row">
                        <div class="form-group" id="adm-user-km-wrap" style="${existing && existing.allow_km === false ? 'display:none' : ''}"><label>Km enkele reis</label><input type="number" step="0.1" id="adm-user-kmsingle" placeholder="Bijv. 96" value="${existing && existing.km_single_trip ? existing.km_single_trip : ''}"></div>
                        <div class="form-group" id="adm-user-hotel-wrap" style="${existing && existing.allow_hotel === false ? 'display:none' : ''}"><label>Hotelprijs (€/nacht)</label><input type="number" step="0.01" id="adm-user-hotel-rate" placeholder="Bijv. 110" value="${existing && existing.hotel_rate ? existing.hotel_rate : ''}"></div>
                    </div>
                    ${existing ? `<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
                        <div style="font-weight:600;font-size:0.85rem;margin-bottom:4px">🤝 Mag uren invullen voor</div>
                        <div style="font-size:0.7rem;color:var(--muted);margin-bottom:8px;line-height:1.4">Deze gebruiker krijgt op de Uren-tab een keuzemenu en kan uren, kosten en weekstaten invullen namens de gekozen collega's.</div>
                        <div id="adm-user-delegations" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px"><div style="color:var(--muted);font-size:0.8rem">Laden...</div></div>
                        <div style="display:flex;gap:8px">
                            <select id="adm-user-delegate-select" style="flex:1"><option value="">-- Kies collega --</option></select>
                            <button type="button" class="btn btn-sm btn-primary" onclick="addFillDelegation()" style="flex-shrink:0">Toevoegen</button>
                        </div>
                    </div>` : ''}
                    ${existing ? '<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px"><button type="button" class="btn btn-sm" onclick="inviteUser(\'' + existing.email + '\', \'' + (existing.name || '').replace(/'/g, "\\'") + '\')" style="font-size:0.8rem;background:var(--app-ok-soft);color:var(--app-ok);border:1px solid var(--app-ok-line)">📧 Uitnodigen voor de app</button><button type="button" class="btn btn-sm btn-secondary" onclick="resetWelcomeGuide(\'' + existing.id + '\', \'' + (existing.name || existing.email) + '\')" style="font-size:0.8rem">🔄 Welkomstgids opnieuw tonen bij volgende login</button></div>' : ''}
                `;
            }

            // Maak modal-content
            const modal = document.getElementById('admin-modal');
            document.getElementById('admin-modal-title').textContent = title;
            document.getElementById('admin-modal-fields').innerHTML = fields;
            const saveBtn = document.getElementById('admin-modal-save');
            saveBtn.style.display = '';
            saveBtn.textContent = 'Opslaan';
            saveBtn.onclick = () => saveAdminItem(type);
            // Verwijder-knop tonen bij bewerken van tarieven, projecten en bedrijven.
            // deleteAdminItem checkt foreign-key koppelingen en biedt archiveren aan
            // als hard delete niet kan.
            const delBtn = document.getElementById('admin-modal-delete');
            if (delBtn) {
                const canDelete = isEdit && (type === 'tarief' || type === 'project' || type === 'persoon');
                delBtn.style.display = canDelete ? 'block' : 'none';
                delBtn.dataset.type = type;
            }
            modal.classList.add('active');

            // Vul project-dropdown als tarief
            if (type === 'tarief') {
                loadProjectDropdown().then(() => {
                    if (existing && existing.project_id) {
                        const projId = typeof existing.project_id === 'object' ? existing.project_id.id : existing.project_id;
                        const sel = document.getElementById('adm-tar-project');
                        if (sel) sel.value = projId;
                    }
                    // Selecteer gebruiker bij bewerken
                    if (existing && existing.user_id) {
                        const userId = typeof existing.user_id === 'object' ? existing.user_id.id : existing.user_id;
                        const userSel = document.getElementById('adm-tar-user');
                        if (userSel) userSel.value = userId;
                    }
                    // Km-veld tonen/verbergen op basis van geselecteerde medewerker
                    updateTariffKmVisibility();
                });
            }

            // Vul bedrijf-dropdown bij gebruiker
            if (type === 'gebruiker') {
                const compSel = document.getElementById('adm-user-company');
                if (compSel && window._adminCompanies) {
                    const filteredComps = window._adminCompanies.filter(c => {
                        if (c.is_test === true) return false;
                        if (c.archived) return false;
                        return true;
                    });
                    // Deduplicate by name (keep first occurrence)
                    const seen = new Set();
                    const uniqueComps = filteredComps.filter(c => {
                        if (seen.has(c.name)) return false;
                        seen.add(c.name);
                        return true;
                    });
                    compSel.innerHTML = '<option value="">-- Geen bedrijf --</option>' +
                        uniqueComps.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
                    // Als bestaand bedrijf niet in gefilterde lijst zit, toch toevoegen
                    if (existing && existing.company_id) {
                        if (!uniqueComps.find(c => c.id === existing.company_id)) {
                            const orig = window._adminCompanies.find(c => c.id === existing.company_id);
                            if (orig) {
                                compSel.innerHTML += `<option value="${orig.id}">${escapeHtml(orig.name)} (gearchiveerd)</option>`;
                            }
                        }
                        compSel.value = existing.company_id;
                    }
                }
                // Vul ook de "factureert via" dropdown · zelfde lijst als eigen-BV
                const ivSel = document.getElementById('adm-user-invoice-via');
                if (ivSel && window._adminCompanies) {
                    const filteredCompsIV = window._adminCompanies.filter(c => {
                        if (c.is_test === true) return false;
                        if (c.archived) return false;
                        return true;
                    });
                    const seenIV = new Set();
                    const uniqueCompsIV = filteredCompsIV.filter(c => {
                        if (seenIV.has(c.name)) return false;
                        seenIV.add(c.name);
                        return true;
                    });
                    ivSel.innerHTML = '<option value="">Zelfde als eigen BV</option>' +
                        uniqueCompsIV.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
                    if (existing && existing.invoice_via_company_id) {
                        if (!uniqueCompsIV.find(c => c.id === existing.invoice_via_company_id)) {
                            const orig = window._adminCompanies.find(c => c.id === existing.invoice_via_company_id);
                            if (orig) {
                                ivSel.innerHTML += `<option value="${orig.id}">${escapeHtml(orig.name)} (gearchiveerd)</option>`;
                            }
                        }
                        ivSel.value = existing.invoice_via_company_id;
                    }
                }
                // Gemachtigden-sectie vullen (alleen bij bestaande gebruiker)
                if (existing && existing.id) loadFillDelegations(existing.id);
            }

            // Vul bedrijf-dropdowns bij project
            if (type === 'project') {
                const companies = window._adminCompanies || [];
                const companyOpts = companies.map(c => `<option value="${c.id}">${escapeHtml(c.name)}${c.contact_name ? ' (' + escapeHtml(c.contact_name) + ')' : ''}</option>`).join('');

                const factuurSel = document.getElementById('adm-proj-factuur-company');
                if (factuurSel) {
                    factuurSel.innerHTML = '<option value="">Geen bedrijf gekoppeld</option>' + companyOpts;
                    // Bestaande waarde: client_company_id (kan object zijn door join)
                    const existingClientId = existing ? (typeof existing.client_company_id === 'object' ? existing.client_company_id?.id : existing.client_company_id) : null;
                    if (existingClientId) factuurSel.value = existingClientId;
                }

                const ioSel = document.getElementById('adm-proj-io-company');
                if (ioSel) {
                    ioSel.innerHTML = '<option value="">Zelfde als factuur-ontvanger</option>' + companyOpts;
                    if (existing && existing.io_company_id) ioSel.value = existing.io_company_id;
                }
            }

            // Laad projecttoewijzingen bij bestaand project
            if (type === 'project' && _editingId) {
                loadProjectAssignments(_editingId);
            }

            // Laad contactpersonen bij bedrijf
            if (type === 'persoon' && existing) {
                const list = document.getElementById('adm-pers-contacts-list');
                if (list) {
                    try {
                        let contacts = existing.contacts;
                        if (typeof contacts === 'string') contacts = JSON.parse(contacts);
                        if (contacts && contacts.length > 0) {
                            // Nieuwe structuur: laad alle contacten
                            contacts.forEach(c => addExtraContact(c));
                        } else if (existing.contact_name || existing.email) {
                            // Migratie: oude velden → eerste contact
                            addExtraContact({
                                name: existing.contact_name || '',
                                email: existing.email || '',
                                role: existing.contact_function || '',
                                receives_weekstaat: true,
                                receives_factuur: true,
                                receives_io: !!(existing.email_po)
                            });
                        }
                    } catch(e) { console.warn('Contacts parse error', e); }
                }
            }
        }

        async function loadProjectDropdown() {
            const sb = getSupabase();
            if (!sb) return;
            const { data: projects } = await sb.from('projects').select('id, name, project_code').order('name');
            window._tariffProjects = projects || [];
            const sel = document.getElementById('adm-tar-project');
            if (projects) {
                sel.innerHTML = projects.map(p => `<option value="${p.id}">${escapeHtml(p.project_code)} | ${escapeHtml(p.name)}</option>`).join('');
            }
            updateTariffKmVisibility();
            // Gebruikers dropdown vullen
            const { data: users } = await sb.from('users').select('id, email, name, allow_km, allow_hotel').order('name');
            window._tariffUsers = users || [];
            const userSel = document.getElementById('adm-tar-user');
            if (userSel && users) {
                userSel.innerHTML = '<option value="">Projectbreed (alle medewerkers)</option>' +
                    users.map(u => `<option value="${u.id}">${escapeHtml(u.name || u.email)}</option>`).join('');
            }
        }

        function updateTariffKmVisibility() {
            const kmWrap = document.getElementById('adm-tar-km-wrap');
            if (!kmWrap) return;
            const userId = document.getElementById('adm-tar-user')?.value;
            if (!userId) {
                // Projectbreed · toon km-tarief
                kmWrap.style.display = 'block';
                return;
            }
            const user = (window._tariffUsers || []).find(u => u.id === userId);
            kmWrap.style.display = (user && user.allow_km !== false) ? 'block' : 'none';
        }

        // ===== NIEUWE-WEEKSTATEN TELLER (admin) =====
        // Toont een badge op de Beheer-tegel + Weekstaten-tegel met het aantal
        // verstuurde weekstaten dat binnenkwam sinds de admin de weekstaten-lijst
        // voor het laatst opende (tijdstip in localStorage). Vervangt de oude
        // notificatie-mail. Alleen voor admins.
        function _setWeekstatenBadge(n) {
            ['beheer-badge', 'weekstaten-tile-badge'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                if (n > 0) { el.textContent = n > 99 ? '99+' : String(n); el.style.display = 'inline-flex'; }
                else el.style.display = 'none';
            });
        }

        async function updateWeekstatenBadge() {
            if (!currentUser || currentUser.role !== 'admin') { _setWeekstatenBadge(0); return; }
            const sb = getSupabase();
            if (!sb) return;
            let seen = localStorage.getItem('kts-weekstaten-seen');
            if (!seen) { // eerste keer · vanaf nu tellen (geen historische inhaalslag)
                seen = new Date().toISOString();
                localStorage.setItem('kts-weekstaten-seen', seen);
            }
            try {
                const { count } = await sb.from('week_status')
                    .select('*', { count: 'exact', head: true })
                    .eq('status', 'verstuurd')
                    .gt('submitted_at', seen);
                _setWeekstatenBadge(count || 0);
            } catch (e) { /* stil · badge blijft zoals hij is */ }
        }

        function markWeekstatenSeen() {
            localStorage.setItem('kts-weekstaten-seen', new Date().toISOString());
            _setWeekstatenBadge(0);
        }

        // ===== WEEKSTATEN ADMIN =====
        // Archief-filter state: alleen jaar (geen open/betaald · weekstaten hebben
        // hun eigen status-flow en worden niet 'betaald').
        let _wsFilter = { year: String(new Date().getFullYear()) };
        function setWsYearFilter(year) {
            _wsFilter.year = year || '';
            loadWeekstaten();
        }

        async function loadWeekstaten() {
            // Weekstaten-tab geopend · markeer als gezien, badge naar 0
            markWeekstatenSeen();
            const sb = getSupabase();
            if (!sb) return;
            const listEl = document.getElementById('admin-weekstaten-list');
            const conceptEl = document.getElementById('admin-weekstaten-concept');
            listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:0.85rem">Laden...</div>';
            if (conceptEl) conceptEl.innerHTML = '';

            // Vul filters als dat nog niet is gedaan
            const projSel = document.getElementById('ws-filter-project');
            if (projSel.options.length <= 1 && window._adminProjects) {
                window._adminProjects.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.id;
                    opt.textContent = p.project_code + ' | ' + p.name;
                    projSel.appendChild(opt);
                });
            }
            const userSel = document.getElementById('ws-filter-user');
            if (window._adminUsers) {
                const curVal = userSel.value;
                userSel.innerHTML = '<option value="">Alle medewerkers</option>';
                getFilteredUsers().forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = u.id;
                    opt.textContent = u.name || u.email;
                    userSel.appendChild(opt);
                });
                if (curVal) userSel.value = curVal;
            }

            try {
                const filterProj = projSel.value;
                const filterUser = userSel.value;
                const filteredUserIds = new Set(getFilteredUsers().map(u => u.id));

                // === CONCEPT WEEKSTATEN (opgeslagen/ondertekend, niet verstuurd) ===
                let conceptQuery = sb.from('week_status').select('*')
                    .in('status', ['opgeslagen', 'ondertekend'])
                    .order('year', { ascending: false })
                    .order('week_number', { ascending: false });
                if (filterProj) conceptQuery = conceptQuery.eq('project_id', filterProj);
                if (filterUser) conceptQuery = conceptQuery.eq('user_id', filterUser);

                const { data: conceptRecords } = await conceptQuery;
                const filteredConcepts = (conceptRecords || []).filter(ws => filteredUserIds.has(ws.user_id));

                // User/project lookup (vroeg laden voor beide secties)
                const userMap = {};
                (window._adminUsers || []).forEach(u => { userMap[u.id] = escapeHtml(u.name || u.email); });
                const projMap = {};
                const projNameMap = {};
                (window._adminProjects || []).forEach(p => {
                    projMap[p.id] = escapeHtml(p.project_code);
                    projNameMap[p.id] = escapeHtml(p.name || '');
                });

                // Helper: format "laatst aangepast" voor in de tegel
                // bv: "✏️ 4 mei 17:23 · Bart Hoogeveen"
                function fmtModified(ws) {
                    if (!ws.last_modified_at) return '';
                    const d = new Date(ws.last_modified_at);
                    if (isNaN(d.getTime())) return '';
                    const now = new Date();
                    const diffMin = Math.floor((now - d) / 60000);
                    const diffH = Math.floor(diffMin / 60);
                    const diffD = Math.floor(diffH / 24);
                    let when;
                    if (diffMin < 5)        when = 'Net aangepast';
                    else if (diffMin < 60)  when = diffMin + ' min geleden';
                    else if (diffH < 24)    when = diffH + ' uur geleden';
                    else if (diffD < 7)     when = diffD + ' dag' + (diffD > 1 ? 'en' : '') + ' geleden';
                    else                    when = d.toLocaleDateString('nl-NL', { day:'numeric', month:'short' }) + ' ' + d.toTimeString().slice(0,5);
                    const byName = ws.last_modified_by ? (userMap[ws.last_modified_by] || 'Onbekend') : '';
                    const byPart = byName ? ' · ' + byName : '';
                    return `<div style="font-size:0.65rem;color:#94a3b8;margin-top:2px">✏️ ${when}${byPart}</div>`;
                }

                if (conceptEl && filteredConcepts.length > 0) {
                    conceptEl.innerHTML = `
                        <div style="font-weight:600;font-size:0.85rem;color:var(--muted);margin-bottom:8px">Concept weekstaten (nog niet verstuurd)</div>
                        ${filteredConcepts.map(ws => {
                            const userName = userMap[ws.user_id] || 'Onbekend';
                            const projCode = projMap[ws.project_id] || '?';
                            const projName = projNameMap[ws.project_id] || '';
                            const statusBadge = ws.status === 'ondertekend'
                                ? '<span style="font-size:0.65rem;background:var(--app-info-soft);color:var(--app-info);padding:2px 6px;border-radius:4px;font-weight:600">✍️ Ondertekend</span>'
                                : '<span style="font-size:0.65rem;background:var(--app-warn-soft);color:var(--app-warn);padding:2px 6px;border-radius:4px;font-weight:600">📝 Opgeslagen</span>';
                            return `<div class="entry-card" style="display:flex;justify-content:space-between;align-items:center;gap:6px;border-left:3px solid #f59e0b">
                                <div style="flex:1;min-width:0">
                                    <div style="font-weight:600;font-size:0.85rem;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                                        ${userName} ${statusBadge}
                                    </div>
                                    <div style="font-size:0.75rem;color:var(--muted)">Week ${ws.week_number} · ${ws.year}</div>
                                    <div style="font-size:0.7rem;color:var(--muted);margin-top:1px"><strong>${projCode}</strong>${projName ? ' · ' + projName : ''}</div>
                                    ${fmtModified(ws)}
                                </div>
                                <div style="display:flex;gap:4px;flex-shrink:0">
                                    <button onclick="event.stopPropagation();adminSignForUser('${ws.user_id}','${ws.project_id}',${ws.week_number},${ws.year})" class="btn btn-sm" style="padding:4px 8px;font-size:0.7rem;background:var(--app-ok-soft);color:var(--app-ok);border:1px solid var(--app-ok-line)" title="Ondertekenen & versturen namens gebruiker">✍️</button>
                                    <button onclick="event.stopPropagation();adminEditWeekEntries('${ws.user_id}','${ws.project_id}',${ws.week_number},${ws.year},'${jsStr(userName)}')" class="btn btn-sm" style="padding:4px 8px;font-size:0.7rem;background:var(--app-info-soft);color:var(--app-info);border:1px solid var(--app-info-line)" title="Uren bekijken">👁️</button>
                                    <button onclick="event.stopPropagation();adminMoveWeekstaat('${ws.user_id}','${ws.project_id}',${ws.week_number},${ws.year},'${jsStr(userName)}','${jsStr(projCode)}')" class="btn btn-sm" style="padding:4px 8px;font-size:0.7rem;background:var(--app-idle-soft);color:var(--muted);border:1px solid var(--border)" title="Verplaats naar ander project">🔀</button>
                                    <button onclick="event.stopPropagation();adminDeleteWeekstaat('${ws.user_id}','${ws.project_id}',${ws.week_number},${ws.year},'${jsStr(userName)}','${jsStr(projCode)}')" class="btn btn-sm" style="padding:4px 8px;font-size:0.7rem;background:var(--app-alert-soft);color:var(--app-alert);border:1px solid var(--app-alert-line)" title="Concept verwijderen">🗑️</button>
                                </div>
                            </div>`;
                        }).join('')}
                        <div style="border-top:2px solid var(--border);margin-top:12px;margin-bottom:4px"></div>
                    `;
                }

                // === VERSTUURDE WEEKSTATEN ===
                let query = sb.from('week_status').select('*')
                    .eq('status', 'verstuurd')
                    .order('year', { ascending: false })
                    .order('week_number', { ascending: false });
                if (filterProj) query = query.eq('project_id', filterProj);
                if (filterUser) query = query.eq('user_id', filterUser);

                const { data: weekRecords, error: wsErr } = await query;
                if (wsErr) throw wsErr;

                let filteredRecords = (weekRecords || []).filter(ws => filteredUserIds.has(ws.user_id));

                // Vul jaar-dropdown op basis van wat in DB zit
                const yearsInData = [...new Set(filteredRecords.map(r => r.year).filter(Boolean))].sort((a,b) => b-a);
                const yearSel = document.getElementById('ws-year-filter');
                if (yearSel) {
                    const currentVal = _wsFilter.year;
                    const yearOpts = ['<option value="">Alle jaren</option>'].concat(
                        yearsInData.map(y => `<option value="${y}"${String(y) === currentVal ? ' selected' : ''}>${y}</option>`)
                    );
                    yearSel.innerHTML = yearOpts.join('');
                    if (currentVal && !yearsInData.includes(parseInt(currentVal))) {
                        yearSel.value = '';
                        _wsFilter.year = '';
                    } else {
                        yearSel.value = currentVal;
                    }
                }

                // Filter op jaar
                if (_wsFilter.year) filteredRecords = filteredRecords.filter(r => String(r.year) === _wsFilter.year);

                if (!filteredRecords || filteredRecords.length === 0) {
                    const leegMsg = _wsFilter.year
                        ? `Geen verstuurde weekstaten in ${_wsFilter.year}`
                        : 'Geen verstuurde weekstaten gevonden';
                    listEl.innerHTML = `<div style="text-align:center;padding:30px;color:var(--muted);font-size:0.85rem">${leegMsg}</div>`;
                    return;
                }

                const projFullMap = {};
                (window._adminProjects || []).forEach(p => { projFullMap[p.id] = p; });

                listEl.innerHTML = filteredRecords.map(ws => {
                    const userName = userMap[ws.user_id] || 'Onbekend';
                    const projCode = projMap[ws.project_id] || '?';
                    const projName = projNameMap[ws.project_id] || '';
                    const approvalStatus = ws.approval_status || 'geen';

                    // Storage pad reconstrueren
                    const userSlug = userName.replace(/\s+/g, '_');
                    const storagePath = `${ws.year}/week-${ws.week_number}`;

                    // Goedkeuring badge
                    let approvalBadge = '';
                    let approvalAction = '';
                    // Admin-goedkeurknop (voor alle statussen behalve 'goedgekeurd')
                    let adminApproveBtn = '';
                    if (approvalStatus !== 'goedgekeurd') {
                        adminApproveBtn = `<button onclick="event.stopPropagation();adminApproveWeekstaat('${ws.user_id}','${ws.project_id}',${ws.week_number},${ws.year})" class="btn btn-sm" style="padding:4px 8px;font-size:0.7rem;background:var(--app-ok-soft);color:var(--app-ok);border:1px solid var(--app-ok-line)" title="Admin goedkeuren">✅</button>`;
                    }

                    if (approvalStatus === 'goedgekeurd') {
                        approvalBadge = '<span style="font-size:0.65rem;background:var(--app-ok-soft);color:var(--app-ok);padding:2px 6px;border-radius:4px;font-weight:600">✅ Goedgekeurd</span>';
                        approvalAction = `<button onclick="event.stopPropagation();openConfirmationModal('${ws.user_id}','${ws.project_id}',${ws.week_number},${ws.year})" class="btn btn-sm" style="padding:4px 8px;font-size:0.7rem;background:var(--app-ok-soft);color:var(--app-ok);border:1px solid var(--app-ok-line)" title="Bevestiging naar klant versturen">📩</button>`;
                    } else if (approvalStatus === 'ter_goedkeuring') {
                        approvalBadge = '<span style="font-size:0.65rem;background:var(--app-warn-soft);color:var(--app-warn);padding:2px 6px;border-radius:4px;font-weight:600">⏳ Ter goedkeuring</span>';
                        approvalAction = `<button onclick="event.stopPropagation();copyApprovalLink('${ws.approval_token}')" class="btn btn-sm" style="padding:4px 8px;font-size:0.7rem;background:var(--app-warn-soft);color:var(--app-warn);border:1px solid var(--app-warn-line)" title="Link kopiëren">🔗</button>`;
                    } else if (approvalStatus === 'afgewezen') {
                        approvalBadge = '<span style="font-size:0.65rem;background:var(--app-alert-soft);color:var(--app-alert);padding:2px 6px;border-radius:4px;font-weight:600">❌ Afgewezen</span>';
                        approvalAction = `<button onclick="event.stopPropagation();openApprovalModal('${ws.user_id}','${ws.project_id}',${ws.week_number},${ws.year})" class="btn btn-sm" style="padding:4px 8px;font-size:0.7rem" title="Opnieuw versturen">📩</button>`;
                    } else {
                        approvalAction = `<button onclick="event.stopPropagation();openApprovalModal('${ws.user_id}','${ws.project_id}',${ws.week_number},${ws.year})" class="btn btn-primary btn-sm" style="padding:4px 8px;font-size:0.7rem" title="Ter goedkeuring versturen">📩</button>`;
                    }

                    return `<div class="entry-card" style="display:flex;justify-content:space-between;align-items:center;gap:6px">
                        <div style="flex:1;min-width:0">
                            <div style="font-weight:600;font-size:0.85rem;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                                ${userName} ${approvalBadge}
                            </div>
                            <div style="font-size:0.75rem;color:var(--muted)">Week ${ws.week_number} · ${ws.year}</div>
                            <div style="font-size:0.7rem;color:var(--muted);margin-top:1px"><strong>${projCode}</strong>${projName ? ' · ' + projName : ''}</div>
                            ${fmtModified(ws)}
                        </div>
                        <div style="display:flex;gap:4px;flex-shrink:0">
                            ${adminApproveBtn}
                            ${approvalAction}
                            <button onclick="event.stopPropagation();adminEditWeekEntries('${ws.user_id}','${ws.project_id}',${ws.week_number},${ws.year},'${jsStr(userName)}')" class="btn btn-sm" style="padding:4px 8px;font-size:0.7rem;background:var(--app-info-soft);color:var(--app-info);border:1px solid var(--app-info-line)" title="Uren bewerken">✏️</button>
                            <button onclick="event.stopPropagation();downloadWeekstaatBySearch('${ws.year}','${ws.week_number}','${projCode}','${userSlug}','${ws.user_id}','${ws.project_id}')" class="btn btn-primary btn-sm" style="padding:4px 8px;font-size:0.7rem" title="PDF downloaden">📄</button>
                            <button onclick="event.stopPropagation();adminResetWeekstaat('${ws.user_id}','${ws.project_id}',${ws.week_number},${ws.year},'${jsStr(userName)}','${jsStr(projCode)}')" class="btn btn-sm" style="padding:4px 8px;font-size:0.7rem;background:var(--app-warn-soft);color:var(--app-warn);border:1px solid var(--app-warn-line)" title="Terugzetten naar concept">↩️</button>
                            <button onclick="event.stopPropagation();adminDeleteWeekstaat('${ws.user_id}','${ws.project_id}',${ws.week_number},${ws.year},'${jsStr(userName)}','${jsStr(projCode)}')" class="btn btn-sm" style="padding:4px 8px;font-size:0.7rem;background:var(--app-alert-soft);color:var(--app-alert);border:1px solid var(--app-alert-line)" title="Weekstaat verwijderen">🗑️</button>
                        </div>
                    </div>`;
                }).join('');
            } catch (err) {
                console.error('Weekstaten laden mislukt:', err);
                listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--app-alert);font-size:0.85rem">Fout bij laden: ' + err.message + '</div>';
            }
        }

        // ===== EXCEL IMPORT =====
        async function importExcel(type, fileInput) {
            if (!fileInput.files || !fileInput.files[0]) return;
            if (typeof XLSX === 'undefined') {
                showToast('⚠️ SheetJS wordt nog geladen, probeer opnieuw');
                fileInput.value = '';
                return;
            }
            const sb = getSupabase();
            if (!sb) { showToast('⚠️ Niet verbonden'); fileInput.value = ''; return; }

            const file = fileInput.files[0];
            fileInput.value = ''; // reset zodat hetzelfde bestand opnieuw gekozen kan worden

            try {
                const data = await file.arrayBuffer();
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

                if (!rows || rows.length === 0) {
                    showToast('⚠️ Geen rijen gevonden in Excel bestand');
                    return;
                }

                // Kolom mapping per type
                const columnMaps = {
                    persoon: {
                        'naam': 'name', 'name': 'name', 'bedrijfsnaam': 'name', 'bedrijf': 'name', 'company': 'name',
                        'contactpersoon': 'contact_name', 'contact': 'contact_name', 'contact_name': 'contact_name',
                        'type': 'type',
                        'kvk': 'kvk_number', 'kvk_number': 'kvk_number', 'kvknummer': 'kvk_number',
                        'btw': 'btw_number', 'btw_number': 'btw_number', 'btwnummer': 'btw_number',
                        'adres': 'address', 'address': 'address', 'straat': 'address',
                        'postcode': 'postcode', 'zip': 'postcode',
                        'stad': 'city', 'city': 'city', 'plaats': 'city', 'woonplaats': 'city',
                        'land': 'country', 'country': 'country',
                        'telefoon': 'phone', 'phone': 'phone', 'tel': 'phone',
                        'email': 'email', 'e-mail': 'email', 'mail': 'email',
                        'email_po': 'email_po', 'email po': 'email_po', 'inkooporder email': 'email_po'
                    },
                    project: {
                        'code': 'project_code', 'project_code': 'project_code', 'projectcode': 'project_code',
                        'naam': 'name', 'name': 'name', 'projectnaam': 'name', 'project': 'name',
                        'klant': 'client_name', 'client': 'client_name', 'client_name': 'client_name', 'opdrachtgever': 'client_name',
                        'locatie': 'location', 'location': 'location',
                        'omschrijving': 'default_description', 'description': 'default_description', 'default_description': 'default_description',
                        'standaard locatie': 'default_location', 'default_location': 'default_location',
                        'startdatum': 'start_date', 'start_date': 'start_date', 'start': 'start_date',
                        'status': 'status'
                    }
                };

                const colMap = columnMaps[type] || {};
                const excelCols = Object.keys(rows[0]);

                // Auto-map kolommen
                const mapping = {};
                excelCols.forEach(col => {
                    const normalized = col.toLowerCase().trim();
                    if (colMap[normalized]) {
                        mapping[col] = colMap[normalized];
                    }
                });

                // Preview modal tonen
                const modal = document.getElementById('admin-modal');
                const modalTitle = document.getElementById('admin-modal-title');
                const modalBody = document.getElementById('admin-modal-body');

                modalTitle.textContent = '📥 Excel-import · ' + (type === 'persoon' ? 'Personen & Bedrijven' : 'Projecten');

                // Mapping UI + preview tabel
                const dbFields = type === 'persoon'
                    ? ['name','contact_name','type','kvk_number','btw_number','address','postcode','city','country','phone','email','email_po']
                    : ['project_code','name','client_name','location','default_description','default_location','start_date','status'];
                const dbLabels = type === 'persoon'
                    ? ['Naam*','Contactpersoon','Type','KvK','BTW','Adres','Postcode','Stad','Land','Telefoon','E-mail','E-mail Inkooporder']
                    : ['Code*','Naam*','Klant','Locatie','Omschrijving','Standaard locatie','Startdatum','Status'];

                let html = '<div style="font-size:0.8rem;margin-bottom:10px;color:var(--app-ink-500)">Gevonden: <b>' + rows.length + '</b> rijen in "' + sheetName + '"</div>';

                // Kolomkoppeling
                html += '<div style="margin-bottom:12px"><div style="font-weight:600;font-size:0.85rem;margin-bottom:6px">Kolomkoppeling</div>';
                html += '<div style="display:grid;grid-template-columns:1fr 20px 1fr;gap:4px;align-items:center;font-size:0.8rem">';
                dbFields.forEach((field, i) => {
                    html += '<div style="font-weight:500">' + dbLabels[i] + '</div>';
                    html += '<div style="text-align:center;color:var(--app-ink-400)">←</div>';
                    html += '<select id="imp-map-' + field + '" style="padding:4px 6px;border:1px solid var(--app-line-strong);border-radius:6px;font-size:0.8rem">';
                    html += '<option value="">Overslaan</option>';
                    excelCols.forEach(col => {
                        const selected = mapping[col] === field ? ' selected' : '';
                        html += '<option value="' + col.replace(/"/g, '&quot;') + '"' + selected + '>' + col + '</option>';
                    });
                    html += '</select>';
                });
                html += '</div></div>';

                // Preview (eerste 5 rijen)
                const previewRows = rows.slice(0, 5);
                html += '<div style="font-weight:600;font-size:0.85rem;margin-bottom:6px">Preview (eerste ' + Math.min(5, rows.length) + ' rijen)</div>';
                html += '<div style="overflow-x:auto;max-height:200px;border:1px solid var(--border);border-radius:8px">';
                html += '<table style="width:100%;font-size:0.75rem;border-collapse:collapse">';
                html += '<thead><tr style="background:var(--app-bg-deep)">';
                excelCols.forEach(col => {
                    html += '<th style="padding:4px 6px;text-align:left;white-space:nowrap;border-bottom:1px solid var(--border)">' + col + '</th>';
                });
                html += '</tr></thead><tbody>';
                previewRows.forEach(row => {
                    html += '<tr>';
                    excelCols.forEach(col => {
                        html += '<td style="padding:3px 6px;border-bottom:1px solid var(--border);white-space:nowrap">' + (row[col] != null ? String(row[col]).substring(0, 40) : '') + '</td>';
                    });
                    html += '</tr>';
                });
                html += '</tbody></table></div>';

                // Test mode checkbox

                html += '<div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end">';
                html += '<button class="btn btn-sm" onclick="document.getElementById(\'admin-modal\').classList.remove(\'active\')" style="background:var(--app-bg-deep);color:var(--app-ink-700);border:1px solid var(--app-line-strong)">Annuleren</button>';
                html += '<button class="btn btn-primary btn-sm" id="imp-confirm-btn">✓ Importeer ' + rows.length + ' rijen</button>';
                html += '</div>';

                modalBody.innerHTML = html;
                modal.classList.add('active');

                // Importeer knop click handler
                document.getElementById('imp-confirm-btn').onclick = async function() {
                    this.disabled = true;
                    this.textContent = 'Importeren...';

                    // Lees actuele mapping vanuit dropdowns
                    const finalMapping = {};
                    dbFields.forEach(field => {
                        const sel = document.getElementById('imp-map-' + field);
                        if (sel && sel.value) finalMapping[field] = sel.value;
                    });

                    const isTest = false; // test-modus uitgefaseerd 2026-07-03
                    const table = type === 'persoon' ? 'companies' : 'projects';
                    const insertRows = [];
                    let skipped = 0;

                    rows.forEach(row => {
                        const obj = {};
                        Object.entries(finalMapping).forEach(([dbField, excelCol]) => {
                            let val = row[excelCol];
                            if (val !== undefined && val !== null && String(val).trim() !== '') {
                                obj[dbField] = String(val).trim();
                            }
                        });

                        // Verplichte velden check
                        if (type === 'persoon' && !obj.name) { skipped++; return; }
                        if (type === 'project' && (!obj.project_code || !obj.name)) { skipped++; return; }

                        // Defaults
                        if (type === 'persoon') {
                            if (!obj.type) obj.type = 'opdrachtgever';
                            if (!obj.country) obj.country = 'Nederland';
                        }
                        if (type === 'project') {
                            if (!obj.status) obj.status = 'active';
                        }
                        obj.is_test = isTest;

                        insertRows.push(obj);
                    });

                    if (insertRows.length === 0) {
                        showToast('⚠️ Geen geldige rijen om te importeren');
                        document.getElementById('imp-confirm-btn').disabled = false;
                        document.getElementById('imp-confirm-btn').textContent = '✓ Importeer ' + rows.length + ' rijen';
                        return;
                    }

                    try {
                        const { data: insertedData, error } = await sb.from(table).insert(insertRows).select();
                        if (error) throw error;

                        modal.classList.remove('active');
                        const msg = '✓ ' + insertRows.length + ' rij' + (insertRows.length > 1 ? 'en' : '') + ' geïmporteerd' +
                            (skipped > 0 ? ' (' + skipped + ' overgeslagen)' : '');
                        showToast(msg);

                        // Herlaad de lijst
                        if (type === 'persoon') loadAdminData('personen');
                        else if (type === 'project') loadAdminData('projecten');
                    } catch(err) {
                        console.error('Import error:', err);
                        showToast('❌ Import fout: ' + (err.message || err));
                        document.getElementById('imp-confirm-btn').disabled = false;
                        document.getElementById('imp-confirm-btn').textContent = '✓ Importeer ' + rows.length + ' rijen';
                    }
                };
            } catch(err) {
                console.error('Excel parse error:', err);
                showToast('❌ Kan bestand niet lezen: ' + (err.message || err));
            }
        }

        function addExtraContact(data) {
            const list = document.getElementById('adm-pers-contacts-list');
            if (!list) return;
            const row = document.createElement('div');
            row.className = 'extra-contact-row';
            row.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-bottom:10px;padding:10px;background:var(--app-surface);border:1px solid var(--border);border-radius:8px;position:relative';
            row.innerHTML = `
                <span class="ec-hoofdcontact-label" style="display:none;font-size:0.65rem;font-weight:700;color:var(--kts-blue);text-transform:uppercase;letter-spacing:0.5px">Hoofdcontact</span>
                <button type="button" onclick="this.parentElement.remove();updateHoofdcontactLabel()" style="position:absolute;top:6px;right:8px;background:none;border:none;color:#ef4444;cursor:pointer;font-size:0.9rem;padding:0" title="Verwijderen">✕</button>
                <input type="text" class="ec-name" placeholder="Naam" value="${data ? escapeHtml(data.name||'') : ''}" style="width:calc(100% - 24px);padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:0.8rem">
                <input type="email" class="ec-email" placeholder="E-mail" value="${data ? escapeHtml(data.email||'') : ''}" style="width:calc(100% - 24px);padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:0.8rem">
                <input type="text" class="ec-role" placeholder="Functie" value="${data ? escapeHtml(data.role||'') : ''}" style="width:calc(100% - 24px);padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:0.8rem">
                <div style="display:flex;gap:12px;margin-top:2px;font-size:0.75rem">
                    <label class="cb-weekstaat" style="display:flex;align-items:center;gap:4px;cursor:pointer;color:var(--app-ink-700)">
                        <input type="checkbox" class="ec-recv-weekstaat" ${data && data.receives_weekstaat ? 'checked' : ''} style="width:14px;height:14px;accent-color:var(--kts-blue)"> Weekstaten
                    </label>
                    <label class="cb-factuur" style="display:flex;align-items:center;gap:4px;cursor:pointer;color:var(--app-ink-700)">
                        <input type="checkbox" class="ec-recv-factuur" ${data && data.receives_factuur ? 'checked' : ''} style="width:14px;height:14px;accent-color:var(--kts-blue)"> Facturen
                    </label>
                    <label class="cb-io" style="display:flex;align-items:center;gap:4px;cursor:pointer;color:var(--app-ink-700)">
                        <input type="checkbox" class="ec-recv-io" ${data && data.receives_io ? 'checked' : ''} style="width:14px;height:14px;accent-color:var(--kts-blue)"> Inkooporders
                    </label>
                </div>
            `;
            list.appendChild(row);
            updateContactCheckboxVisibility();
            updateHoofdcontactLabel();
        }

        function updateContactCheckboxVisibility() {
            const typeEl = document.getElementById('adm-pers-type');
            if (!typeEl) return;
            const ptype = typeEl.value;
            // Klant: Weekstaten + Facturen zichtbaar, IO verborgen
            // ZZP: alleen IO zichtbaar
            // KTS: alles zichtbaar (intern)
            const showWeekstaat = (ptype === 'client' || ptype === 'kts');
            const showFactuur = (ptype === 'client' || ptype === 'kts');
            const showIO = (ptype === 'zzp' || ptype === 'kts');

            document.querySelectorAll('#adm-pers-contacts-list .cb-weekstaat').forEach(el => {
                el.style.display = showWeekstaat ? 'flex' : 'none';
                if (!showWeekstaat) el.querySelector('input').checked = false;
            });
            document.querySelectorAll('#adm-pers-contacts-list .cb-factuur').forEach(el => {
                el.style.display = showFactuur ? 'flex' : 'none';
                if (!showFactuur) el.querySelector('input').checked = false;
            });
            document.querySelectorAll('#adm-pers-contacts-list .cb-io').forEach(el => {
                el.style.display = showIO ? 'flex' : 'none';
                if (!showIO) el.querySelector('input').checked = false;
            });
        }

        function updateHoofdcontactLabel() {
            const rows = document.querySelectorAll('#adm-pers-contacts-list .extra-contact-row');
            rows.forEach((row, i) => {
                const label = row.querySelector('.ec-hoofdcontact-label');
                if (label) label.style.display = i === 0 ? 'block' : 'none';
            });
        }

        function getExtraContacts() {
            const rows = document.querySelectorAll('#adm-pers-contacts-list .extra-contact-row');
            const contacts = [];
            rows.forEach(row => {
                const name = row.querySelector('.ec-name').value.trim();
                const email = row.querySelector('.ec-email').value.trim();
                const role = row.querySelector('.ec-role').value.trim();
                const receives_weekstaat = row.querySelector('.ec-recv-weekstaat').checked;
                const receives_factuur = row.querySelector('.ec-recv-factuur').checked;
                const receives_io = row.querySelector('.ec-recv-io').checked;
                if (name || email) {
                    contacts.push({ name, email, role, receives_weekstaat, receives_factuur, receives_io });
                }
            });
            return contacts;
        }

        async function adminApproveWeekstaat(userId, projectId, weekNumber, year) {
            if (!await confirmAsync(`Week ${weekNumber} (${year}) goedkeuren als admin?\n\nDe PDF wordt vernieuwd met de actuele uren + extra kosten. Handtekening-velden blijven leeg (admin-goedkeuring zonder formele ondertekening).`)) return;
            const sb = getSupabase();
            if (!sb) { showToast('⚠️ Niet verbonden'); return; }
            try {
                const { error } = await sb.from('week_status')
                    .update({
                        approval_status: 'goedgekeurd',
                        approval_completed_at: new Date().toISOString()
                    })
                    .eq('user_id', userId)
                    .eq('project_id', projectId)
                    .eq('week_number', weekNumber)
                    .eq('year', year);
                if (error) throw error;

                // Genereer PDF opnieuw met actuele uren + expenses, zonder handtekeningen.
                // De oude PDF in storage wordt overschreven zodat downloaden een verse
                // versie geeft met de admin-gewijzigde data.
                try {
                    const projCodeApp = (window._adminProjects || []).find(p => p.id === projectId)?.project_code || '';
                    const userObj = (window._adminUsers || []).find(u => u.id === userId);
                    const userSlugApp = userObj ? (userObj.name || userObj.email || '').replace(/\s+/g, '_') : '';
                    await regenerateWeekstaatPdf(userId, projectId, weekNumber, year, projCodeApp, userSlugApp,
                        { clearSignatures: true, skipDownload: true });
                } catch (regenErr) {
                    console.warn('PDF regeneratie bij admin-goedkeuring mislukt:', regenErr);
                    // Niet-fataal: goedkeuring zelf is wel gelukt
                }

                showToast('✅ Weekstaat goedgekeurd · PDF bijgewerkt met laatste uren + extra kosten');
                loadWeekstaten();

                // Doorklik-flow: vraag of admin direct een inkooporder wil maken
                const wantIO = await askContinueAsync({
                    title: 'Weekstaat goedgekeurd',
                    message: `Week ${weekNumber}/${year} is goedgekeurd.<br>Wil je nu direct een inkooporder voor deze week maken?`,
                    confirmLabel: 'Ja, naar inkooporder',
                    cancelLabel: 'Niet nu',
                    iconSvg: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#07567F" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>'
                });
                if (wantIO) {
                    switchAdminTab('inkooporders');
                    // Maand uit de ISO-week · gebruik bestaande helper i.p.v. setDate-magic
                    const monday = (typeof getWeekMondayFromWeekNumber === 'function')
                        ? getWeekMondayFromWeekNumber(year, weekNumber)
                        : new Date(year, 0, 1 + (weekNumber - 1) * 7);
                    const month = monday.getMonth() + 1;
                    // Wacht tot IO-tab gerendered + filters geladen
                    setTimeout(async () => {
                        if (typeof loadInkooporderFilters === 'function') {
                            await loadInkooporderFilters();
                        }
                        const projEl = document.getElementById('io-filter-project');
                        const userEl = document.getElementById('io-filter-user');
                        const yearEl = document.getElementById('io-filter-year');
                        const monthEl = document.getElementById('io-filter-month');
                        if (projEl) projEl.value = projectId;
                        if (userEl) userEl.value = userId;
                        if (yearEl) yearEl.value = String(year);
                        // io-filter-month options gebruiken 2-digit zero-padded values
                        // ('01'..'12') · dus padding is verplicht anders matcht .value niet
                        if (monthEl) monthEl.value = String(month).padStart(2, '0');
                        // Trigger autoFillCompanyForUser zodat IO-bedrijf en zzp-bedrijf
                        // automatisch geselecteerd worden uit de project/user koppeling
                        if (userEl && typeof autoFillCompanyForUser === 'function') autoFillCompanyForUser();
                        // Per-week selectie aanzetten en juiste week kiezen
                        const useWeekEl = document.getElementById('io-use-week');
                        const weekWrap = document.getElementById('io-week-selector');
                        const weekEl = document.getElementById('io-filter-week');
                        if (useWeekEl) useWeekEl.checked = true;
                        if (weekWrap) weekWrap.style.display = '';
                        if (weekEl) {
                            // Voeg de week-optie toe als die er nog niet is
                            if (!Array.from(weekEl.options).some(o => String(o.value) === String(weekNumber))) {
                                const opt = document.createElement('option');
                                opt.value = weekNumber;
                                opt.textContent = `Week ${weekNumber}`;
                                weekEl.appendChild(opt);
                            }
                            weekEl.value = String(weekNumber);
                        }
                        // Auto-preview
                        if (typeof previewPO === 'function') previewPO();
                    }, 300);
                }
            } catch (e) {
                showToast('❌ Fout: ' + e.message);
            }
        }

        // Helper: zet weekstaat automatisch terug naar concept als er na ondertekening/goedkeuring
        // nog wijzigingen worden gedaan (extra kosten, uren aangepast, etc.). Anders blijft de
        // PDF/handtekening verouderd terwijl de data al gewijzigd is. Verwijdert ook de oude PDF.
        // Geeft true terug als er gereset is, false als er niets te invalideren was.
        async function invalidateApprovalOnChange(userId, projectId, weekNumber, year) {
            const sb = getSupabase();
            if (!sb || !userId || !projectId || !weekNumber || !year) return false;
            try {
                const { data: ws } = await sb.from('week_status')
                    .select('status, approval_status, signed_at')
                    .eq('user_id', userId).eq('project_id', projectId)
                    .eq('week_number', weekNumber).eq('year', year).maybeSingle();
                if (!ws) return false;
                // Alleen resetten als er echt iets te invalideren is. Concept/opgeslagen zonder
                // approval_status hoeven niet aangeraakt te worden.
                const needsReset = ws.status === 'verstuurd'
                    || ws.status === 'ondertekend'
                    || ws.approval_status === 'ter_goedkeuring'
                    || ws.approval_status === 'goedgekeurd'
                    || !!ws.signed_at;
                if (!needsReset) return false;

                // Probeer eerst de volledige reset (incl. submitted_at, last_modified_at)
                const fullPayload = {
                    status: 'opgeslagen',
                    approval_status: null,
                    approval_token: null,
                    approval_completed_at: null,
                    approver_name: null,
                    approver_email: null,
                    client_signature_url: null,
                    approval_comments: null,
                    signed_at: null,
                    submitted_at: null,
                    last_modified_at: new Date().toISOString()
                };
                let { error } = await sb.from('week_status').update(fullPayload)
                    .eq('user_id', userId).eq('project_id', projectId)
                    .eq('week_number', weekNumber).eq('year', year);
                // Fallback voor DB zonder last_modified kolommen
                if (error && /last_modified|submitted_at/.test(error.message || '')) {
                    const fallback = { ...fullPayload };
                    delete fallback.last_modified_at;
                    delete fallback.submitted_at;
                    ({ error } = await sb.from('week_status').update(fallback)
                        .eq('user_id', userId).eq('project_id', projectId)
                        .eq('week_number', weekNumber).eq('year', year));
                }
                if (error) {
                    console.warn('invalidateApprovalOnChange update mislukt:', error.message);
                    return false;
                }

                // Oude PDF opruimen zodat klant/admin niet de verouderde versie ziet
                try {
                    const folderPath = `${year}/week-${weekNumber}`;
                    const { data: files } = await sb.storage.from('weekstaten').list(folderPath, { limit: 50 });
                    if (files && files.length > 0) {
                        const { data: proj } = await sb.from('projects').select('project_code').eq('id', projectId).maybeSingle();
                        const { data: usr } = await sb.from('users').select('name').eq('id', userId).maybeSingle();
                        const projCode = proj?.project_code || '';
                        const userSlug = (usr?.name || '').replace(/\s+/g, '_');
                        const match = files.find(f =>
                            (projCode && f.name.includes(projCode))
                            && (userSlug && f.name.includes(userSlug))
                        );
                        if (match) {
                            await sb.storage.from('weekstaten').remove([`${folderPath}/${match.name}`]);
                            console.log('Verouderde PDF verwijderd na wijziging:', match.name);
                        }
                    }
                } catch (storageErr) {
                    console.warn('PDF cleanup overgeslagen:', storageErr.message || storageErr);
                }

                // Caller toont een eigen toast met de invalidate-status erbij;
                // we tonen hier geen aparte toast omdat die direct overschreven zou worden.
                return true;
            } catch (e) {
                console.warn('invalidateApprovalOnChange exception:', e.message || e);
                return false;
            }
        }

        // Weekstaat (uren + weekstatus + declaraties) verplaatsen naar een ander
        // project. Bedoeld voor weekstaten die onder "Nog toe te wijzen" (of een
        // verkeerd project) zijn opgeslagen doordat de gebruiker nog geen
        // projecttoewijzing had. Alleen voor concept-weekstaten · verstuurde
        // eerst terugzetten naar concept (↩️) zodat PDF/handtekening niet
        // uit de pas lopen.
        function adminMoveWeekstaat(userId, projectId, weekNumber, year, userName, projCode) {
            const projects = (window._adminProjects || [])
                .filter(p => (p.is_test !== true))
                .filter(p => p.status === 'active' && p.id !== projectId)
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            if (projects.length === 0) { showToast('⚠️ Geen andere actieve projecten om naartoe te verplaatsen'); return; }

            const options = projects.map(p =>
                `<option value="${p.id}">${escapeHtml(p.project_code || '')} | ${escapeHtml(p.name || '')}</option>`
            ).join('');
            const fields = `
                <div style="margin-bottom:14px;padding:12px;background:var(--app-info-soft);border-radius:8px;font-size:0.85rem">
                    <div><strong>Medewerker:</strong> ${escapeHtml(userName)}</div>
                    <div><strong>Week:</strong> ${weekNumber} / ${year}</div>
                    <div><strong>Nu onder:</strong> ${escapeHtml(projCode)}</div>
                </div>
                <div class="form-group" style="margin-bottom:12px">
                    <label>Verplaats naar project</label>
                    <select id="move-ws-target">${options}</select>
                </div>
                <div style="font-size:0.75rem;color:var(--muted);line-height:1.5">
                    Verplaatst de uren, de weekstatus en eventuele declaraties van deze week in één keer.
                    Tarieven van het doelproject gaan daarna gelden voor deze weekstaat.
                </div>`;

            const modal = document.getElementById('admin-modal');
            const titleEl = document.getElementById('admin-modal-title');
            const fieldsEl = document.getElementById('admin-modal-fields');
            const saveBtn = document.getElementById('admin-modal-save');
            const delBtn = document.getElementById('admin-modal-delete');
            if (!modal || !titleEl || !fieldsEl) { showToast('⚠️ Modal niet beschikbaar'); return; }
            titleEl.textContent = 'Weekstaat verplaatsen';
            fieldsEl.innerHTML = fields;
            if (delBtn) delBtn.style.display = 'none';
            if (saveBtn) {
                saveBtn.style.display = 'inline-flex';
                saveBtn.textContent = 'Verplaatsen';
                saveBtn.onclick = () => _adminMoveWeekstaatExec(userId, projectId, weekNumber, year);
            }
            modal.classList.add('active');
        }

        async function _adminMoveWeekstaatExec(userId, oldProjectId, weekNumber, year) {
            const sb = getSupabase();
            if (!sb) { showToast('⚠️ Niet verbonden'); return; }
            const targetSel = document.getElementById('move-ws-target');
            const newProjectId = targetSel ? targetSel.value : '';
            if (!newProjectId) { showToast('⚠️ Kies een doelproject'); return; }

            // Weekstaten zonder project hebben project_id = NULL. Via de onclick
            // wordt dat de string 'null' · Postgres wil dan IS NULL i.p.v. = 'null'.
            // Deze helper zet op elke query het juiste project-filter.
            const oudIsNull = (oldProjectId == null || oldProjectId === 'null' || oldProjectId === '' || oldProjectId === 'undefined');
            const filterOudProject = (q) => oudIsNull ? q.is('project_id', null) : q.eq('project_id', oldProjectId);

            const saveBtn = document.getElementById('admin-modal-save');
            if (saveBtn) { if (saveBtn.disabled) return; saveBtn.disabled = true; saveBtn.textContent = 'Bezig...'; }
            try {
                // Conflict-check: bestaat er al een weekstaat voor (user, doelproject, week)?
                const { data: conflict } = await sb.from('week_status').select('status')
                    .eq('user_id', userId).eq('project_id', newProjectId)
                    .eq('week_number', weekNumber).eq('year', year).maybeSingle();
                if (conflict) {
                    showToast('⚠️ Er bestaat al een weekstaat voor deze week op het doelproject (' + conflict.status + ')');
                    return;
                }

                // Weekbereik bepalen voor de time_entries (die zijn per datum, niet per week)
                const monday = getWeekMondayFromWeekNumber(year, weekNumber);
                const sunday = new Date(monday);
                sunday.setDate(sunday.getDate() + 6);
                const mondayStr = toLocalDateStr(monday);
                const sundayStr = toLocalDateStr(sunday);

                // 1. Uren
                const { error: teErr } = await filterOudProject(sb.from('time_entries')
                    .update({ project_id: newProjectId })
                    .eq('user_id', userId))
                    .gte('entry_date', mondayStr).lte('entry_date', sundayStr);
                if (teErr) throw new Error('uren: ' + teErr.message);

                // 2. Weekstatus
                const { error: wsErr } = await filterOudProject(sb.from('week_status')
                    .update({ project_id: newProjectId })
                    .eq('user_id', userId))
                    .eq('week_number', weekNumber).eq('year', year);
                if (wsErr) throw new Error('weekstatus: ' + wsErr.message);

                // 3. Declaraties (niet fataal als de tabel ontbreekt)
                try {
                    await filterOudProject(sb.from('expenses')
                        .update({ project_id: newProjectId })
                        .eq('user_id', userId))
                        .eq('week_number', weekNumber).eq('year', year);
                } catch (expErr) { console.warn('Declaraties verplaatsen overgeslagen:', expErr); }

                showToast('✓ Weekstaat verplaatst naar het gekozen project');
                closeModal('admin-modal');
                loadWeekstaten();
            } catch (err) {
                showToast('❌ Verplaatsen mislukt: ' + err.message);
            } finally {
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Opslaan'; }
            }
        }

        async function adminResetWeekstaat(userId, projectId, weekNumber, year, userName, projCode) {
            if (!await confirmAsync(`Weekstaat terugzetten naar concept?\n\n${userName} · Week ${weekNumber} · ${year} · ${projCode}\n\nDe status wordt teruggezet naar 'opgeslagen' en de oude PDF wordt verwijderd uit storage. De ingevulde uren blijven behouden. Je kunt daarna opnieuw ondertekenen & versturen.`, true)) return;
            const sb = getSupabase();
            if (!sb) { showToast('⚠️ Niet verbonden'); return; }
            try {
                // 1. Reset week_status naar opgeslagen
                const { error } = await sb.from('week_status')
                    .update({
                        status: 'opgeslagen',
                        approval_status: null,
                        approval_token: null,
                        approval_completed_at: null,
                        approver_name: null,
                        approver_email: null,
                        client_signature_url: null,
                        approval_comments: null,
                        signed_at: null,
                        submitted_at: null
                    })
                    .eq('user_id', userId)
                    .eq('project_id', projectId)
                    .eq('week_number', weekNumber)
                    .eq('year', year);
                if (error) throw error;

                // 2. Verwijder oude PDF uit storage
                try {
                    const folderPath = `${year}/week-${weekNumber}`;
                    const { data: files } = await sb.storage.from('weekstaten').list(folderPath, { limit: 50 });
                    const userSlug = userName.replace(/\s+/g, '_');
                    const match = (files || []).find(f => f.name.includes(projCode) || f.name.includes(userSlug));
                    if (match) {
                        await sb.storage.from('weekstaten').remove([`${folderPath}/${match.name}`]);
                        console.log('Oude PDF verwijderd:', match.name);
                    }
                } catch (storageErr) { console.warn('Storage cleanup overgeslagen:', storageErr); }

                showToast('✅ Weekstaat teruggezet naar concept · klaar om opnieuw te ondertekenen');
                loadWeekstaten();
            } catch (e) {
                showToast('❌ Fout: ' + e.message);
            }
        }

        // ===== USER ARCHIVE / ANONYMIZE =====
        // 2 paden, elk AVG-conform:
        //   1. adminArchiveUser   · soft archive (data blijft 7j voor Belastingdienst)
        //   2. adminAnonymizeUser · na 7j archief: PII verwijderen, IDs blijven
        // (adminDeleteUser, de test-only hard delete, is 2026-07-03 verwijderd
        //  samen met de test-modus)

        async function adminArchiveUser(userId, userName) {
            // Vraag reden · optioneel
            const reason = await promptAsync(
                `Gebruiker "${userName}" archiveren?`,
                'Reden van archivering (optioneel · bv. "Contract beeindigd 31-12-2025")',
                ''
            );
            // promptAsync retourneert null bij cancel; lege string mag wel
            if (reason === null) return;

            const sb = getSupabase();
            if (!sb) { showToast('⚠️ Niet verbonden'); return; }
            try {
                const { error } = await sb.from('users')
                    .update({
                        archived_at: new Date().toISOString(),
                        archive_reason: reason || null
                    })
                    .eq('id', userId);
                if (error) throw error;
                showToast('📦 Gebruiker gearchiveerd · data blijft 7 jaar bewaard');
                loadAdminData('gebruikers');
            } catch (err) {
                console.error('Archive user error:', err);
                showToast('❌ Archiveren mislukt: ' + err.message);
            }
        }

        async function adminUnarchiveUser(userId, userName) {
            const ok = await confirmAsync(`Gebruiker "${userName}" uit archief halen en weer activeren?`);
            if (!ok) return;
            const sb = getSupabase();
            if (!sb) { showToast('⚠️ Niet verbonden'); return; }
            try {
                const { error } = await sb.from('users')
                    .update({ archived_at: null, archive_reason: null })
                    .eq('id', userId);
                if (error) throw error;
                showToast('↩️ Gebruiker is weer actief');
                loadAdminData('gebruikers');
            } catch (err) {
                console.error('Unarchive user error:', err);
                showToast('❌ Activeren mislukt: ' + err.message);
            }
        }

        // ===== PAUZE-FLOW (tijdelijk login blokkeren, reversibel) =====
        // Verschilt van archiveren (=afsluiten met AVG-retentie): pauze blijft
        // staan zolang nodig, geen 7-jaar-eis; bij activeren is alles weer normaal.
        async function adminPauseUser(userId, userName) {
            const reason = await promptAsync(
                `Gebruiker "${userName}" pauzeren?`,
                'Reden van pauzering (optioneel · bv. "Tijdelijk uit dienst tot 1 september")',
                ''
            );
            if (reason === null) return;
            const sb = getSupabase();
            if (!sb) { showToast('⚠️ Niet verbonden'); return; }
            try {
                const { error } = await sb.from('users')
                    .update({
                        paused_at: new Date().toISOString(),
                        pause_reason: reason || null
                    })
                    .eq('id', userId);
                if (error) throw error;
                showToast('⏸️ Gebruiker gepauzeerd · kan niet meer inloggen');
                loadAdminData('gebruikers');
            } catch (err) {
                console.error('Pause user error:', err);
                showToast('❌ Pauzeren mislukt: ' + err.message);
            }
        }

        async function adminUnpauseUser(userId, userName) {
            const ok = await confirmAsync(`Pauze opheffen voor "${userName}"? Gebruiker kan dan weer inloggen.`);
            if (!ok) return;
            const sb = getSupabase();
            if (!sb) { showToast('⚠️ Niet verbonden'); return; }
            try {
                const { error } = await sb.from('users')
                    .update({ paused_at: null, pause_reason: null })
                    .eq('id', userId);
                if (error) throw error;
                showToast('▶️ Gebruiker is weer actief');
                loadAdminData('gebruikers');
            } catch (err) {
                console.error('Unpause user error:', err);
                showToast('❌ Activeren mislukt: ' + err.message);
            }
        }

        async function adminAnonymizeUser(userId, userName) {
            const ok = await confirmAsync(
                `PII verwijderen van "${userName}"?\n\n` +
                `Naam, e-mail, telefoon, adres, KvK, BTW en IBAN worden gewist.\n` +
                `De gebruiker-ID blijft bestaan zodat fiscale referenties\n` +
                `(facturen, inkooporders, weekstaten) traceerbaar blijven.\n\n` +
                `Deze actie is niet ongedaan te maken.`,
                true
            );
            if (!ok) return;
            const sb = getSupabase();
            if (!sb) { showToast('⚠️ Niet verbonden'); return; }
            try {
                // Anonimiseer-naam: deterministisch op basis van eerste 8 chars van UUID
                const shortId = String(userId).slice(0, 8);
                const { error } = await sb.from('users')
                    .update({
                        name: 'Geanonimiseerd-' + shortId,
                        email: shortId + '@anonymized.kts.local',
                        phone: null,
                        address: null,
                        postcode: null,
                        city: null,
                        kvk_number: null,
                        btw_number: null,
                        iban: null,
                        anonymized_at: new Date().toISOString()
                    })
                    .eq('id', userId);
                if (error) throw error;
                showToast('🕶️ Persoonsgegevens gewist · historische data blijft via ID traceerbaar');
                loadAdminData('gebruikers');
            } catch (err) {
                console.error('Anonymize user error:', err);
                showToast('❌ Anonymiseren mislukt: ' + err.message);
            }
        }

        async function adminDeleteWeekstaat(userId, projectId, weekNumber, year, userName, projCode) {
            if (!await confirmAsync(`Weekstaat verwijderen?\n\n${userName} · Week ${weekNumber} · ${year} · ${projCode}\n\nDit verwijdert de weekstatus, time entries en eventuele inkooporder-koppelingen voor deze week.`, true)) return;
            const sb = getSupabase();
            if (!sb) { showToast('⚠️ Niet verbonden'); return; }
            try {
                // 1. Verwijder week_status
                await sb.from('week_status')
                    .delete()
                    .eq('user_id', userId)
                    .eq('project_id', projectId)
                    .eq('week_number', weekNumber)
                    .eq('year', year);

                // 2. Verwijder time_entries voor deze week
                const monday = getWeekMondayFromWeekNumber(year, weekNumber);
                const sunday = new Date(monday);
                sunday.setDate(sunday.getDate() + 6);
                const weekStart = toLocalDateStr(monday);
                const weekEnd = toLocalDateStr(sunday);
                await sb.from('time_entries')
                    .delete()
                    .eq('user_id', userId)
                    .eq('project_id', projectId)
                    .gte('entry_date', weekStart)
                    .lte('entry_date', weekEnd);

                // 3. Verwijder inkooporder_weeks voor deze week
                await sb.from('inkooporder_weeks')
                    .delete()
                    .eq('user_id', userId)
                    .eq('project_id', projectId)
                    .eq('week_number', weekNumber)
                    .eq('year', year);

                showToast('🗑️ Weekstaat verwijderd');
                loadWeekstaten();
            } catch (e) {
                showToast('❌ Fout: ' + e.message);
            }
        }

        // Admin opent een lege weekstaat voor een gekozen medewerker + project + week.
        // Hergebruikt adminEditWeekEntries (die toont lege rijen als er geen time_entries
        // bestaan, en adminSaveWeekEntries inserteert ze). Daarna kan admin via de ✍️
        // knop in de concept-lijst ondertekenen + versturen namens de medewerker.
        async function adminNewWeekstaat() {
            const sb = getSupabase();
            if (!sb) { showToast('⚠️ Niet verbonden'); return; }

            // Filter users op test/productie en archief
            const users = (typeof getFilteredUsers === 'function' ? getFilteredUsers() : (window._adminUsers || []))
                .filter(u => u.role !== 'admin');
            const projects = (window._adminProjects || []).filter(p => {
                const matchTest = p.is_test !== true;
                return matchTest && p.status === 'active';
            });

            if (users.length === 0) { showToast('⚠️ Geen medewerkers gevonden'); return; }
            if (projects.length === 0) { showToast('⚠️ Geen actieve projecten gevonden'); return; }

            const today = new Date();
            const isoWeekToday = (typeof getISOWeek === 'function') ? getISOWeek(today) : Math.ceil((today - new Date(today.getFullYear(),0,1)) / 86400000 / 7);
            const yearToday = today.getFullYear();

            const modal = document.getElementById('admin-modal');
            document.getElementById('admin-modal-title').textContent = '✍️ Nieuwe weekstaat invullen';
            document.getElementById('admin-modal-fields').innerHTML = `
                <div style="display:flex;flex-direction:column;gap:10px">
                    <div>
                        <label style="display:block;font-size:0.75rem;color:var(--muted);margin-bottom:4px;font-weight:600">MEDEWERKER</label>
                        <select id="anw-user" style="width:100%;padding:10px;border:2px solid var(--app-line);border-radius:8px;font-size:0.9rem">
                            ${users.map(u => `<option value="${u.id}">${escapeHtml(u.name || u.email)}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="display:block;font-size:0.75rem;color:var(--muted);margin-bottom:4px;font-weight:600">PROJECT</label>
                        <select id="anw-project" style="width:100%;padding:10px;border:2px solid var(--app-line);border-radius:8px;font-size:0.9rem">
                            ${projects.map(p => `<option value="${p.id}">${escapeHtml(p.project_code)} | ${escapeHtml(p.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                        <div>
                            <label style="display:block;font-size:0.75rem;color:var(--muted);margin-bottom:4px;font-weight:600">WEEK</label>
                            <input type="number" id="anw-week" min="1" max="53" value="${isoWeekToday}" style="width:100%;padding:10px;border:2px solid var(--app-line);border-radius:8px;font-size:0.9rem;box-sizing:border-box">
                        </div>
                        <div>
                            <label style="display:block;font-size:0.75rem;color:var(--muted);margin-bottom:4px;font-weight:600">JAAR</label>
                            <input type="number" id="anw-year" min="2024" max="2030" value="${yearToday}" style="width:100%;padding:10px;border:2px solid var(--app-line);border-radius:8px;font-size:0.9rem;box-sizing:border-box">
                        </div>
                    </div>
                    <div style="font-size:0.8rem;color:var(--muted);margin-top:4px;padding:10px;background:var(--app-bg-deep);border-radius:8px;line-height:1.4">
                        💡 Na opslaan verschijnt deze in <strong>Concept weekstaten</strong>. Klik daar op ✍️ om te ondertekenen &amp; versturen namens de medewerker.
                    </div>
                </div>`;
            const saveBtn = document.getElementById('admin-modal-save');
            saveBtn.style.display = '';
            saveBtn.textContent = 'Open uren-invoer →';
            saveBtn.onclick = () => {
                const userId = document.getElementById('anw-user').value;
                const projectId = document.getElementById('anw-project').value;
                const weekNumber = parseInt(document.getElementById('anw-week').value) || isoWeekToday;
                const year = parseInt(document.getElementById('anw-year').value) || yearToday;
                if (!userId || !projectId) { showToast('⚠️ Kies medewerker en project'); return; }
                const userName = users.find(u => u.id === userId)?.name || users.find(u => u.id === userId)?.email || 'Medewerker';
                // adminEditWeekEntries opent direct de uren-invoer modal (vervangt deze)
                adminEditWeekEntries(userId, projectId, weekNumber, year, userName);
            };
            const delBtn = document.getElementById('admin-modal-delete');
            if (delBtn) delBtn.style.display = 'none';
            modal.classList.add('active');
        }

        async function adminEditWeekEntries(userId, projectId, weekNumber, year, userName) {
            const sb = getSupabase();
            if (!sb) return;
            const monday = getWeekMondayFromWeekNumber(year, weekNumber);
            const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);
            const weekStart = toLocalDateStr(monday);
            const weekEnd = toLocalDateStr(sunday);

            // Haal target user op om allow_km / allow_hotel / km_single_trip te kennen.
            // Default if user not found: kolommen verbergen (veiligste).
            const targetUserData = (window._adminUsers || []).find(u => u.id === userId)
                || (await sb.from('users').select('*').eq('id', userId).single()).data
                || {};
            const showKm = targetUserData.allow_km !== false;
            const showHotel = targetUserData.allow_hotel === true;
            const kmEnkel = parseFloat(targetUserData.km_single_trip) || 0;
            const kmRetour = kmEnkel * 2;

            // Haal default-locatie en omschrijving op via project (als die ingesteld zijn)
            const targetProjectData = (window._adminProjects || []).find(p => p.id === projectId) || {};
            const defaultLocation = targetProjectData.default_location || '';
            const defaultDescription = targetProjectData.default_description || '';

            const { data: entries } = await sb.from('time_entries').select('*')
                .eq('user_id', userId).eq('project_id', projectId)
                .gte('entry_date', weekStart).lte('entry_date', weekEnd)
                .order('entry_date');

            const hasExistingEntries = (entries || []).length > 0;
            const dagNamenLang = ['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag'];
            const maandenKort = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
            const modal = document.getElementById('admin-modal');
            document.getElementById('admin-modal-title').textContent = `✏️ ${userName} · Week ${weekNumber}/${year}`;

            // 4-koloms grid: Start, Eind, Uren, Pauze. De dag-titel staat als
            // aparte regel boven elke rij zodat de tijd-velden voldoende ruimte
            // krijgen om 'HH:MM' volledig te tonen op smalle telefoons.
            const gridCols = 'minmax(0, 1fr) minmax(0, 1fr) 64px 64px';
            const headerCenter = 'text-align:center';
            const headerLabels = `<span style="${headerCenter}">Start</span><span style="${headerCenter}">Eind</span><span style="${headerCenter}">Uren</span><span style="${headerCenter}">Pauze</span>`;

            let rows = '';
            for (let d = 0; d < 7; d++) {
                const date = new Date(monday);
                date.setDate(date.getDate() + d);
                const dateStr = toLocalDateStr(date);
                const entry = (entries || []).find(e => e.entry_date === dateStr) || {};
                const id = entry.id || '';

                // Pre-fill voor lege weken bij ma-vr (d 0-4): standaard 07:00-16:00, 60 min
                // pauze, 8 uur, km × 2, default location/description. Alleen als er nog GEEN
                // entries bestaan in de hele week (anders bestaande situatie respecteren).
                const isWeekday = d <= 4;
                const isEmpty = !entry.id;
                const usePrefill = !hasExistingEntries && isEmpty && isWeekday;

                const startVal = (entry.start_time && String(entry.start_time).slice(0,5)) || (usePrefill ? '07:00' : '');
                const endVal   = (entry.end_time && String(entry.end_time).slice(0,5))   || (usePrefill ? '16:00' : '');
                const hoursVal = entry.total_hours != null ? entry.total_hours : (usePrefill ? '8' : '');
                const breakVal = entry.break_minutes != null ? entry.break_minutes : (usePrefill ? 60 : 0);
                const descVal  = entry.description || (usePrefill ? defaultDescription : '');
                const locVal   = entry.location || (usePrefill ? defaultLocation : '');
                const kmVal    = entry.km != null ? entry.km : (usePrefill && showKm ? kmRetour : '');
                const hotelVal = entry.hotel === true;

                // Km en hotel verhuizen naar een aparte "extras"-rij onder de hoofdrij —
                // anders past de hoofdrij niet meer op smalle telefoons. Daar staan ze
                // naast elkaar samen met de actie-knoppen (Standaard / Niet gewerkt).
                const kmExtra = showKm
                    ? `<label style="display:inline-flex;align-items:center;gap:6px;font-size:0.8rem;color:var(--app-ink-500)">
                        <span style="font-weight:600">🚗 Km</span>
                        <input type="number" step="1" min="0" class="aew-km" value="${kmVal}" placeholder="0" style="padding:5px 6px;border:1px solid var(--app-line-strong);border-radius:6px;font-size:0.85rem;text-align:right;width:84px;box-sizing:border-box;background:var(--app-surface);color:var(--app-ink-900)" title="Kilometers (heen + terug)">
                       </label>`
                    : '';
                const hotelExtra = showHotel
                    ? `<label style="display:inline-flex;align-items:center;gap:4px;font-size:0.8rem;color:var(--app-ink-500);cursor:pointer;user-select:none">
                        <input type="checkbox" class="aew-hotel" ${hotelVal ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--kts-accent-light)"> 🏨 Hotelovernachting
                       </label>`
                    : '';

                // Defaults voor de "🕒 Standaard"-knop. Worden via data-attributes
                // op de row gezet zodat adminFillDefaultDay() ze inline kan toepassen
                // zonder de project/user-data opnieuw op te halen.
                const dKmDefault = showKm ? kmRetour : 0;
                const rowBg = d >= 5 ? 'var(--app-warn-soft)' : 'var(--app-surface)';
                const rowBorder = d >= 5 ? 'var(--app-warn-line)' : 'var(--app-line)';
                const inputStyle = 'border:1px solid var(--app-line-strong);background:var(--app-surface);color:var(--app-ink-900)';
                const dagTitelKleur = d >= 5 ? 'var(--app-warn)' : 'var(--app-ink-900)';
                const dagTitel = `${dagNamenLang[d]} ${date.getDate()} ${maandenKort[date.getMonth()]}`;
                rows += `<div class="aew-row" style="background:${rowBg};border:1px solid ${rowBorder};border-radius:10px;padding:10px 12px;margin-bottom:8px;position:relative;overflow:hidden"
                    data-entry-id="${id}" data-date="${dateStr}" data-user="${userId}" data-project="${projectId}" data-day-idx="${d}"
                    data-default-start="07:00" data-default-end="16:00" data-default-hours="8" data-default-break="60"
                    data-default-km="${dKmDefault}" data-default-loc="${escapeHtml(defaultLocation)}" data-default-desc="${escapeHtml(defaultDescription)}">
                    <div style="font-weight:700;font-size:0.9rem;color:${dagTitelKleur};letter-spacing:-0.005em;margin-bottom:8px">${dagTitel}</div>
                    <div style="display:grid;grid-template-columns:${gridCols};gap:8px;align-items:center;font-size:0.85rem">
                        <input type="time" class="aew-start" value="${startVal}" oninput="adminRecalcDayHours(this)" style="padding:6px 4px;${inputStyle};border-radius:6px;font-size:0.85rem;width:100%;box-sizing:border-box">
                        <input type="time" class="aew-end" value="${endVal}" oninput="adminRecalcDayHours(this)" style="padding:6px 4px;${inputStyle};border-radius:6px;font-size:0.85rem;width:100%;box-sizing:border-box">
                        <input type="number" step="0.25" class="aew-hours" value="${hoursVal}" placeholder="0" style="padding:6px 2px;${inputStyle};border-radius:6px;font-size:0.85rem;text-align:center;width:100%;box-sizing:border-box" title="Wordt automatisch berekend uit start/eind − pauze. Handmatig overschrijven mag.">
                        <input type="number" step="5" min="0" max="120" class="aew-break" value="${breakVal}" placeholder="0" oninput="adminRecalcDayHours(this)" style="padding:6px 2px;${inputStyle};border-radius:6px;font-size:0.85rem;text-align:center;width:100%;box-sizing:border-box" title="Pauze in minuten">
                    </div>
                    <input type="text" class="aew-loc" value="${escapeHtml(locVal)}" placeholder="Locatie" style="margin-top:6px;padding:6px 8px;${inputStyle};border-radius:6px;font-size:0.85rem;width:100%;box-sizing:border-box">
                    <input type="text" class="aew-desc" value="${escapeHtml(descVal)}" placeholder="Werkzaamheden" style="margin-top:6px;padding:6px 8px;${inputStyle};border-radius:6px;font-size:0.85rem;width:100%;box-sizing:border-box">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap">
                        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
                            ${kmExtra}
                            ${hotelExtra}
                        </div>
                        <div style="display:flex;gap:6px;flex-wrap:wrap">
                            <button type="button" class="aew-default-btn" onclick="adminFillDefaultDay(this)" style="padding:5px 12px;font-size:0.72rem;background:var(--app-info-soft);color:var(--app-info);border:1px solid var(--app-info-line);border-radius:6px;cursor:pointer;font-weight:600;letter-spacing:0.02em;transition:transform 200ms ease,box-shadow 200ms ease" title="Standaard tijden (07:00-16:00, 8u, 60 min) invullen">🕒 Standaard</button>
                            <button type="button" class="aew-clear-btn" onclick="adminClearDayRow(this)" style="padding:5px 12px;font-size:0.72rem;background:var(--app-warn-soft);color:var(--app-warn);border:1px solid var(--app-warn-line);border-radius:6px;cursor:pointer;font-weight:600;letter-spacing:0.02em;transition:transform 200ms ease,box-shadow 200ms ease">🚫 Niet gewerkt</button>
                        </div>
                    </div>
                </div>`;
            }
            // Bestaande expenses voor deze week ophalen · als de tabel nog niet bestaat
            // (migratie niet uitgevoerd), val terug op een lege lijst zonder error.
            let existingExpenses = [];
            try {
                let { data: expData, error: expErr } = await sb.from('expenses')
                    .select('id, cat, amount, description, entry_date, quantity, unit_price')
                    .eq('user_id', userId)
                    .eq('project_id', projectId)
                    .eq('week_number', weekNumber)
                    .eq('year', year)
                    .order('created_at', { ascending: true });
                // Fallback voor DB zonder quantity/unit_price kolommen
                if (expErr && /quantity|unit_price/.test(expErr.message || '')) {
                    ({ data: expData, error: expErr } = await sb.from('expenses')
                        .select('id, cat, amount, description, entry_date')
                        .eq('user_id', userId)
                        .eq('project_id', projectId)
                        .eq('week_number', weekNumber)
                        .eq('year', year)
                        .order('created_at', { ascending: true }));
                }
                if (!expErr && expData) existingExpenses = expData;
            } catch (e) { /* expenses tabel bestaat nog niet · fallback */ }

            // Categorie-labels (matching gewone zzp-flow). Volgorde = UI dropdown:
            // meest voorkomend eerst, "Overig" als laatste.
            const expCatLabels = {
                transport:    'Transport',
                parkeren:     'Parkeren',
                maaltijd:     'Maaltijd',
                materiaal:    'Materiaal',
                huur:         'Huur',
                tolheffing:   'Tolheffingen',
                veerboot:     'Veerboot',
                doorbelasting:'Doorbelasting',
                other:        'Overig'
            };
            // Backwards-compat: oude rijen met cat='meals' tonen we als 'maaltijd' in
            // de UI maar laten we ongemoeid in de DB tot ze worden bewerkt.
            const expCatLabelDisplay = (cat) => expCatLabels[cat] || (cat === 'meals' ? 'Maaltijd' : 'Overig');
            const expCatOptions = Object.entries(expCatLabels)
                .map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

            // HTML voor expenses-sectie. Elke bestaande rij krijgt z'n DB-id zodat we
            // bij save kunnen update'n (i.p.v. delete+insert).
            // Token-based styling — werkt in light en dark mode
            const expInputStyle = 'padding:5px;border:1px solid var(--app-line-strong);background:var(--app-surface);color:var(--app-ink-900);border-radius:5px;font-size:0.8rem';
            const expensesHtml = `
                <div id="aew-expenses-section" style="margin-top:14px;padding:12px;border:1px solid var(--app-line);border-radius:10px;background:var(--app-bg-tint)">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                        <div style="font-weight:700;font-size:0.85rem;color:var(--kts-accent-light);letter-spacing:0.04em;text-transform:uppercase">💶 Extra kosten</div>
                        <button type="button" onclick="adminAddExpenseRow(this)" class="btn btn-sm" style="padding:4px 12px;font-size:0.72rem;background:var(--app-ok-soft);color:var(--app-ok);border:1px solid var(--app-ok-line);border-radius:6px;font-weight:600;letter-spacing:0.02em">+ Toevoegen</button>
                    </div>
                    <div id="aew-expenses-list" style="display:flex;flex-direction:column;gap:8px">
                        ${existingExpenses.map(e => {
                            // Backwards-compat: oude rijen kunnen 'meals' hebben · map naar 'maaltijd'
                            const eCat = e.cat === 'meals' ? 'maaltijd' : e.cat;
                            return `
                            <div class="aew-exp-row" data-exp-id="${e.id}" style="display:flex;flex-direction:column;gap:6px;padding:8px;background:var(--app-surface);border:1px solid var(--app-line);border-radius:8px">
                                <div style="display:grid;grid-template-columns:1fr 24px;gap:6px;align-items:center">
                                    <select class="aew-exp-cat" style="${expInputStyle}">
                                        ${Object.entries(expCatLabels).map(([k, v]) => `<option value="${k}" ${eCat === k ? 'selected' : ''}>${v}</option>`).join('')}
                                    </select>
                                    <button type="button" onclick="adminRemoveExpenseRow(this)" style="background:var(--app-alert-soft);color:var(--app-alert);border:1px solid var(--app-alert-line);border-radius:4px;padding:0;width:24px;height:24px;cursor:pointer;font-size:0.8rem" title="Verwijderen">×</button>
                                </div>
                                <input type="text" class="aew-exp-desc" value="${escapeHtml(e.description || '')}" placeholder="Omschrijving (bv. 7 stuks afblindpluggen)" style="${expInputStyle};padding:5px 8px">
                                <div style="display:grid;grid-template-columns:60px 80px 1fr 90px;gap:6px;align-items:center">
                                    <input type="number" step="1" min="0" class="aew-exp-qty" value="${e.quantity || ''}" placeholder="Aantal" oninput="adminRecalcExpRow(this)" style="${expInputStyle};text-align:right" title="Aantal stuks (optioneel)">
                                    <input type="number" step="0.01" min="0" class="aew-exp-unit" value="${e.unit_price || ''}" placeholder="€/stuk" oninput="adminRecalcExpRow(this)" style="${expInputStyle};text-align:right" title="Prijs per stuk (optioneel)">
                                    <span style="font-size:0.7rem;color:var(--app-ink-500);text-align:right;padding-right:4px">Totaal €</span>
                                    <input type="number" step="0.01" min="0" class="aew-exp-amount" value="${e.amount || ''}" placeholder="0,00" style="${expInputStyle};text-align:right;font-weight:600">
                                </div>
                            </div>
                        `;
                        }).join('')}
                    </div>
                    <div id="aew-expenses-empty" style="display:${existingExpenses.length === 0 ? 'block' : 'none'};text-align:center;padding:10px;color:var(--app-ink-500);font-size:0.78rem">Geen extra kosten · klik "+ Toevoegen" voor parkeerkaart, brandstof, etc.</div>
                </div>`;

            document.getElementById('admin-modal-fields').innerHTML = `
                <div style="display:grid;grid-template-columns:${gridCols};gap:8px;margin-bottom:8px;padding:8px 11px 0 11px;font-size:0.75rem;color:var(--muted);font-weight:600">
                    ${headerLabels}
                </div>
                ${rows}
                ${expensesHtml}
            `;
            // Cache categorie-labels op modal voor adminAddExpenseRow helper
            document.getElementById('aew-expenses-section').dataset.catOptions = expCatOptions;

            const saveBtn = document.getElementById('admin-modal-save');
            saveBtn.style.display = '';
            saveBtn.textContent = 'Wijzigingen opslaan';
            saveBtn.onclick = () => adminSaveWeekEntries(userId, projectId, weekNumber, year);
            const delBtn = document.getElementById('admin-modal-delete');
            if (delBtn) delBtn.style.display = 'none';
            // Modal blijft default 480px breed · km en hotel staan nu op een aparte
            // rij onderin zodat de hoofdrij (5 kolommen) ook op smalle schermen past.
            modal.classList.add('active');
        }

        // Helper: voeg een lege expense-rij toe aan de admin-modal
        function adminAddExpenseRow(btn) {
            const section = document.getElementById('aew-expenses-section');
            const list = document.getElementById('aew-expenses-list');
            const empty = document.getElementById('aew-expenses-empty');
            if (!list) return;
            const catOptionsHtml = section.dataset.catOptions || '<option value="other">Overig</option>';
            const row = document.createElement('div');
            row.className = 'aew-exp-row';
            // Geen data-exp-id → wordt nieuwe insert bij save
            row.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:8px;background:var(--app-surface);border:1px solid var(--app-line);border-radius:8px';
            const expInputStyle = 'padding:5px;border:1px solid var(--app-line-strong);background:var(--app-surface);color:var(--app-ink-900);border-radius:5px;font-size:0.8rem';
            row.innerHTML = `
                <div style="display:grid;grid-template-columns:1fr 24px;gap:6px;align-items:center">
                    <select class="aew-exp-cat" style="${expInputStyle}">${catOptionsHtml}</select>
                    <button type="button" onclick="adminRemoveExpenseRow(this)" style="background:var(--app-alert-soft);color:var(--app-alert);border:1px solid var(--app-alert-line);border-radius:4px;padding:0;width:24px;height:24px;cursor:pointer;font-size:0.8rem" title="Verwijderen">×</button>
                </div>
                <input type="text" class="aew-exp-desc" placeholder="Omschrijving (bv. 7 stuks afblindpluggen)" style="${expInputStyle};padding:5px 8px">
                <div style="display:grid;grid-template-columns:60px 80px 1fr 90px;gap:6px;align-items:center">
                    <input type="number" step="1" min="0" class="aew-exp-qty" placeholder="Aantal" oninput="adminRecalcExpRow(this)" style="${expInputStyle};text-align:right" title="Aantal stuks (optioneel)">
                    <input type="number" step="0.01" min="0" class="aew-exp-unit" placeholder="€/stuk" oninput="adminRecalcExpRow(this)" style="${expInputStyle};text-align:right" title="Prijs per stuk (optioneel)">
                    <span style="font-size:0.7rem;color:var(--app-ink-500);text-align:right;padding-right:4px">Totaal €</span>
                    <input type="number" step="0.01" min="0" class="aew-exp-amount" placeholder="0,00" style="${expInputStyle};text-align:right;font-weight:600">
                </div>
            `;
            list.appendChild(row);
            if (empty) empty.style.display = 'none';
            // Focus op de omschrijving zodat user direct kan typen wat het is
            const descInput = row.querySelector('input.aew-exp-desc');
            if (descInput) descInput.focus();
        }

        // Auto-bereken uren in een dag-rij op basis van start/eind − pauze.
        // Wordt aangeroepen bij oninput van .aew-start, .aew-end en .aew-break.
        // Logica matcht defaultWeekData() in de zzp-flow:
        //   werkMin = (eind - start)
        //   effectiveBreak = min(pauze, werkMin)  // pauze nooit groter dan werktijd
        //   hours = (werkMin - effectiveBreak) / 60
        function adminRecalcDayHours(input) {
            const row = input && input.closest('.aew-row');
            if (!row) return;
            const startEl = row.querySelector('.aew-start');
            const endEl   = row.querySelector('.aew-end');
            const breakEl = row.querySelector('.aew-break');
            const hoursEl = row.querySelector('.aew-hours');
            if (!startEl || !endEl || !hoursEl) return;
            const start = startEl.value;
            const end = endEl.value;
            // Geen tijden gevuld → niet auto-overwriten (gebruiker kan handmatig uren typen)
            if (!start || !end) return;
            const [sh, sm] = start.split(':').map(Number);
            const [eh, em] = end.split(':').map(Number);
            if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return;
            const werkMin = Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
            const breakMin = parseInt(breakEl?.value, 10) || 0;
            const effectiveBreak = Math.min(breakMin, werkMin);
            const hours = Math.max(0, (werkMin - effectiveBreak) / 60);
            // Schoon getal: hele uren zonder decimalen, anders 2 decimalen
            hoursEl.value = (hours % 1 === 0) ? hours.toString() : hours.toFixed(2);
        }

        // Auto-bereken totaal als zowel aantal als prijs/stuk zijn ingevuld.
        // Wordt aangeroepen bij oninput van qty en unit-price velden.
        function adminRecalcExpRow(input) {
            const row = input && input.closest('.aew-exp-row');
            if (!row) return;
            const qty = parseFloat(row.querySelector('.aew-exp-qty')?.value) || 0;
            const unit = parseFloat(row.querySelector('.aew-exp-unit')?.value) || 0;
            const amountEl = row.querySelector('.aew-exp-amount');
            // Alleen overschrijven als beide gevuld · gebruiker kan altijd handmatig
            // het totaal blijven aanpassen als hij geen unit-price heeft.
            if (qty > 0 && unit > 0 && amountEl) {
                amountEl.value = (qty * unit).toFixed(2);
            }
        }

        // Helper: verwijder een expense-rij. Als de rij een DB-id heeft markeren we
        // hem als "te verwijderen" · adminSaveWeekEntries handelt het echte delete af.
        function adminRemoveExpenseRow(btn) {
            const row = btn && btn.closest('.aew-exp-row');
            if (!row) return;
            const expId = row.dataset.expId;
            if (expId) {
                // Bestaande rij · markeer voor delete bij save (visueel verbergen)
                row.dataset.markedForDelete = 'true';
                row.style.display = 'none';
            } else {
                // Nieuwe rij · direct uit de DOM
                row.remove();
            }
            // Update lege-lijst hint
            const visible = document.querySelectorAll('#aew-expenses-list .aew-exp-row:not([data-marked-for-delete="true"])').length;
            const empty = document.getElementById('aew-expenses-empty');
            if (empty) empty.style.display = visible === 0 ? 'block' : 'none';
        }

        // "Standaard"-knop voor één dag: vult start, eind, uren, pauze, km en
        // optioneel locatie/werkzaamheden in op basis van de defaults uit data-attributes.
        // Handig om snel een dag toe te voegen die niet in de standaard pre-fill zat
        // (bv. zaterdag overwerk, of een eerder geleegde dag).
        function adminFillDefaultDay(btn) {
            const row = btn && btn.closest('.aew-row');
            if (!row) return;
            const d = row.dataset;
            const startEl = row.querySelector('.aew-start');
            const endEl   = row.querySelector('.aew-end');
            const hoursEl = row.querySelector('.aew-hours');
            const breakEl = row.querySelector('.aew-break');
            const kmEl    = row.querySelector('.aew-km');
            const locEl   = row.querySelector('.aew-loc');
            const descEl  = row.querySelector('.aew-desc');
            if (startEl) startEl.value = d.defaultStart || '07:00';
            if (endEl)   endEl.value   = d.defaultEnd   || '16:00';
            if (hoursEl) hoursEl.value = d.defaultHours || '8';
            if (breakEl) breakEl.value = d.defaultBreak || '60';
            if (kmEl && d.defaultKm)   kmEl.value = d.defaultKm;
            // Locatie en werkzaamheden alleen vullen als nog leeg · anders overschrijven
            // we een handmatig al ingevulde tekst.
            if (locEl  && !locEl.value.trim()  && d.defaultLoc)  locEl.value  = d.defaultLoc;
            if (descEl && !descEl.value.trim() && d.defaultDesc) descEl.value = d.defaultDesc;
            // Visuele feedback: rij weer volledig zichtbaar
            row.style.opacity = '1';
        }

        // "Niet gewerkt"-knop voor één dag in de admin-modal: leeg alle invoer-velden
        // van die dagrij zodat hij overslaan wordt bij opslaan. Wordt aangeroepen vanuit
        // onclick · pakt de dichtstbijzijnde .aew-row en cleart alle inputs binnen.
        function adminClearDayRow(btn) {
            const row = btn && btn.closest('.aew-row');
            if (!row) return;
            const startEl = row.querySelector('.aew-start');
            const endEl   = row.querySelector('.aew-end');
            const hoursEl = row.querySelector('.aew-hours');
            const breakEl = row.querySelector('.aew-break');
            const kmEl    = row.querySelector('.aew-km');
            const hotelEl = row.querySelector('.aew-hotel');
            const locEl   = row.querySelector('.aew-loc');
            const descEl  = row.querySelector('.aew-desc');
            if (startEl) startEl.value = '';
            if (endEl)   endEl.value = '';
            if (hoursEl) hoursEl.value = '';
            if (breakEl) breakEl.value = 0;
            if (kmEl)    kmEl.value = '';
            if (hotelEl) hotelEl.checked = false;
            if (locEl)   locEl.value = '';
            if (descEl)  descEl.value = '';
            // Markeer expliciet als 'te verwijderen' bij save — voorkomt dat een
            // bestaande DB-entry blijft staan als de save-detectie via empty-fields
            // niet klopt. Plus visuele feedback (opacity).
            row.dataset.cleared = 'true';
            row.style.opacity = '0.55';
        }

        // Wrapper met dubbel-klik bescherming: de save doet tientallen await-calls
        // (per dag + expenses) · een tweede klik tijdens het opslaan zou dubbele
        // inserts geven. Knop uit + in-flight flag tot de inner klaar is.
        let _adminSaveWeekBusy = false;
        async function adminSaveWeekEntries(userId, projectId, weekNumber, year) {
            if (_adminSaveWeekBusy) return;
            _adminSaveWeekBusy = true;
            const _saveBtn = document.getElementById('admin-modal-save');
            if (_saveBtn) { _saveBtn.disabled = true; _saveBtn.textContent = 'Bezig...'; }
            try {
                await _adminSaveWeekEntriesInner(userId, projectId, weekNumber, year);
            } finally {
                _adminSaveWeekBusy = false;
                if (_saveBtn) {
                    _saveBtn.disabled = false;
                    // Bij early-return (bv. 0 uren) heeft de inner het label niet
                    // teruggezet · herstel dan zelf
                    if (_saveBtn.textContent === 'Bezig...') _saveBtn.textContent = 'Opslaan';
                }
            }
        }

        async function _adminSaveWeekEntriesInner(userId, projectId, weekNumber, year) {
            const sb = getSupabase();
            if (!sb) return;
            const rows = document.querySelectorAll('#admin-modal-fields [data-date]');

            // Validatie vooraf: tel uren over alle rijen. Bij 0 uren weigeren we op te
            // slaan i.p.v. een misleidende "✓ opgeslagen" toast te tonen.
            let plannedTotal = 0;
            for (const row of rows) {
                const h = parseFloat(row.querySelector('.aew-hours').value) || 0;
                const desc = row.querySelector('.aew-desc').value.trim();
                if (h > 0 || desc) plannedTotal += h;
            }
            if (plannedTotal === 0) {
                showToast('⚠️ Geen uren ingevoerd · niks opgeslagen');
                return;
            }

            let saved = 0, errors = 0;
            let totalHours = 0;
            for (const row of rows) {
                const entryId = row.dataset.entryId;
                const dateStr = row.dataset.date;
                const cleared = row.dataset.cleared === 'true';
                const start = row.querySelector('.aew-start').value || null;
                const end = row.querySelector('.aew-end').value || null;
                const hours = parseFloat(row.querySelector('.aew-hours').value) || 0;
                const breakMin = parseInt(row.querySelector('.aew-break').value) || 0;
                const desc = row.querySelector('.aew-desc').value.trim();
                // Optionele velden · alleen meeschrijven als de input bestaat (= rechten op user)
                const locInput = row.querySelector('.aew-loc');
                const kmInput = row.querySelector('.aew-km');
                const hotelInput = row.querySelector('.aew-hotel');
                const loc = locInput ? locInput.value.trim() : '';
                const km = kmInput ? (parseFloat(kmInput.value) || 0) : 0;
                const hotel = hotelInput ? !!hotelInput.checked : false;

                // EXPLICIET GEWIST via 'Niet gewerkt'-knop: bestaande entry hard verwijderen,
                // ongeacht of hours/desc per ongeluk nog iets bevatten.
                if (cleared) {
                    if (entryId) {
                        const { error: delErr } = await sb.from('time_entries').delete().eq('id', entryId);
                        if (delErr) { errors++; console.error('Delete cleared entry mislukt:', delErr); }
                        else saved++;
                    }
                    continue; // skip de save-branch
                }

                if (hours > 0 || desc) {
                    totalHours += hours;
                    const data = {
                        user_id: userId,
                        project_id: projectId,
                        entry_date: dateStr,
                        start_time: start,
                        end_time: end,
                        total_hours: hours,
                        break_minutes: breakMin,
                        description: desc,
                        location: loc || null,
                        km: km,
                        hotel: hotel
                    };
                    let result;
                    if (entryId) {
                        // UPDATE: alleen de form-velden meesturen · thuiswerk/day_off/
                        // km_heen/km_terug NIET meesturen zodat door de medewerker
                        // gezette waarden niet overschreven worden.
                        result = await sb.from('time_entries').update(data).eq('id', entryId);
                    } else {
                        // INSERT: status meegeven zoals de medewerker-flow dat ook doet
                        result = await sb.from('time_entries').insert({ ...data, status: 'draft' });
                    }
                    if (result.error) { errors++; console.error(result.error); }
                    else saved++;
                } else if (entryId && hours === 0 && !desc) {
                    // Verwijder lege entry (fallback voor handmatig wissen)
                    const { error: delErr } = await sb.from('time_entries').delete().eq('id', entryId);
                    if (delErr) { errors++; console.error('Delete empty entry mislukt:', delErr); }
                    else saved++;
                }
            }

            // Zorg dat er een week_status record bestaat met status='opgeslagen' zodat
            // de weekstaat in de Concept-lijst verschijnt en met de ✍️ knop ondertekend
            // kan worden namens de medewerker. Tegelijk last_modified_at + by zetten
            // zodat we maar één DB-call nodig hebben voor zowel status als modified-info.
            try {
                const { data: { user: authUser } = { user: null } } = await sb.auth.getUser();
                const adminId = authUser ? authUser.id : null;
                const { data: existing } = await sb.from('week_status').select('status')
                    .eq('user_id', userId).eq('project_id', projectId)
                    .eq('week_number', weekNumber).eq('year', year).maybeSingle();

                const baseRecord = {
                    user_id: userId,
                    project_id: projectId,
                    week_number: weekNumber,
                    year: year,
                    updated_at: new Date().toISOString()
                };
                // Probeer met last_modified velden · fallback voor oude DB
                const recordWithModified = {
                    ...baseRecord,
                    last_modified_at: new Date().toISOString(),
                    last_modified_by: adminId
                };

                let upsertRecord;
                if (!existing || existing.status === 'concept') {
                    // Status mag opgeslagen worden · voeg toe aan record
                    upsertRecord = { ...recordWithModified, status: 'opgeslagen' };
                } else {
                    // Status NIET wijzigen (al verstuurd) · alleen modified-velden updaten
                    upsertRecord = recordWithModified;
                }

                let { error: wsErr } = await sb.from('week_status').upsert(upsertRecord,
                    { onConflict: 'user_id,project_id,week_number,year' });
                // Fallback: als last_modified kolommen niet bestaan
                if (wsErr && /last_modified/.test(wsErr.message || '')) {
                    console.warn('⚠️ week_status last_modified kolommen niet aanwezig · voer migratie-weekstaat-last-modified.sql uit');
                    const fallback = { ...upsertRecord };
                    delete fallback.last_modified_at;
                    delete fallback.last_modified_by;
                    ({ error: wsErr } = await sb.from('week_status').upsert(fallback,
                        { onConflict: 'user_id,project_id,week_number,year' }));
                }
                if (wsErr) console.warn('week_status upsert mislukt:', wsErr.message);
            } catch (statusErr) {
                console.warn('week_status upsert mislukt (niet fataal):', statusErr.message || statusErr);
            }

            // Expenses opslaan: nieuwe inserts, updates op bestaande, deletes voor marked
            let expensesError = null;
            let expensesCount = 0;
            try {
                const expRows = document.querySelectorAll('#aew-expenses-list .aew-exp-row');
                const toDelete = [];
                const toInsert = [];
                const toUpdate = [];
                // Auth-user vooraf ophalen · gebruikt voor created_by op insert-rijen
                let authUid = null;
                try {
                    const { data: authData } = await sb.auth.getUser();
                    authUid = authData && authData.user ? authData.user.id : null;
                } catch (e) { /* anonieme client · created_by leeg */ }

                expRows.forEach(row => {
                    const expId = row.dataset.expId || null;
                    const marked = row.dataset.markedForDelete === 'true';
                    if (marked && expId) { toDelete.push(expId); return; }
                    if (marked) return; // nieuwe rij die meteen verwijderd is · skip
                    const cat = row.querySelector('.aew-exp-cat')?.value || 'other';
                    const amount = parseFloat(row.querySelector('.aew-exp-amount')?.value || '0');
                    const desc = (row.querySelector('.aew-exp-desc')?.value || '').trim();
                    const qtyVal = row.querySelector('.aew-exp-qty')?.value;
                    const unitVal = row.querySelector('.aew-exp-unit')?.value;
                    const quantity = qtyVal ? parseFloat(qtyVal) : null;
                    const unitPrice = unitVal ? parseFloat(unitVal) : null;
                    if (!amount || amount <= 0) return; // skip lege rijen (geen bedrag)
                    const record = {
                        user_id: userId, project_id: projectId,
                        week_number: weekNumber, year: year,
                        cat: cat, amount: amount, description: desc || null,
                        quantity: (quantity && quantity > 0) ? quantity : null,
                        unit_price: (unitPrice && unitPrice > 0) ? unitPrice : null
                    };
                    if (expId) {
                        record.id = expId;
                        toUpdate.push(record);
                    } else {
                        if (authUid) record.created_by = authUid;
                        toInsert.push(record);
                    }
                });

                // Apart: deletes
                if (toDelete.length > 0) {
                    const { error: delErr } = await sb.from('expenses').delete().in('id', toDelete);
                    if (delErr) {
                        expensesError = 'Verwijderen mislukt: ' + delErr.message;
                        console.error('expenses delete mislukt:', delErr);
                    }
                }
                // Apart: inserts (geen onConflict · laat Supabase een nieuwe id genereren)
                if (toInsert.length > 0 && !expensesError) {
                    let { error: insErr } = await sb.from('expenses').insert(toInsert);
                    // Fallback: DB heeft nog geen quantity/unit_price kolommen · strip die en retry
                    if (insErr && /quantity|unit_price/.test(insErr.message || '')) {
                        console.warn('quantity/unit_price kolommen niet aanwezig · fallback. Voer migratie-expenses-quantity.sql uit.');
                        const stripped = toInsert.map(r => { const c = {...r}; delete c.quantity; delete c.unit_price; return c; });
                        ({ error: insErr } = await sb.from('expenses').insert(stripped));
                    }
                    if (insErr) {
                        if (/relation.*expenses.*does not exist/i.test(insErr.message || '')) {
                            expensesError = 'Tabel "expenses" bestaat niet · voer migratie-expenses.sql uit';
                        } else if (/row-level security|policy/i.test(insErr.message || '')) {
                            expensesError = 'RLS-policy blokkeert insert · voer migratie-expenses-rls-fix.sql uit';
                        } else {
                            expensesError = 'Insert mislukt: ' + insErr.message;
                        }
                        console.error('expenses insert mislukt:', insErr);
                    } else {
                        expensesCount += toInsert.length;
                    }
                }
                // Apart: updates per record (zodat RLS per rij geëvalueerd wordt)
                if (toUpdate.length > 0 && !expensesError) {
                    for (const rec of toUpdate) {
                        const { id, ...rest } = rec;
                        let { error: updErr } = await sb.from('expenses').update(rest).eq('id', id);
                        if (updErr && /quantity|unit_price/.test(updErr.message || '')) {
                            console.warn('quantity/unit_price kolommen niet aanwezig · fallback.');
                            const stripped = {...rest}; delete stripped.quantity; delete stripped.unit_price;
                            ({ error: updErr } = await sb.from('expenses').update(stripped).eq('id', id));
                        }
                        if (updErr) {
                            if (/row-level security|policy/i.test(updErr.message || '')) {
                                expensesError = 'RLS-policy blokkeert update · voer migratie-expenses-rls-fix.sql uit';
                            } else {
                                expensesError = 'Update mislukt: ' + updErr.message;
                            }
                            console.error('expenses update mislukt:', updErr);
                            break;
                        }
                        expensesCount++;
                    }
                }
            } catch (expSaveErr) {
                expensesError = 'Onverwachte fout: ' + (expSaveErr.message || expSaveErr);
                console.error('Expenses opslaan exception:', expSaveErr);
            }

            // Als de weekstaat al ondertekend/goedgekeurd was: terug naar concept.
            // Reden: na deze save zijn de uren/extra kosten gewijzigd, dus de oude PDF/handtekening
            // is verouderd. Beter expliciet resetten dan een onsync ondertekende staat houden.
            const invalidated = await invalidateApprovalOnChange(userId, projectId, weekNumber, year);

            // Toast: combineer dag-save resultaat + eventuele expense-fout + invalidation
            if (expensesError) {
                showToast(`⚠️ ${saved} dagen opgeslagen · extra kosten faalden: ${expensesError}`);
            } else if (errors) {
                showToast(`⚠️ ${saved} opgeslagen, ${errors} fouten`);
            } else {
                const expSuffix = expensesCount > 0 ? ` + ${expensesCount} extra kost${expensesCount === 1 ? '' : 'en'}` : '';
                const tail = invalidated
                    ? ' · teruggezet naar Concept (opnieuw ondertekenen nodig)'
                    : ' · staat klaar in Concept om te ondertekenen';
                showToast(`✓ ${saved} dagen opgeslagen${expSuffix}${tail}`);
            }
            // closeModal i.p.v. directe classList · die verwijdert ook modal-wide cleanup
            closeModal('admin-modal');
            document.getElementById('admin-modal-save').textContent = 'Opslaan';
            // Lijst verversen zodat de nieuwe concept-weekstaat zichtbaar wordt
            if (typeof loadWeekstaten === 'function') loadWeekstaten();
        }

        // Helper: maandag berekenen vanuit jaar + weeknummer (ISO)
        function getWeekMondayFromWeekNumber(year, week) {
            const jan4 = new Date(year, 0, 4);
            const dayOfWeek = jan4.getDay() || 7;
            const monday = new Date(jan4);
            monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
            return monday;
        }

        // ===== ADMIN: ONDERTEKENEN NAMENS GEBRUIKER =====
        async function adminSignForUser(userId, projectId, weekNumber, year) {
            const sb = getSupabase();
            if (!sb) { showToast('⚠️ Niet verbonden'); return; }

            // Zoek user en project data op
            const targetUser = (window._adminUsers || []).find(u => u.id === userId);
            const targetProject = (window._adminProjects || []).find(p => p.id === projectId);
            if (!targetUser) { showToast('❌ Gebruiker niet gevonden'); return; }
            if (!targetProject) { showToast('❌ Project niet gevonden'); return; }

            // Resolve zzp company name uit window._adminCompanies (al geladen voor admin)
            // Wordt op currentUser._zzpCompanyName gezet zodat de weekstaat-PDF
            // "BV | Naam" kan tonen.
            if (targetUser.company_id && !targetUser._zzpCompanyName) {
                const zzpComp = (window._adminCompanies || []).find(c => c.id === targetUser.company_id);
                if (zzpComp && zzpComp.name) targetUser._zzpCompanyName = zzpComp.name;
                else {
                    try {
                        const { data: zc } = await sb.from('companies').select('name').eq('id', targetUser.company_id).maybeSingle();
                        if (zc && zc.name) targetUser._zzpCompanyName = zc.name;
                    } catch (e) { /* niet kritisch */ }
                }
            }

            const userName = targetUser.name || targetUser.email || 'Onbekend';
            if (!await confirmAsync(`Weekstaat ondertekenen & versturen namens ${userName}?\n\nWeek ${weekNumber} · ${year} · ${targetProject.project_code}`)) return;

            try {
                showToast('⏳ Weekdata laden...');

                // Laad time entries voor deze week
                const monday = getWeekMondayFromWeekNumber(year, weekNumber);
                const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);
                const weekStart = toLocalDateStr(monday);
                const weekEnd = toLocalDateStr(sunday);

                const { data: entries } = await sb.from('time_entries').select('*')
                    .eq('user_id', userId).eq('project_id', projectId)
                    .gte('entry_date', weekStart).lte('entry_date', weekEnd)
                    .order('entry_date');

                // Bouw weekData array op (7 dagen, ma-zo)
                const targetWeekData = [];
                for (let d = 0; d < 7; d++) {
                    const date = new Date(monday);
                    date.setDate(date.getDate() + d);
                    const dateStr = toLocalDateStr(date);
                    const entry = (entries || []).find(e => e.entry_date === dateStr);
                    targetWeekData.push({
                        // Postgres time-kolom geeft 'HH:MM:SS' terug · slice naar 'HH:MM'
                        start: entry && entry.start_time ? String(entry.start_time).slice(0, 5) : '',
                        end:   entry && entry.end_time   ? String(entry.end_time).slice(0, 5)   : '',
                        breakMin: entry ? (entry.break_minutes || 0) : 0,
                        hours: entry ? (entry.total_hours || 0) : 0,
                        desc: entry ? (entry.description || '') : '',
                        location: entry ? (entry.location || '') : '',
                        km: entry ? (entry.km || 0) : 0,
                        kmHeen: entry ? (entry.km_heen || 0) : 0,
                        kmTerug: entry ? (entry.km_terug || 0) : 0,
                        hotel: entry ? (entry.hotel || false) : false,
                        thuiswerk: entry ? (entry.location === 'Thuis') : false
                    });
                }

                const totalHours = targetWeekData.reduce((s, e) => s + e.hours, 0);
                if (totalHours === 0) { showToast('⚠️ Geen uren gevonden voor deze week'); return; }

                // Bewaar huidige globals
                _adminSignOverride = {
                    originalUser: currentUser,
                    originalProject: currentProject,
                    originalWeekData: weekData,
                    originalWeekNumber: currentWeekNumber,
                    originalYear: currentYear,
                    originalWeekDbStatus: currentWeekDbStatus,
                    originalWeekSummary: weekSummary,
                    originalExpEntries: typeof expEntries !== 'undefined' ? expEntries : []
                };

                // Expenses voor deze week ophalen · worden in expEntries gezet zodat de
                // weekstaat-PDF generator (die expEntries leest in regel ~7333) ze meeneemt.
                let weekExpenses = [];
                try {
                    let { data: exps, error: expSelErr } = await sb.from('expenses')
                        .select('cat, amount, description, entry_date, quantity, unit_price')
                        .eq('user_id', userId).eq('project_id', projectId)
                        .eq('week_number', weekNumber).eq('year', year);
                    if (expSelErr && /quantity|unit_price/.test(expSelErr.message || '')) {
                        ({ data: exps } = await sb.from('expenses')
                            .select('cat, amount, description, entry_date')
                            .eq('user_id', userId).eq('project_id', projectId)
                            .eq('week_number', weekNumber).eq('year', year));
                    }
                    weekExpenses = exps || [];
                } catch (e) { /* tabel bestaat nog niet · fallback */ }

                const expCatLabelsLocal = {
                    transport: 'Transport', parkeren: 'Parkeren',
                    maaltijd: 'Maaltijd', meals: 'Maaltijd',  // backwards-compat
                    materiaal: 'Materiaal',
                    huur: 'Huur', tolheffing: 'Tolheffingen',
                    veerboot: 'Veerboot', doorbelasting: 'Doorbelasting',
                    other: 'Overig'
                };
                if (typeof expEntries !== 'undefined' && Array.isArray(expEntries)) {
                    // Globale array · vervang voor de PDF-generatie tijdens deze flow
                    expEntries.length = 0;
                    weekExpenses.forEach((e, i) => {
                        // Beschrijving voor PDF: "7× Afblindplug á €15" als aantal+prijs zijn,
                        // anders gewoon de description
                        let desc = e.description || '';
                        if (e.quantity && e.unit_price) {
                            const qtyStr = Number(e.quantity) % 1 === 0 ? Number(e.quantity).toString() : Number(e.quantity).toFixed(2);
                            const unitStr = '€' + Number(e.unit_price).toFixed(2).replace('.', ',');
                            const prefix = `${qtyStr}× `;
                            const suffix = ` á ${unitStr}`;
                            // Voorkom dubbele "7×" als gebruiker dat al in de desc had
                            if (!desc.includes('×') && !desc.toLowerCase().startsWith(qtyStr + ' ')) {
                                desc = prefix + desc + suffix;
                            }
                        }
                        expEntries.push({
                            id: 'admin-' + i,
                            cat: e.cat || 'other',
                            catLabel: expCatLabelsLocal[e.cat] || 'Overig',
                            desc: desc,
                            amount: parseFloat(e.amount) || 0,
                            date: e.entry_date || '',
                            quantity: e.quantity || null,
                            unit_price: e.unit_price || null
                        });
                    });
                }

                // Swap globals naar target user
                currentUser = targetUser;
                currentProject = targetProject;
                weekData = targetWeekData;
                currentWeekNumber = weekNumber;
                currentYear = year;
                currentWeekDbStatus = 'opgeslagen';
                weekSummary = null;

                // Open signature modal (skip de checks die openSignatureModal doet)
                signatureData = { zzp: null, client: null };
                const clientToggle = document.getElementById('sig-client-toggle');
                if (clientToggle) clientToggle.checked = false;
                const clientSection = document.getElementById('sig-client-section');
                if (clientSection) clientSection.style.display = 'none';
                document.getElementById('signature-modal').classList.add('active');
                setTimeout(() => {
                    initSignatureCanvas('zzp');
                    updateSignatureUI();
                }, 100);

            } catch (err) {
                showToast('❌ Fout: ' + err.message);
                console.error('adminSignForUser error:', err);
                restoreAdminSignOverride();
            }
        }

        function restoreAdminSignOverride() {
            if (!_adminSignOverride) return;
            currentUser = _adminSignOverride.originalUser;
            currentProject = _adminSignOverride.originalProject;
            weekData = _adminSignOverride.originalWeekData;
            currentWeekNumber = _adminSignOverride.originalWeekNumber;
            currentYear = _adminSignOverride.originalYear;
            currentWeekDbStatus = _adminSignOverride.originalWeekDbStatus;
            weekSummary = _adminSignOverride.originalWeekSummary;
            // Reset expEntries naar admin's eigen lijstje (was tijdelijk vervangen
            // door target user's expenses voor de PDF-generatie)
            if (typeof expEntries !== 'undefined' && Array.isArray(expEntries) && _adminSignOverride.originalExpEntries) {
                expEntries.length = 0;
                _adminSignOverride.originalExpEntries.forEach(e => expEntries.push(e));
            }
            _adminSignOverride = null;
        }

        function copyApprovalLink(token) {
            const url = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1) + 'approve-weekstaat.html?token=' + token;
            navigator.clipboard.writeText(url).then(() => showToast('✓ Link gekopieerd'));
        }

        async function downloadWeekstaatBySearch(year, week, projCode, userSlug, userId, projectId) {
            const sb = getSupabase();
            if (!sb) return;
            try {
                const folderPath = `${year}/week-${week}`;
                const { data: files } = await sb.storage.from('weekstaten').list(folderPath, { limit: 50 });
                const match = (files || []).find(f => f.name.includes(projCode) && f.name.includes(userSlug))
                    || (files || []).find(f => f.name.includes(userSlug));
                if (match) {
                    downloadWeekstaatFromStorage(`${folderPath}/${match.name}`);
                } else if (userId && projectId) {
                    // PDF niet in storage · regenereer on-the-fly
                    showToast('⏳ PDF niet in storage, wordt opnieuw gegenereerd...');
                    await regenerateWeekstaatPdf(userId, projectId, parseInt(week), parseInt(year), projCode, userSlug);
                } else {
                    showToast('⚠️ PDF niet gevonden in storage');
                }
            } catch (err) {
                showToast('❌ Download mislukt: ' + err.message);
            }
        }

        async function regenerateWeekstaatPdf(userId, projectId, weekNumber, year, projCode, userSlug, options) {
            options = options || {};
            const clearSignatures = !!options.clearSignatures;
            const skipDownload = !!options.skipDownload;
            const sb = getSupabase();
            if (!sb) return;
            try {
                const targetUser = (window._adminUsers || []).find(u => u.id === userId);
                const targetProject = (window._adminProjects || []).find(p => p.id === projectId);
                if (!targetUser) { showToast('❌ Gebruiker niet gevonden'); return; }
                if (!targetProject) { showToast('❌ Project niet gevonden'); return; }

                // Laad time entries voor deze week
                const monday = getWeekMondayFromWeekNumber(year, weekNumber);
                const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);
                const weekStart = toLocalDateStr(monday);
                const weekEnd = toLocalDateStr(sunday);

                const { data: entries } = await sb.from('time_entries').select('*')
                    .eq('user_id', userId).eq('project_id', projectId)
                    .gte('entry_date', weekStart).lte('entry_date', weekEnd)
                    .order('entry_date');

                // Bouw weekData array
                const targetWeekData = [];
                for (let d = 0; d < 7; d++) {
                    const date = new Date(monday);
                    date.setDate(date.getDate() + d);
                    const dateStr = toLocalDateStr(date);
                    const entry = (entries || []).find(e => e.entry_date === dateStr);
                    targetWeekData.push({
                        // Postgres time-kolom geeft 'HH:MM:SS' terug · slice naar 'HH:MM'
                        start: entry && entry.start_time ? String(entry.start_time).slice(0, 5) : '',
                        end:   entry && entry.end_time   ? String(entry.end_time).slice(0, 5)   : '',
                        breakMin: entry ? (entry.break_minutes || 0) : 0,
                        hours: entry ? (entry.total_hours || 0) : 0,
                        desc: entry ? (entry.description || '') : '',
                        location: entry ? (entry.location || '') : '',
                        km: entry ? (entry.km || 0) : 0,
                        kmHeen: entry ? (entry.km_heen || 0) : 0,
                        kmTerug: entry ? (entry.km_terug || 0) : 0,
                        hotel: entry ? (entry.hotel || false) : false,
                        thuiswerk: entry ? (entry.location === 'Thuis') : false
                    });
                }

                const totalHours = targetWeekData.reduce((s, e) => s + e.hours, 0);
                if (totalHours === 0) { showToast('⚠️ Geen uren gevonden voor deze week'); return; }

                // Bewaar huidige globals & swap naar target
                const backup = {
                    user: currentUser, project: currentProject, weekData: weekData,
                    weekNumber: currentWeekNumber, year: currentYear,
                    weekDbStatus: currentWeekDbStatus, weekSummary: weekSummary,
                    sigZzp: signatureData ? signatureData.zzp : null,
                    sigClient: signatureData ? signatureData.client : null
                };

                currentUser = targetUser;
                currentProject = targetProject;
                weekData = targetWeekData;
                currentWeekNumber = weekNumber;
                currentYear = year;
                currentWeekDbStatus = 'verstuurd';
                weekSummary = null;
                // Bij clearSignatures: handtekening-velden leeg maken zodat de PDF
                // geen handtekeningen toont (bv. bij admin-goedkeuring zonder dat
                // de zzp of opdrachtgever formeel hebben getekend)
                if (clearSignatures && signatureData) {
                    signatureData.zzp = null;
                    signatureData.client = null;
                }

                try {
                    // Wacht op jsPDF
                    if (!window.jspdf) {
                        for (let w = 0; w < 10; w++) { await new Promise(r => setTimeout(r, 500)); if (window.jspdf) break; }
                    }

                    // Laad expenses voor deze week uit DB → expEntries
                    await loadExpEntriesForWeek(sb, userId, projectId, weekNumber, year);

                    const weekstaat = await generateWeekstaat();
                    if (!weekstaat) throw new Error('PDF generatie mislukt');

                    const userName = targetUser.name || 'Onbekend';
                    const pCode = targetProject.project_code || projCode;
                    const fileName = ktsWeekstaatName(year, weekNumber, userName, pCode);

                    // Download lokaal · alleen als niet skipDownload
                    if (!skipDownload) weekstaat.save(fileName);

                    // Upload naar storage voor volgende keer (overschrijft bestaande)
                    try {
                        const pdfBase64 = weekstaat.output('datauristring').split(',')[1];
                        const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
                        const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
                        const storagePath = `${year}/week-${weekNumber}/${fileName}`;
                        await sb.storage.from('weekstaten').upload(storagePath, pdfBlob, { upsert: true, contentType: 'application/pdf' });
                    } catch(e) { console.warn('Storage backup overgeslagen:', e); }

                    if (!skipDownload) showToast('✅ PDF opnieuw gegenereerd & gedownload');
                } finally {
                    // Herstel globals
                    currentUser = backup.user;
                    currentProject = backup.project;
                    weekData = backup.weekData;
                    currentWeekNumber = backup.weekNumber;
                    currentYear = backup.year;
                    currentWeekDbStatus = backup.weekDbStatus;
                    weekSummary = backup.weekSummary;
                    if (signatureData) {
                        signatureData.zzp = backup.sigZzp;
                        signatureData.client = backup.sigClient;
                    }
                }
            } catch (err) {
                showToast('❌ Regeneratie mislukt: ' + err.message);
                console.error('regenerateWeekstaatPdf error:', err);
            }
        }

        function openApprovalModal(userId, projectId, weekNumber, year) {
            // Zoek project + klant info
            const project = (window._adminProjects || []).find(p => p.id === projectId);
            const user = (window._adminUsers || []).find(u => u.id === userId);
            const userName = user ? (user.name || user.email) : 'Onbekend';
            const projCode = project ? project.project_code : '?';
            const projName = project ? project.name : '';

            // Client info uit project → company (gebruik contacten met receives_weekstaat)
            let clientEmail = '';
            let clientName = '';
            if (project && project.client_company_id) {
                const company = typeof project.client_company_id === 'object' ? project.client_company_id : null;
                if (company) {
                    clientEmail = getContactEmailsByRole(company, 'receives_weekstaat');
                    clientName = getContactNameByRole(company, 'receives_weekstaat') || company.name || '';
                }
            }

            const companyId = (project && project.client_company_id) ? (typeof project.client_company_id === 'object' ? project.client_company_id.id : project.client_company_id) : '';

            const content = `
                <div style="margin-bottom:16px;padding:12px;background:var(--app-info-soft);border-radius:8px;font-size:0.85rem">
                    <div><strong>Medewerker:</strong> ${escapeHtml(userName)}</div>
                    <div><strong>Project:</strong> ${escapeHtml(projCode)} · ${escapeHtml(projName)}</div>
                    <div><strong>Week:</strong> ${weekNumber} / ${year}</div>
                </div>
                <div class="form-group" style="margin-bottom:12px">
                    <label>E-mail opdrachtgever</label>
                    <input type="email" id="approval-email" placeholder="bijv. info@kenphelan.nl" value="${escapeHtml(clientEmail)}" style="width:100%;padding:10px;border:2px solid var(--app-line);border-radius:8px;font-size:0.85rem">
                </div>
                <div class="form-group" style="margin-bottom:12px">
                    <label>Naam opdrachtgever</label>
                    <input type="text" id="approval-name" placeholder="bijv. Marcel Virtmann" value="${escapeHtml(clientName)}" style="width:100%;padding:10px;border:2px solid var(--app-line);border-radius:8px;font-size:0.85rem">
                </div>
                <label style="display:flex;align-items:center;gap:8px;margin-bottom:16px;font-size:0.8rem;color:var(--muted);cursor:pointer">
                    <input type="checkbox" id="approval-save-default" checked style="width:16px;height:16px;accent-color:var(--kts-blue)">
                    Wijzigingen opslaan als standaard contactgegevens
                </label>
                <button onclick="sendApprovalRequest('${userId}','${projectId}',${weekNumber},${year},'${companyId}')" class="btn btn-primary" style="width:100%;padding:12px;font-size:0.9rem">📩 Verstuur ter goedkeuring</button>
            `;

            // Hergebruik de admin modal
            const modal = document.getElementById('admin-modal');
            const titleEl = document.getElementById('admin-modal-title');
            const fieldsEl = document.getElementById('admin-modal-fields');
            const saveBtn = document.getElementById('admin-modal-save');
            if (modal && titleEl && fieldsEl) {
                titleEl.textContent = 'Weekstaat ter goedkeuring';
                fieldsEl.innerHTML = content;
                if (saveBtn) saveBtn.style.display = 'none';
                const delBtn = document.getElementById('admin-modal-delete');
                if (delBtn) delBtn.style.display = 'none';
                modal.classList.add('active');
            }
        }

        async function sendApprovalRequest(userId, projectId, weekNumber, year, companyId) {
            const email = document.getElementById('approval-email').value.trim();
            const name = document.getElementById('approval-name').value.trim();
            const saveDefault = document.getElementById('approval-save-default')?.checked;
            if (!email) { showToast('⚠️ Vul een e-mailadres in'); return; }

            const sb = getSupabase();
            if (!sb) return;

            // Dubbel-klik bescherming · tweede klik zou een tweede goedkeurings-
            // mail sturen en de approval-token overschrijven
            const _apprBtn = document.querySelector('#admin-modal-fields [onclick^="sendApprovalRequest"]');
            if (_apprBtn) {
                if (_apprBtn.disabled) return;
                _apprBtn.disabled = true;
                _apprBtn.textContent = '⏳ Bezig met versturen...';
            }

            try {
                // Contactgegevens opslaan als standaard indien gewenst
                if (saveDefault && companyId) {
                    try {
                        const { data: compData } = await sb.from('companies').select('contacts').eq('id', companyId).single();
                        let contacts = compData?.contacts || [];
                        if (typeof contacts === 'string') { try { contacts = JSON.parse(contacts); } catch(e) { contacts = []; } }

                        // Zoek bestaand contact met receives_weekstaat
                        const existingIdx = contacts.findIndex(c => c.receives_weekstaat);
                        if (existingIdx >= 0) {
                            contacts[existingIdx].email = email;
                            contacts[existingIdx].name = name;
                        } else {
                            // Voeg nieuw contact toe
                            contacts.push({ name, email, role: 'Opdrachtgever', receives_weekstaat: true, receives_factuur: false, receives_io: false });
                        }

                        await sb.from('companies').update({ contacts }).eq('id', companyId);
                    } catch (saveErr) {
                        console.warn('Contactgegevens opslaan mislukt:', saveErr);
                    }
                }

                // Genereer uniek token
                const token = crypto.randomUUID();

                // Upsert week_status met approval info (maakt record aan als het niet bestaat)
                let upsertData = {
                    user_id: userId,
                    project_id: projectId,
                    week_number: parseInt(weekNumber),
                    year: parseInt(year),
                    status: 'verstuurd',
                };

                // Probeer eerst met approval kolommen
                let { error: updateErr } = await sb.from('week_status')
                    .upsert({
                        ...upsertData,
                        approval_token: token,
                        approval_status: 'ter_goedkeuring',
                        approval_requested_at: new Date().toISOString(),
                        approval_expires_at: (() => {
                            // 3 werkdagen vanaf nu
                            const exp = new Date();
                            let days = 0;
                            while (days < 3) {
                                exp.setDate(exp.getDate() + 1);
                                if (exp.getDay() !== 0 && exp.getDay() !== 6) days++;
                            }
                            return exp.toISOString();
                        })(),
                        approver_email: email,
                        approver_name: name
                    }, { onConflict: 'user_id,project_id,week_number,year' });

                // Fallback: als approval kolommen niet bestaan, alleen status updaten
                if (updateErr) {
                    console.warn('Approval kolommen mogelijk niet aanwezig, fallback:', updateErr.message);
                    ({ error: updateErr } = await sb.from('week_status')
                        .upsert(upsertData, { onConflict: 'user_id,project_id,week_number,year' }));
                }

                if (updateErr) {
                    console.warn('week_status upsert mislukt:', updateErr.message);
                    // Niet fataal · ga door met e-mail versturen
                }

                // Weekstaat details ophalen voor e-mail
                const user = (window._adminUsers || []).find(u => u.id === userId);
                const project = (window._adminProjects || []).find(p => p.id === projectId);
                const userName = user ? (user.name || user.email) : 'Medewerker';
                const projCode = project ? project.project_code : '';
                const projName = project ? project.name : '';

                // Verstuur e-mail via Edge Function
                const approvalUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1) + 'approve-weekstaat.html?token=' + token;

                // Probeer Edge Function, altijd fallback naar mailto
                let edgeFunctionOk = false;
                try {
                    const { data: fnData, error: fnErr } = await sb.functions.invoke('send-approval-request', {
                        body: {
                            token, email, name,
                            userName, projCode, projName,
                            weekNumber: parseInt(weekNumber),
                            year: parseInt(year),
                            approvalUrl
                        }
                    });
                    if (!fnErr) edgeFunctionOk = true;
                    else console.warn('Edge Function fout:', fnErr.message);
                } catch (fnErr) {
                    console.warn('Edge Function niet beschikbaar:', fnErr);
                }

                // Fallback: altijd mailto openen als Edge Function faalt
                if (!edgeFunctionOk) {
                    const subject = encodeURIComponent(`Weekstaat ter goedkeuring · ${userName} · Week ${weekNumber}/${year}`);
                    const mailBody = encodeURIComponent(
                        `Beste ${name || 'opdrachtgever'},\n\n` +
                        `Graag ontvangen wij uw goedkeuring voor de weekstaat van ${userName}.\n\n` +
                        `Project: ${projCode} · ${projName}\n` +
                        `Week: ${weekNumber} / ${year}\n\n` +
                        `U kunt de weekstaat bekijken en digitaal ondertekenen via onderstaande link:\n` +
                        `${approvalUrl}\n\n` +
                        `Met vriendelijke groet,\n` +
                        `Mark Kuijpers\nKuijpers Technical Services`
                    );
                    window.open(`mailto:${email}?subject=${subject}&body=${mailBody}`);
                }

                // Modal sluiten
                document.getElementById('admin-modal').classList.remove('active');
                showToast('✓ Goedkeuringsverzoek verstuurd naar ' + email);
                loadWeekstaten(); // Lijst verversen
            } catch (err) {
                showToast('❌ Fout: ' + err.message);
                // Bij een fout blijft de modal open · knop weer bruikbaar maken
                if (_apprBtn) {
                    _apprBtn.disabled = false;
                    _apprBtn.textContent = '📩 Verstuur ter goedkeuring';
                }
            }
        }

        function openConfirmationModal(userId, projectId, weekNumber, year) {
            const project = (window._adminProjects || []).find(p => p.id === projectId);
            const user = (window._adminUsers || []).find(u => u.id === userId);
            const userName = user ? (user.name || user.email) : 'Onbekend';
            const projCode = project ? project.project_code : '?';
            const projName = project ? project.name : '';
            const userSlug = userName.replace(/\s+/g, '_');

            let clientEmail = '';
            let clientName = '';
            if (project && project.client_company_id) {
                const company = typeof project.client_company_id === 'object' ? project.client_company_id : null;
                if (company) {
                    clientEmail = getContactEmailsByRole(company, 'receives_weekstaat');
                    clientName = getContactNameByRole(company, 'receives_weekstaat') || company.name || '';
                }
            }
            // CC-ontvangers uit project (uitzonderingsveld) · comma-separated
            const ccRaw = (project && project.cc_emails_weekstaat) || '';
            const ccBanner = ccRaw.trim()
                ? `<div style="margin-bottom:12px;padding:10px;background:var(--app-info-soft);border:1px solid var(--app-info-line);border-radius:8px;font-size:0.78rem;color:var(--app-info);line-height:1.4">
                    <strong>📧 CC bij verzenden:</strong> ${escapeHtml(ccRaw)}<br>
                    <span style="opacity:0.85">Ingesteld op project · pas aan via Beheer → Projecten als nodig.</span>
                   </div>`
                : '';

            const content = `
                <div style="margin-bottom:16px;padding:12px;background:var(--app-ok-soft);border-radius:8px;font-size:0.85rem">
                    <div style="font-weight:700;color:var(--app-ok);margin-bottom:4px">✅ Weekstaat goedgekeurd</div>
                    <div><strong>Medewerker:</strong> ${escapeHtml(userName)}</div>
                    <div><strong>Project:</strong> ${escapeHtml(projCode)} · ${escapeHtml(projName)}</div>
                    <div><strong>Week:</strong> ${weekNumber} / ${year}</div>
                </div>
                <div style="font-size:0.8rem;color:var(--muted);margin-bottom:12px">Verstuur een bevestiging naar de opdrachtgever met de weekstaat PDF als bijlage.</div>
                <div class="form-group" style="margin-bottom:12px">
                    <label>E-mail opdrachtgever</label>
                    <input type="email" id="confirm-email" placeholder="bijv. info@kenphelan.nl" value="${escapeHtml(clientEmail)}" style="width:100%;padding:10px;border:2px solid var(--app-line);border-radius:8px;font-size:0.85rem">
                </div>
                <div class="form-group" style="margin-bottom:12px">
                    <label>Naam opdrachtgever</label>
                    <input type="text" id="confirm-name" placeholder="bijv. Marcel Virtmann" value="${escapeHtml(clientName)}" style="width:100%;padding:10px;border:2px solid var(--app-line);border-radius:8px;font-size:0.85rem">
                </div>
                ${ccBanner}
                <div id="confirm-status" style="display:none;margin-bottom:12px;padding:10px;border-radius:8px;font-size:0.8rem"></div>
                <button id="confirm-send-btn" onclick="sendConfirmationToClient('${userId}','${projectId}',${weekNumber},${year},'${escapeHtml(String(projCode).replace(/'/g, "\\'"))}','${escapeHtml(String(userSlug).replace(/'/g, "\\'"))}')" class="btn btn-primary" style="width:100%;padding:12px;font-size:0.9rem;background:#059669">📩 Verstuur bevestiging met PDF</button>
            `;

            const modal = document.getElementById('admin-modal');
            const titleEl = document.getElementById('admin-modal-title');
            const fieldsEl = document.getElementById('admin-modal-fields');
            const saveBtn = document.getElementById('admin-modal-save');
            if (modal && titleEl && fieldsEl) {
                titleEl.textContent = 'Bevestiging weekstaat versturen';
                fieldsEl.innerHTML = content;
                if (saveBtn) saveBtn.style.display = 'none';
                const delBtn = document.getElementById('admin-modal-delete');
                if (delBtn) delBtn.style.display = 'none';
                modal.classList.add('active');
            }
        }

        async function sendConfirmationToClient(userId, projectId, weekNumber, year, projCode, userSlug) {
            const email = document.getElementById('confirm-email').value.trim();
            const name = document.getElementById('confirm-name').value.trim();
            if (!email) { showToast('⚠️ Vul een e-mailadres in'); return; }

            const btn = document.getElementById('confirm-send-btn');
            const statusEl = document.getElementById('confirm-status');
            if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Bezig...'; }

            const user = (window._adminUsers || []).find(u => u.id === userId);
            const project = (window._adminProjects || []).find(p => p.id === projectId);
            const userName = user ? (user.name || user.email) : 'Medewerker';
            const pCode = projCode || (project ? project.project_code : '');
            const projName = project ? project.name : '';
            const uSlug = userSlug || userName.replace(/\s+/g, '_');
            // CC-ontvangers uit project (uitzonderingsveld voor bv. Levvel-EPC info-only)
            const ccRaw = (project && project.cc_emails_weekstaat) || '';
            const ccEmails = ccRaw.split(/[,;]\s*/).map(s => s.trim()).filter(Boolean);

            function showStatus(msg, isError) {
                if (!statusEl) return;
                statusEl.style.display = '';
                statusEl.style.background = isError ? 'var(--app-alert-soft)' : 'var(--app-info-soft)';
                statusEl.style.color = isError ? 'var(--app-alert)' : 'var(--app-info)';
                statusEl.textContent = msg;
            }

            try {
                const sb = getSupabase();
                if (!sb) throw new Error('Niet verbonden met database');

                // 1. Zoek PDF in Supabase Storage
                if (btn) btn.innerHTML = '🔍 PDF zoeken...';
                showStatus('PDF ophalen uit storage...', false);

                const folderPath = `${year}/week-${weekNumber}`;
                const { data: files } = await sb.storage.from('weekstaten').list(folderPath, { limit: 50 });
                const match = (files || []).find(f => f.name.includes(pCode) || f.name.includes(uSlug));

                let pdfBase64 = null;
                let pdfFileName = null;

                if (match) {
                    // Download PDF als blob
                    if (btn) btn.innerHTML = '📄 PDF downloaden...';
                    const { data: blob, error: dlErr } = await sb.storage.from('weekstaten').download(`${folderPath}/${match.name}`);
                    if (dlErr) throw new Error('PDF download mislukt: ' + dlErr.message);

                    // Blob naar base64
                    const arrayBuf = await blob.arrayBuffer();
                    const bytes = new Uint8Array(arrayBuf);
                    let binary = '';
                    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                    pdfBase64 = btoa(binary);
                    pdfFileName = match.name;
                }

                if (!pdfBase64) {
                    showStatus('⚠️ PDF niet gevonden in storage · mail wordt zonder bijlage verstuurd', true);
                }

                // 2. Verstuur via Edge Function
                if (btn) btn.innerHTML = '📩 Email versturen...';
                showStatus('Email versturen via Edge Function...', false);

                let edgeFunctionOk = false;
                try {
                    const { data: fnData, error: fnErr } = await sb.functions.invoke('send-weekstaat-confirmation', {
                        body: {
                            pdfBase64: pdfBase64,
                            fileName: pdfFileName || ktsWeekstaatName(year, weekNumber, uSlug, pCode),
                            recipientEmail: email,
                            recipientName: name,
                            ccEmails: ccEmails,  // optioneel · Edge Function leest dit uit
                            userName: userName,
                            projectCode: pCode,
                            projectName: projName,
                            weekNumber: parseInt(weekNumber),
                            year: parseInt(year)
                        }
                    });
                    if (!fnErr && fnData && !fnData.error) {
                        edgeFunctionOk = true;
                    } else {
                        console.warn('Edge Function fout:', fnErr?.message || fnData?.error);
                    }
                } catch (fnErr) {
                    console.warn('Edge Function niet beschikbaar:', fnErr);
                }

                // 3. Fallback: mailto kan technisch GEEN bijlage meesturen · RFC 6068 staat
                //    geen "attachment" parameter toe en geen mail-client implementeert het.
                //    Daarom: download de PDF lokaal zodat de gebruiker hem zelf kan attachen,
                //    en open de mailto-link met de uitleg in de mailtekst.
                if (!edgeFunctionOk) {
                    if (pdfBase64 && pdfFileName) {
                        // PDF lokaal downloaden zodat hij in Downloads klaar staat om te attachen
                        try {
                            const bytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));
                            const blob = new Blob([bytes], { type: 'application/pdf' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = pdfFileName;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            setTimeout(() => URL.revokeObjectURL(url), 1000);
                            showStatus('📥 PDF gedownload · sleep hem zelf bij de mail', true);
                        } catch (dlErr) {
                            console.warn('PDF lokaal opslaan mislukt:', dlErr);
                            showStatus('Edge Function niet beschikbaar · mail openen zonder bijlage', true);
                        }
                    } else {
                        showStatus('Edge Function niet beschikbaar · mail openen zonder bijlage', true);
                    }

                    const subject = encodeURIComponent(`Bevestiging weekstaat goedgekeurd · ${userName} · Week ${weekNumber}/${year}`);
                    const attachLine = pdfBase64 && pdfFileName
                        ? `Zie bijlage: ${pdfFileName} (zojuist gedownload · sleep aub als bijlage in deze mail).\n\n`
                        : '';
                    const mailBody = encodeURIComponent(
                        `Beste ${name || 'opdrachtgever'},\n\n` +
                        `Hierbij bevestigen wij dat de weekstaat van ${userName} voor week ${weekNumber}/${year} is goedgekeurd en ondertekend.\n\n` +
                        attachLine +
                        `Project: ${pCode} ·${projName}\n` +
                        `Week: ${weekNumber} / ${year}\n\n` +
                        `Met vriendelijke groet,\n` +
                        `Mark Kuijpers\nKuijpers Technical Services B.V.`
                    );
                    // mailto met CC: &cc=adres1,adres2 · werkt in alle major mail clients
                    const ccParam = ccEmails.length > 0 ? `&cc=${encodeURIComponent(ccEmails.join(','))}` : '';
                    window.open(`mailto:${email}?${ccParam ? ccParam.slice(1) + '&' : ''}subject=${subject}&body=${mailBody}`);
                }

                document.getElementById('admin-modal').classList.remove('active');
                const ccSuffix = ccEmails.length > 0 ? ` (CC: ${ccEmails.join(', ')})` : '';
                if (edgeFunctionOk) {
                    showToast('✅ Bevestiging met PDF verstuurd naar ' + email + ccSuffix);
                } else if (pdfBase64) {
                    showToast('📥 PDF gedownload · voeg deze handmatig toe aan de mail' + ccSuffix);
                } else {
                    showToast('✓ Mail geopend (geen PDF gevonden)' + ccSuffix);
                }
            } catch (err) {
                showStatus('❌ Fout: ' + err.message, true);
                if (btn) { btn.disabled = false; btn.innerHTML = '📩 Verstuur bevestiging met PDF'; }
            }
        }

        async function downloadWeekstaatFromStorage(path) {
            const sb = getSupabase();
            if (!sb) return;
            try {
                const { data, error } = await sb.storage.from('weekstaten').download(path);
                if (error) throw error;
                const url = URL.createObjectURL(data);
                const a = document.createElement('a');
                a.href = url;
                a.download = path.split('/').pop();
                a.click();
                URL.revokeObjectURL(url);
                showToast('✓ PDF gedownload');
            } catch (err) {
                showToast('❌ Download mislukt: ' + err.message);
            }
        }

        // ===== PROJECTTOEWIJZING FUNCTIES =====
        async function loadProjectAssignments(projectId) {
            const sb = getSupabase();
            if (!sb) return;

            // Haal toegewezen gebruikers op
            const { data: assignments } = await sb.from('user_projects').select('id, user_id').eq('project_id', projectId);

            // Haal alle gebruikers op (voor dropdown + feature flags tonen)
            const { data: allUsers } = await sb.from('users').select('id, name, email, allow_km, allow_thuiswerk, allow_hotel, show_rates, can_declare_expenses').order('name');

            const assignedIds = (assignments || []).map(a => a.user_id);
            const container = document.getElementById('adm-proj-users');
            const select = document.getElementById('adm-proj-user-select');

            // Toon toegewezen gebruikers (read-only badges)
            if (assignments && assignments.length > 0 && allUsers) {
                container.innerHTML = assignments.map(a => {
                    const user = allUsers.find(u => u.id === a.user_id);
                    const name = user ? (user.name || user.email) : a.user_id;
                    const badges = [];
                    if (user) {
                        if (user.allow_km !== false) badges.push('Km');
                        if (user.allow_thuiswerk !== false) badges.push('Thuis');
                        if (user.allow_hotel !== false) badges.push('Hotel');
                        if (user.show_rates !== false) badges.push('Tarieven');
                        if (user.can_declare_expenses !== false) badges.push('Declaraties');
                    }
                    const badgesHtml = badges.map(b => '<span style="background:var(--app-info-soft);color:var(--app-info);padding:1px 5px;border-radius:4px;font-size:0.6rem;border:1px solid var(--app-info-line)">' + b + '</span>').join(' ');
                    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:var(--app-info-soft);border:1px solid var(--app-info-line);border-radius:8px;margin-bottom:4px;color:var(--app-ink-900)">
                        <div>
                            <span style="font-size:0.85rem;font-weight:600">👤 ${name}</span>
                            <div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:2px">${badgesHtml}</div>
                        </div>
                        <button type="button" onclick="removeUserFromProject('${a.id}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:1rem;padding:2px 6px">✕</button>
                    </div>`;
                }).join('');
            } else {
                container.innerHTML = '<div style="color:var(--muted);font-size:0.8rem;padding:4px 0">Geen gebruikers toegewezen</div>';
            }

            // Vul dropdown met niet-toegewezen gebruikers
            if (select && allUsers) {
                const available = allUsers.filter(u => !assignedIds.includes(u.id));
                select.innerHTML = '<option value="">Kies gebruiker...</option>' +
                    available.map(u => `<option value="${u.id}">${escapeHtml(u.name || u.email)}</option>`).join('');
            }
        }

        // toggleAssignmentSetting verwijderd · feature flags staan nu op users tabel

        function inviteUser(email, name) {
            const pw = prompt('Wachtwoord voor de nieuwe gebruiker:', '');
            if (!pw) return;
            const appUrl = window.location.origin;
            const aanhef = name ? name.split(' ')[0] : '';
            const subject = encodeURIComponent('Uitnodiging KTS Uren & Inspecties App');
            const body = encodeURIComponent(
                `Hoi ${aanhef},\n\n` +
                `Je hebt toegang gekregen tot de KTS Uren & Inspecties App.\n\n` +
                `App: ${appUrl}\n` +
                `E-mail: ${email}\n` +
                `Wachtwoord: ${pw}\n\n` +
                `Na je eerste login wordt gevraagd om je wachtwoord te wijzigen.\n\n` +
                `Met vriendelijke groet,\n` +
                `Kuijpers Technical Services`
            );
            window.location.href = 'mailto:' + email + '?subject=' + subject + '&body=' + body;
            showToast('✓ E-mail wordt geopend voor ' + (name || email));
        }

        async function resetWelcomeGuide(userId, userName) {
            if (!await confirmAsync('Welkomstgids opnieuw tonen voor ' + userName + ' bij volgende login?')) return;
            const { error } = await getSupabase().from('users').update({ reset_welcome: true }).eq('id', userId);
            if (error) {
                showToast('❌ Fout: ' + error.message);
            } else {
                showToast('✓ Welkomstgids wordt opnieuw getoond bij volgende login van ' + userName);
            }
        }

        async function assignUserToProject() {
            const sb = getSupabase();
            const select = document.getElementById('adm-proj-user-select');
            const userId = select ? select.value : '';
            if (!userId || !_editingId) { showToast('⚠️ Selecteer een gebruiker'); return; }

            const { error } = await sb.from('user_projects').insert({ user_id: userId, project_id: _editingId });
            if (error) {
                console.error('Toewijzing mislukt:', error.message);
                showToast('⚠️ Toewijzing mislukt: ' + error.message);
                return;
            }
            showToast('✓ Gebruiker toegewezen');
            await loadProjectAssignments(_editingId);
        }

        async function removeUserFromProject(assignmentId) {
            const sb = getSupabase();
            if (!sb) return;
            const { error } = await sb.from('user_projects').delete().eq('id', assignmentId);
            if (error) {
                showToast('⚠️ Verwijderen mislukt');
                return;
            }
            showToast('✓ Toewijzing verwijderd');
            await loadProjectAssignments(_editingId);
        }

        // ===== GEMACHTIGDEN BEHEER (admin · gebruiker-modal) =====
        // fill_delegates: delegator = wiens uren, delegate = wie mag invullen.
        // In de modal van gebruiker X beheren we voor wie X mag invullen.
        async function loadFillDelegations(delegateUserId) {
            const sb = getSupabase();
            const listEl = document.getElementById('adm-user-delegations');
            const sel = document.getElementById('adm-user-delegate-select');
            if (!sb || !listEl || !sel) return;

            // Dropdown: alle actieve gebruikers behalve deze gebruiker zelf
            const candidates = getFilteredUsers().filter(u => u.id !== delegateUserId);
            sel.innerHTML = '<option value="">-- Kies collega --</option>' + candidates.map(u =>
                `<option value="${u.id}">${escapeHtml(u.name || u.email)}</option>`
            ).join('');

            const { data, error } = await sb.from('fill_delegates')
                .select('delegator_id')
                .eq('delegate_id', delegateUserId);
            if (error) {
                if (/relation.*fill_delegates/i.test(error.message || '')) {
                    listEl.innerHTML = '<div style="color:var(--app-warn);font-size:0.75rem;line-height:1.4">Tabel ontbreekt nog · draai migratie-gemachtigden.sql in de Supabase SQL Editor.</div>';
                } else {
                    listEl.innerHTML = '<div style="color:var(--app-alert);font-size:0.75rem">Laden mislukt: ' + escapeHtml(error.message) + '</div>';
                }
                return;
            }
            const ids = (data || []).map(r => r.delegator_id);
            if (ids.length === 0) {
                listEl.innerHTML = '<div style="color:var(--muted);font-size:0.8rem">Nog geen machtigingen</div>';
                return;
            }
            const nameById = {};
            (window._adminUsers || []).forEach(u => { nameById[u.id] = u.name || u.email; });
            listEl.innerHTML = ids.map(id => `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;background:var(--app-bg-tint);border:1px solid var(--border);border-radius:8px">
                    <span style="font-size:0.85rem">${escapeHtml(nameById[id] || 'Onbekende gebruiker')}</span>
                    <button type="button" class="btn btn-sm" onclick="removeFillDelegation('${id}')" style="padding:3px 10px;font-size:0.7rem;background:var(--app-alert-soft);color:var(--app-alert);border:1px solid var(--app-alert-line)">Verwijderen</button>
                </div>`).join('');
        }

        async function addFillDelegation() {
            const sb = getSupabase();
            const sel = document.getElementById('adm-user-delegate-select');
            const delegatorId = sel ? sel.value : '';
            if (!delegatorId || !_editingId) { showToast('⚠️ Kies eerst een collega'); return; }
            const { error } = await sb.from('fill_delegates').insert({
                delegator_id: delegatorId,
                delegate_id: _editingId
            });
            if (error) {
                if (/duplicate|unique/i.test(error.message || '')) {
                    showToast('⚠️ Deze machtiging bestaat al');
                } else if (/relation.*fill_delegates/i.test(error.message || '')) {
                    showToast('⚠️ Draai eerst migratie-gemachtigden.sql');
                } else {
                    showToast('⚠️ Toevoegen mislukt: ' + error.message);
                }
                return;
            }
            showToast('✓ Machtiging toegevoegd');
            await loadFillDelegations(_editingId);
        }

        async function removeFillDelegation(delegatorId) {
            const sb = getSupabase();
            if (!sb || !_editingId) return;
            const { error } = await sb.from('fill_delegates').delete()
                .eq('delegator_id', delegatorId)
                .eq('delegate_id', _editingId);
            if (error) { showToast('⚠️ Verwijderen mislukt: ' + error.message); return; }
            showToast('✓ Machtiging verwijderd');
            await loadFillDelegations(_editingId);
        }

        async function deleteAdminItem() {
            if (!_editingId) return;
            const delBtn = document.getElementById('admin-modal-delete');
            const type = delBtn ? delBtn.dataset.type : '';
            const sb = getSupabase();
            if (!sb) { showToast('⚠️ Niet verbonden'); return; }

            // Tarief: simpele delete · geen foreign-key complicaties
            if (type === 'tarief') {
                if (!await confirmAsync('Weet je zeker dat je dit tarief wilt verwijderen?', true)) return;
                const { error } = await sb.from('rates').delete().eq('id', _editingId);
                if (error) { showToast('⚠️ Verwijderen mislukt: ' + error.message); return; }
                showToast('✓ Tarief verwijderd');
                closeModal('admin-modal');
                await loadAdminData();
                return;
            }

            // Project: drie scenario's afhankelijk van wat er aan het project hangt.
            //   1. Geen koppelingen          → directe hard delete
            //   2. Alleen setup (tarieven /  → vraag bevestiging om die mee te wissen,
            //      gebruikerstoewijzingen)     daarna hard delete (cascading)
            //   3. Echte data (uren /        → alleen archiveren (status=closed)
            //      weekstaten / declaraties)
            // Reden voor splitsing: een net-aangemaakt project heeft vaak al een
            // tarief en/of toewijzing maar geen 'echte' historie · daar wil je hard delete.
            if (type === 'project') {
                const projName = document.getElementById('adm-proj-name')?.value || 'dit project';
                if (!await confirmAsync(`Project "${projName}" verwijderen?\n\nWe checken eerst wat er aan het project gekoppeld is.`, true)) return;

                const safeCount = async (table, col) => {
                    try {
                        const { count } = await sb.from(table).select('id', { count: 'exact', head: true }).eq(col, _editingId);
                        return count || 0;
                    } catch (e) { return 0; }
                };
                const [uren, weekstaten, kosten, tarieven, toewijzingen] = await Promise.all([
                    safeCount('time_entries', 'project_id'),
                    safeCount('week_status', 'project_id'),
                    safeCount('expenses', 'project_id'),
                    safeCount('rates', 'project_id'),
                    safeCount('user_projects', 'project_id')
                ]);
                const hardData = uren + weekstaten + kosten;       // echte administratie
                const setupData = tarieven + toewijzingen;          // configuratie

                // Scenario 3: echte data aanwezig · alleen archiveren toestaan
                if (hardData > 0) {
                    const details = [
                        uren > 0 ? `· ${uren} uren-invoer${uren === 1 ? '' : 'en'}` : '',
                        weekstaten > 0 ? `· ${weekstaten} weekstaten` : '',
                        kosten > 0 ? `· ${kosten} declaratie${kosten === 1 ? '' : 's'}` : '',
                        tarieven > 0 ? `· ${tarieven} tariefregel${tarieven === 1 ? '' : 's'}` : '',
                        toewijzingen > 0 ? `· ${toewijzingen} gebruikerstoewijzing${toewijzingen === 1 ? '' : 'en'}` : ''
                    ].filter(Boolean).join('\n');
                    const archive = await confirmAsync(
                        `Kan niet hard verwijderen · er zit administratie aan vast:\n\n${details}\n\nWil je het project archiveren in plaats daarvan?\n(Status wordt 'Afgesloten'. De data blijft behouden, het project verdwijnt uit de keuzelijsten.)`,
                        true
                    );
                    if (!archive) return;
                    const { error } = await sb.from('projects').update({ status: 'closed' }).eq('id', _editingId);
                    if (error) { showToast('⚠️ Archiveren mislukt: ' + error.message); return; }
                    showToast('✓ Project gearchiveerd (afgesloten)');
                    closeModal('admin-modal');
                    await loadAdminData();
                    return;
                }

                // Scenario 2: alleen setup-koppelingen · vraag of die mee mogen
                if (setupData > 0) {
                    const details = [
                        tarieven > 0 ? `· ${tarieven} tariefregel${tarieven === 1 ? '' : 's'}` : '',
                        toewijzingen > 0 ? `· ${toewijzingen} gebruikerstoewijzing${toewijzingen === 1 ? '' : 'en'}` : ''
                    ].filter(Boolean).join('\n');
                    const ok = await confirmAsync(
                        `Geen administratie aan dit project gekoppeld, alleen setup:\n\n${details}\n\nDeze worden meegewist bij hard verwijderen. Doorgaan?`,
                        true
                    );
                    if (!ok) return;
                    // Eerst de FK-referenties opruimen, daarna het project zelf
                    if (toewijzingen > 0) {
                        const { error: e1 } = await sb.from('user_projects').delete().eq('project_id', _editingId);
                        if (e1) { showToast('⚠️ Toewijzingen wissen mislukt: ' + e1.message); return; }
                    }
                    if (tarieven > 0) {
                        const { error: e2 } = await sb.from('rates').delete().eq('project_id', _editingId);
                        if (e2) { showToast('⚠️ Tarieven wissen mislukt: ' + e2.message); return; }
                    }
                    const { error } = await sb.from('projects').delete().eq('id', _editingId);
                    if (error) { showToast('⚠️ Verwijderen mislukt: ' + error.message); return; }
                    showToast('✓ Project + setup verwijderd');
                    closeModal('admin-modal');
                    await loadAdminData();
                    return;
                }

                // Scenario 1: niets gekoppeld · directe hard delete
                const { error } = await sb.from('projects').delete().eq('id', _editingId);
                if (error) { showToast('⚠️ Verwijderen mislukt: ' + error.message); return; }
                showToast('✓ Project verwijderd');
                closeModal('admin-modal');
                await loadAdminData();
                return;
            }

            // Persoon (companies): check FK op users + projects, hard delete of archive
            if (type === 'persoon') {
                const compName = document.getElementById('adm-pers-name')?.value || 'dit bedrijf';
                if (!await confirmAsync(`Bedrijf "${compName}" verwijderen?\n\nWe checken eerst of er nog gebruikers of projecten aan gekoppeld zijn.`, true)) return;

                const safeCount = async (table, col) => {
                    try {
                        const { count } = await sb.from(table).select('id', { count: 'exact', head: true }).eq(col, _editingId);
                        return count || 0;
                    } catch (e) { return 0; }
                };
                const [gebruikers, projFactuur, projIo] = await Promise.all([
                    safeCount('users', 'company_id'),
                    safeCount('projects', 'client_company_id'),
                    safeCount('projects', 'io_company_id')
                ]);
                const total = gebruikers + projFactuur + projIo;

                if (total === 0) {
                    const { error } = await sb.from('companies').delete().eq('id', _editingId);
                    if (error) { showToast('⚠️ Verwijderen mislukt: ' + error.message); return; }
                    showToast('✓ Bedrijf verwijderd');
                    closeModal('admin-modal');
                    await loadAdminData();
                    return;
                }

                const details = [
                    gebruikers > 0 ? `· ${gebruikers} gebruiker${gebruikers === 1 ? '' : 's'}` : '',
                    projFactuur > 0 ? `· ${projFactuur} project${projFactuur === 1 ? '' : 'en'} (als factuur-bedrijf)` : '',
                    projIo > 0 ? `· ${projIo} project${projIo === 1 ? '' : 'en'} (als inkooporder-bedrijf)` : ''
                ].filter(Boolean).join('\n');
                const archive = await confirmAsync(
                    `Kan niet hard verwijderen · er zijn koppelingen:\n\n${details}\n\nWil je het bedrijf archiveren in plaats daarvan?\n(Verdwijnt uit keuzelijsten, blijft in de DB voor de bestaande koppelingen.)`,
                    true
                );
                if (!archive) return;
                const { error } = await sb.from('companies').update({ archived: true }).eq('id', _editingId);
                if (error) { showToast('⚠️ Archiveren mislukt: ' + error.message); return; }
                showToast('✓ Bedrijf gearchiveerd');
                closeModal('admin-modal');
                await loadAdminData();
                return;
            }
        }

        async function saveAdminItem(type) {
            const sb = getSupabase();
            if (!sb) { showToast('⚠️ Niet verbonden'); return; }

            let result;
            if (type === 'project') {
                const code = document.getElementById('adm-proj-code').value.trim();
                const name = document.getElementById('adm-proj-name').value.trim();
                if (!code || !name) { showToast('⚠️ Vul minimaal code en naam in'); return; }
                const data = {
                    project_code: code,
                    name: name,
                    client_name: document.getElementById('adm-proj-client').value.trim() || null,
                    client_company_id: document.getElementById('adm-proj-factuur-company').value || null,
                    io_company_id: document.getElementById('adm-proj-io-company').value || null,
                    location: document.getElementById('adm-proj-location').value.trim() || null,
                    default_description: document.getElementById('adm-proj-desc').value.trim() || null,
                    default_location: document.getElementById('adm-proj-deflocation').value.trim() || null,
                    // km_single_trip en hotel_rate staan nu op users tabel
                    start_date: document.getElementById('adm-proj-start').value || null,
                    status: document.getElementById('adm-proj-status').value || 'active',
                    notes: document.getElementById('adm-proj-notes').value.trim() || null,
                    cc_emails_weekstaat: document.getElementById('adm-proj-cc-weekstaat').value.trim() || null
                    // is_test uitgefaseerd 2026-07-03: veld weggelaten · UPDATE behoudt
                    // de bestaande waarde, INSERT valt terug op de DB-default (false)
                };
                // Probeer met cc_emails_weekstaat. Als de kolom nog niet bestaat (migratie
                // niet uitgevoerd), val terug op insert/update zonder dat veld.
                let saveErr;
                ({ error: saveErr } = _editingId
                    ? await sb.from('projects').update(data).eq('id', _editingId)
                    : await sb.from('projects').insert(data));
                if (saveErr && /cc_emails_weekstaat/.test(saveErr.message || '')) {
                    console.warn('cc_emails_weekstaat kolom niet aanwezig · fallback. Voer migratie-project-cc-weekstaat.sql uit.');
                    delete data.cc_emails_weekstaat;
                    ({ error: saveErr } = _editingId
                        ? await sb.from('projects').update(data).eq('id', _editingId)
                        : await sb.from('projects').insert(data));
                }
                result = { error: saveErr };
            } else if (type === 'persoon') {
                const name = document.getElementById('adm-pers-name').value.trim();
                const ptype = document.getElementById('adm-pers-type').value;
                if (!name) { showToast('⚠️ Vul minimaal een naam in'); return; }
                const allContacts = getExtraContacts();
                // Backward compat: eerste contact → primaire velden
                const primary = allContacts[0] || {};
                // E-mail ontvangers IO: alle contacten met receives_io aangevinkt
                const ioEmails = allContacts.filter(c => c.receives_io && c.email).map(c => c.email).join(', ');
                const data = {
                    name: name,
                    contact_name: primary.name || null,
                    contact_function: primary.role || null,
                    type: ptype,
                    kvk_number: document.getElementById('adm-pers-kvk').value.trim() || null,
                    btw_number: document.getElementById('adm-pers-btw').value.trim() || null,
                    address: document.getElementById('adm-pers-addr').value.trim() || null,
                    postcode: document.getElementById('adm-pers-postcode').value.trim() || null,
                    city: document.getElementById('adm-pers-city').value.trim() || null,
                    country: document.getElementById('adm-pers-country').value || 'Nederland',
                    phone: document.getElementById('adm-pers-phone').value.trim() || null,
                    email: primary.email || null,
                    email_po: ioEmails || null,
                    // is_test uitgefaseerd 2026-07-03 · veld weggelaten
                    archived: document.getElementById('adm-pers-archived').checked,
                    notes: document.getElementById('adm-pers-notes').value.trim() || null,
                    contacts: allContacts,
                    payment_term_days: parseInt(document.getElementById('adm-pers-payment-term').value) || 30
                };
                result = _editingId
                    ? await sb.from('companies').update(data).eq('id', _editingId)
                    : await sb.from('companies').insert(data);
            } else if (type === 'tarief') {
                const projId = document.getElementById('adm-tar-project').value;
                const hourly = parseFloat(document.getElementById('adm-tar-hourly').value);
                const from = document.getElementById('adm-tar-from').value;
                if (!projId || !hourly || !from) { showToast('⚠️ Vul project, uurtarief en startdatum in'); return; }
                const userId = document.getElementById('adm-tar-user').value || null;
                const functionTitle = document.getElementById('adm-tar-function').value.trim() || null;
                // Verkoop-tarief (admin only) · leeg = NULL = factuur gebruikt fallback hourly_rate
                const saleVal = document.getElementById('adm-tar-hourly-sale').value.trim();
                const hourlySale = saleVal ? parseFloat(saleVal) : null;
                const data = {
                    project_id: projId,
                    user_id: userId,
                    function_title: functionTitle,
                    hourly_rate: hourly,
                    hourly_rate_sale: hourlySale,
                    km_rate: parseFloat(document.getElementById('adm-tar-km').value) || 0.50,
                    saturday_multiplier: (parseFloat(document.getElementById('adm-tar-sat').value) || 150) / 100,
                    sunday_holiday_multiplier: (parseFloat(document.getElementById('adm-tar-sun').value) || 200) / 100,
                    valid_from: from,
                    valid_to: document.getElementById('adm-tar-to').value || null,
                };
                result = _editingId
                    ? await sb.from('rates').update(data).eq('id', _editingId)
                    : await sb.from('rates').insert(data);
            } else if (type === 'gebruiker') {
                if (!_editingId) return;
                const nameVal = document.getElementById('adm-user-name').value.trim();
                const data = {
                    name: nameVal || null,
                    allow_km: document.getElementById('adm-user-km').checked,
                    allow_thuiswerk: document.getElementById('adm-user-thuiswerk').checked,
                    allow_hotel: document.getElementById('adm-user-hotel').checked,
                    show_rates: document.getElementById('adm-user-rates').checked,
                    can_declare_expenses: document.getElementById('adm-user-expenses').checked,
                    allow_inspecties: document.getElementById('adm-user-inspecties').checked,
                    allow_administratie: document.getElementById('adm-user-administratie').checked,
                    start_week: parseInt(document.getElementById('adm-user-start-week').value) || null,
                    start_year: parseInt(document.getElementById('adm-user-start-year').value) || null,
                    km_single_trip: parseFloat(document.getElementById('adm-user-kmsingle').value) || null,
                    hotel_rate: parseFloat(document.getElementById('adm-user-hotel-rate').value) || null,
                    company_id: document.getElementById('adm-user-company').value || null,
                    invoice_via_company_id: document.getElementById('adm-user-invoice-via').value || null
                    // is_test uitgefaseerd 2026-07-03 · veld weggelaten
                };
                let updErr;
                ({ error: updErr } = await sb.from('users').update(data).eq('id', _editingId));
                // Fallback voor oude DB zonder invoice_via_company_id kolom
                if (updErr && /invoice_via_company_id/.test(updErr.message || '')) {
                    console.warn('invoice_via_company_id kolom niet aanwezig · fallback. Voer migratie-invoice-via.sql uit.');
                    delete data.invoice_via_company_id;
                    ({ error: updErr } = await sb.from('users').update(data).eq('id', _editingId));
                }
                result = { error: updErr };
            }

            if (result && result.error) {
                showToast('⚠️ Fout: ' + result.error.message);
            } else {
                closeModal('admin-modal');
                showToast('✓ Opgeslagen');

                // Als we de huidige gebruiker bewerkt hebben: currentUser bijwerken + UI herladen
                if (type === 'gebruiker' && _editingId === currentUser.id) {
                    const { data: freshUser } = await sb.from('users')
                        .select('*')
                        .eq('id', currentUser.id)
                        .single();
                    if (freshUser) {
                        Object.assign(currentUser, freshUser);
                        // Tabs/features direct bijwerken
                        const navKosten = document.getElementById('nav-kosten');
                        if (navKosten) navKosten.style.display = (currentUser.role === 'admin' || userCanDeclareExpenses()) ? '' : 'none';
                        const navInsp3 = document.getElementById('nav-inspecties');
                        if (navInsp3) navInsp3.style.display = (currentUser.role === 'admin' || currentUser.allow_inspecties) ? '' : 'none';
                        const navAdm3 = document.getElementById('nav-administratie');
                        if (navAdm3) navAdm3.style.display = (currentUser.role === 'admin' || currentUser.allow_administratie) ? '' : 'none';
                        updateBottomNavGrid();
                        // Overzicht + dagkaarten herladen met nieuwe flags
                        renderDays();
                        renderSummary();
                        renderOverview();
                    }
                }

                _editingId = null;
                // Await: de lijst-HTML en de cache (window._adminProjects etc.)
                // moeten synchroon blijven · openAdminModal gebruikt indexen in
                // die cache, dus een klik direct na opslaan mag geen verouderde
                // index/cache-combinatie treffen.
                await loadAdminData();
            }
        }

        // Demo modus · overslaan als CDN niet werkt
        function skipLogin() {
            currentUser = { id: null, name: 'Demo gebruiker', role: 'engineer' };
            document.getElementById('login-overlay').style.display = 'none';
            document.getElementById('user-badge-name').innerHTML = '👤 Demo';
            showToast('Demo modus · data wordt niet opgeslagen');
        }

