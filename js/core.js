        // ===== SUPABASE =====
        const SUPABASE_URL = 'https://fvrbirghjydkxslbewny.supabase.co';
        const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2cmJpcmdoanlka3hzbGJld255Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzNzg1MTAsImV4cCI6MjA4Nzk1NDUxMH0.-v0LgCf5QJkjEWAYR9quhkBrlAeTuV5Dv6YKA2tECu4';
        let sbClient = null;
        let currentUser = null;
        let currentProject = null;
        // Feature flags staan nu direct op currentUser (users tabel)
        let savedFolderHandle = null; // File System Access API · map voor PDF opslag (legacy/fallback)
        let savedFolderHandles = { weekstaten: null, inkooporders: null, facturen: null };

        // Helper: naam splitsen voor badge (voornaam\nachternaam)
        function formatBadgeName(name) {
            if (!name) return '👤';
            const safe = escapeHtml(name);
            const parts = safe.trim().split(/\s+/);
            if (parts.length <= 1) return '👤 ' + safe;
            if (window.innerWidth > 600) return '👤 ' + safe;
            return '👤 ' + parts[0] + '<br>' + parts.slice(1).join(' ');
        }

        // Helper functies voor feature flags (uit users tabel)
        function userHasKm() {
            if (currentUser && currentUser.allow_km === false) return false;
            return currentUser && parseFloat(currentUser.km_single_trip) > 0;
        }
        function userHasThuiswerk() {
            return !currentUser || currentUser.allow_thuiswerk !== false;
        }
        function userHasHotel() {
            return !currentUser || currentUser.allow_hotel !== false;
        }
        function userCanSeeRates() {
            return !currentUser || currentUser.show_rates !== false;
        }
        function userCanDeclareExpenses() {
            return !currentUser || currentUser.can_declare_expenses !== false;
        }

        // Lazy init · pas aanmaken als CDN geladen is
        function getSupabase() {
            if (sbClient) return sbClient;
            // Supabase CDN v2 registreert als window.supabase
            const lib = window.supabase;
            if (lib && typeof lib.createClient === 'function') {
                sbClient = lib.createClient(SUPABASE_URL, SUPABASE_KEY);
                console.log('Supabase client aangemaakt');
            }
            return sbClient;
        }

        // ===== CONFIG =====
        let RATE = 85;
        let KM_RATE = 0.50;
        let HOTEL_RATE = 110.00; // default, wordt overschreven door currentUser.hotel_rate
        let SAT_MULTIPLIER = 1.50;
        let SUN_MULTIPLIER = 2.00;
        let currentRates = null; // geladen uit Supabase rates tabel
        // Dynamische km-waarden op basis van currentUser.km_single_trip
        function getUserKmEnkel() { return currentUser ? parseFloat(currentUser.km_single_trip) || 0 : 0; }
        function getUserKmRetour() { return getUserKmEnkel() * 2; }
        const KM_PROJECT_HOTEL = 12;  // enkele reis project → hotel
        const KM_HOTEL_PROJECT = 12;  // enkele reis hotel → project
        const DAYS_FULL = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];
        const MONTHS_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

        // ===== WEEK NAVIGATIE =====
        // Bereken huidige ISO week (ma=start)
        function getISOWeek(date) {
            const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
            d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
            return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        }

        function getISOYear(date) {
            // ISO 8601: het jaar waar de donderdag van de week in valt
            const d = new Date(date);
            d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
            return d.getFullYear();
        }

        function getWeekMonday(date) {
            const d = new Date(date);
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            return new Date(d.getFullYear(), d.getMonth(), diff);
        }

        function getMondayOfISOWeek(week, year) {
            const jan4 = new Date(year, 0, 4);
            const monday = getWeekMonday(jan4);
            monday.setDate(monday.getDate() + (week - 1) * 7);
            return monday;
        }

        let currentWeekMonday = getWeekMonday(new Date());
        let currentWeekNumber = getISOWeek(new Date());
        let currentYear = getISOYear(new Date());
        let weekSummary = null; // als er een week_summaries record is (historische data)
        let currentWeekDbStatus = null; // DB status: 'opgeslagen', 'ondertekend', 'verstuurd'

        // Maandnavigatie voor overzicht
        let overviewMonth = new Date().getMonth(); // 0-indexed
        let overviewYear = new Date().getFullYear();

        // Helper: lokale datum naar YYYY-MM-DD string (zonder UTC-conversie)
        function escapeHtml(str) {
            if (!str) return '';
            return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
        }

        // Voor al-ge-escapeHtml'de waarden die BINNEN een onclick="fn('...')"
        // JS-string terechtkomen: de HTML-parser decodeert &#039; terug naar een
        // rauwe apostrof voordat de JS geparsed wordt, waardoor de string breekt
        // (en injectie mogelijk wordt). Deze helper zet de entiteit om naar \'
        // zodat de gedecodeerde JS een geldige geescapede quote bevat.
        function jsStr(s) {
            return String(s == null ? '' : s).replace(/&#039;/g, "\\'");
        }

        function toLocalDateStr(d) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }

        function getDateForDayIndex(i) {
            const d = new Date(currentWeekMonday);
            d.setDate(d.getDate() + i);
            return toLocalDateStr(d);
        }

        function getDayIndexForDate(dateStr) {
            // Parse als lokale datum (niet UTC) om timezone-verschuiving te voorkomen
            const parts = dateStr.split('-');
            const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            const diff = Math.round((d - currentWeekMonday) / (1000 * 60 * 60 * 24));
            return diff;
        }

        function getDATES() {
            const dates = [];
            for (let i = 0; i < 7; i++) {
                const d = new Date(currentWeekMonday);
                d.setDate(d.getDate() + i);
                dates.push(`${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`);
            }
            return dates;
        }

        // ===== WEEK STATUS CHECK =====
        function getWeekStatus() {
            // Week al verstuurd? Dan vergrendeld
            if (currentWeekDbStatus === 'verstuurd') {
                return { editable: false, reason: 'Week is al verstuurd', icon: '📤', detail: 'Verstuurde weken kunnen niet meer worden aangepast' };
            }

            if (!currentProject) return { editable: true };
            const weekFriday = new Date(currentWeekMonday);
            weekFriday.setDate(weekFriday.getDate() + 4);
            const weekMondayStr = toLocalDateStr(currentWeekMonday);
            const weekFridayStr = toLocalDateStr(weekFriday);

            // Project niet actief (gepauzeerd of afgesloten)
            if (currentProject.status && currentProject.status !== 'active') {
                const reason = currentProject.status === 'paused' ? 'Project is gepauzeerd' : 'Project is afgesloten';
                const icon = currentProject.status === 'paused' ? '⏸️' : '🔒';
                return { editable: false, reason, icon };
            }

            // Week valt voor startdatum
            if (currentProject.start_date && weekFridayStr < currentProject.start_date) {
                return { editable: false, reason: 'Project nog niet gestart', icon: '🔒', detail: 'Start: ' + new Date(currentProject.start_date).toLocaleDateString('nl-NL') };
            }

            // Week valt na einddatum
            if (currentProject.end_date && weekMondayStr > currentProject.end_date) {
                return { editable: false, reason: 'Project is afgerond', icon: '🏁' };
            }

            // Max 2 weken in de toekomst (admins: geen limiet)
            const isAdmin = currentUser && currentUser.role === 'admin';
            if (!isAdmin) {
                const now = new Date();
                const thisMonday = getWeekMonday(now);
                const maxMonday = new Date(thisMonday);
                maxMonday.setDate(maxMonday.getDate() + 14); // 2 weken vooruit
                if (currentWeekMonday > maxMonday) {
                    return { editable: false, reason: 'Week ligt te ver in de toekomst', icon: '🔮', detail: 'Je kunt maximaal 2 weken vooruit werken' };
                }
            }

            return { editable: true };
        }

        function getWeekLabel() {
            const endDate = new Date(currentWeekMonday);
            endDate.setDate(endDate.getDate() + 6);
            const startStr = `${currentWeekMonday.getDate()} ${MONTHS_SHORT[currentWeekMonday.getMonth()]}`;
            const endStr = `${endDate.getDate()} ${MONTHS_SHORT[endDate.getMonth()]}`;
            return `Week ${currentWeekNumber} · ${startStr} – ${endStr}`;
        }

        // ===== WERKWEEK INSTELLINGEN =====
        function getWeekDefaultsKey() {
            return 'kts-week-defaults' + (currentUser ? '-' + currentUser.id : '');
        }

        function getWeekDefaults() {
            try {
                const stored = localStorage.getItem(getWeekDefaultsKey());
                if (stored) return JSON.parse(stored);
            } catch (e) {
                console.warn('getWeekDefaults: corrupt localStorage, fallback naar standaard week:', e.message);
            }
            // Standaard: ma-vr 07:00-16:00, 60 min pauze
            return [
                { start: '07:00', end: '16:00', breakMin: 60, active: true, thuiswerk: false, hotel: false },
                { start: '07:00', end: '16:00', breakMin: 60, active: true, thuiswerk: false, hotel: false },
                { start: '07:00', end: '16:00', breakMin: 60, active: true, thuiswerk: false, hotel: false },
                { start: '07:00', end: '16:00', breakMin: 60, active: true, thuiswerk: false, hotel: false },
                { start: '07:00', end: '16:00', breakMin: 60, active: true, thuiswerk: false, hotel: false },
                { start: '', end: '', breakMin: 0, active: false, thuiswerk: false, hotel: false },
                { start: '', end: '', breakMin: 0, active: false, thuiswerk: false, hotel: false }
            ];
        }

        // ===== ZOOM / TEKSTGROOTTE =====
        function setZoom(level) {
            document.documentElement.classList.remove('zoom-klein', 'zoom-normaal', 'zoom-groot');
            document.documentElement.classList.add('zoom-' + level);
            localStorage.setItem('kts-zoom', level);
            // Update legacy button styles (header user-menu)
            ['klein', 'normaal', 'groot'].forEach(z => {
                const btn = document.getElementById('zoom-btn-' + z);
                if (!btn) return;
                if (z === level) {
                    btn.style.borderColor = 'var(--kts-blue)';
                    btn.style.background = '#e0f2fe';
                    btn.style.color = 'var(--kts-blue)';
                } else {
                    btn.style.borderColor = 'var(--border)';
                    btn.style.background = 'white';
                    btn.style.color = 'var(--text)';
                }
            });
            // Update Fase 2 zoom buttons (profiel-tab)
            document.querySelectorAll('.app-zoom-btn[data-zoom]').forEach(btn => {
                btn.classList.toggle('is-active', btn.dataset.zoom === level);
            });
        }
        // Zoom herstellen bij laden
        (function initZoom() {
            const saved = localStorage.getItem('kts-zoom') || 'normaal';
            document.documentElement.classList.add('zoom-' + saved);
        })();

        // Versienummer in de profiel-footer · afgeleid van de actieve service
        // worker cache (kts-uren-vNNN) zodat het nooit meer achterloopt op de
        // echte versie. Fallback: sw.js zelf uitlezen (bv. eerste bezoek,
        // voordat de cache bestaat).
        (async function initVersionTag() {
            const el = document.getElementById('app-version-tag');
            if (!el) return;
            try {
                let versie = null;
                if ('caches' in window) {
                    const keys = await caches.keys();
                    const nums = keys.map(k => k.match(/^kts-uren-v(\d+)$/))
                        .filter(Boolean).map(m => parseInt(m[1]))
                        .sort((a, b) => b - a);
                    if (nums.length > 0) versie = nums[0];
                }
                if (!versie) {
                    const txt = await (await fetch('sw.js', { cache: 'no-store' })).text();
                    const m = txt.match(/kts-uren-v(\d+)/);
                    if (m) versie = parseInt(m[1]);
                }
                if (versie) el.textContent = versie;
            } catch (e) { /* fallback-tekst in de HTML blijft staan */ }
        })();

        // Auto-grow fallback voor tekstvakken in browsers zonder CSS
        // field-sizing (o.a. Safari). Chrome/Edge regelen dit via de
        // CSS-regel `textarea { field-sizing: content }` in base.css.
        // Globale delegate zodat ook dynamisch gerenderde textareas meedoen.
        (function initTextareaAutoGrow() {
            if (window.CSS && CSS.supports && CSS.supports('field-sizing', 'content')) return;
            document.addEventListener('input', function(e) {
                const t = e.target;
                if (!t || t.tagName !== 'TEXTAREA') return;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight + 2, window.innerHeight * 0.4) + 'px';
            });
        })();

        // ============================================================
        // THEME (Licht / Donker / Systeem) · vergelijkbaar met Windows
        // Opslag in localStorage: 'light' | 'dark' | 'auto' (default = auto)
        // ============================================================
        function getThemePref() {
            // Default = 'dark' · gebruikers kunnen via Profiel → Weergave wisselen
            // naar Licht of Systeem. Eerdere keuze blijft gerespecteerd.
            return localStorage.getItem('kts-theme') || 'dark';
        }
        function resolveTheme(pref) {
            if (pref === 'light' || pref === 'dark') return pref;
            // auto: volg systeem
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
                ? 'dark' : 'light';
        }
        function applyTheme(pref) {
            const resolved = resolveTheme(pref);
            document.documentElement.setAttribute('data-theme', resolved);
            // Update segmented control in profiel (indien aanwezig)
            document.querySelectorAll('.app-theme-btn[data-theme-pref]').forEach(btn => {
                btn.classList.toggle('is-active', btn.dataset.themePref === pref);
            });
        }
        function setTheme(pref) {
            if (!['light', 'dark', 'auto'].includes(pref)) pref = 'auto';
            localStorage.setItem('kts-theme', pref);
            applyTheme(pref);
        }
        // Init bij laden + listener voor systeem-wijzigingen (alleen relevant in auto)
        (function initTheme() {
            applyTheme(getThemePref());
            if (window.matchMedia) {
                const mq = window.matchMedia('(prefers-color-scheme: dark)');
                const onChange = () => { if (getThemePref() === 'auto') applyTheme('auto'); };
                if (mq.addEventListener) mq.addEventListener('change', onChange);
                else if (mq.addListener) mq.addListener(onChange); // Safari legacy
            }
        })();

        // ============================================================
        // LOGIN APP TOGGLE · Uren ↔ Inspectie keuze op login-scherm
        // Onthoudt laatste keuze; bij login navigeren we naar de juiste tab.
        // ============================================================
        function getLoginAppPref() {
            return localStorage.getItem('kts-login-app') || 'uren';
        }
        function switchLoginApp(app) {
            if (app !== 'uren' && app !== 'inspectie') app = 'uren';
            localStorage.setItem('kts-login-app', app);
            // Active state op knoppen
            document.querySelectorAll('.login-app-toggle button[data-login-app]').forEach(btn => {
                const isActive = btn.dataset.loginApp === app;
                btn.classList.toggle('active', isActive);
                btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });
            // Label bovenaan formulier
            const label = document.getElementById('login-app-label');
            // Label toont altijd de merknaam · de toggle-knoppen zelf maken de modus al duidelijk
            if (label) label.textContent = 'KTS Uren & Inspecties App';
        }
        // Init bij laden · herstel laatste keuze
        (function initLoginApp() {
            // Wacht tot DOM klaar is voor het geval het script bovenaan staat
            const apply = () => switchLoginApp(getLoginAppPref());
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', apply);
            } else {
                apply();
            }
        })();

        function openWeekDefaults() {
            document.getElementById('user-menu').style.display = 'none';
            const defaults = getWeekDefaults();
            const container = document.getElementById('weekdefaults-days');
            container.innerHTML = defaults.map((d, i) => {
                const isWeekend = i >= 5;
                const dis = !d.active ? 'disabled' : '';
                return `
                <div style="padding:10px 0;border-bottom:1px solid var(--border);${isWeekend ? 'opacity:0.6' : ''}">
                    <div style="display:flex;align-items:center;gap:8px">
                        <label style="width:40px;font-size:0.9rem;font-weight:600;display:flex;align-items:center;gap:4px">
                            <input type="checkbox" style="width:18px;height:18px" ${d.active ? 'checked' : ''} onchange="document.querySelectorAll('.wd-row-${i} select,.wd-row-${i} input').forEach(el=>{if(el.type!=='checkbox')el.disabled=!this.checked})">
                            ${DAYS_FULL[i].substring(0,2)}
                        </label>
                        <div class="wd-row-${i}" style="display:flex;gap:5px;align-items:center;flex:1">
                            <select ${dis} style="padding:8px 6px;border:2px solid var(--app-line);border-radius:8px;font-size:0.9rem;flex:1;min-width:0" data-field="start" data-day="${i}">
                                <option value="">—</option>
                                ${generateTimeOptions(d.start)}
                            </select>
                            <span style="color:var(--muted);font-size:0.8rem">–</span>
                            <select ${dis} style="padding:8px 6px;border:2px solid var(--app-line);border-radius:8px;font-size:0.9rem;flex:1;min-width:0" data-field="end" data-day="${i}">
                                <option value="">—</option>
                                ${generateTimeOptions(d.end)}
                            </select>
                            <select ${dis} style="padding:8px 6px;border:2px solid var(--app-line);border-radius:8px;font-size:0.9rem;min-width:0" data-field="breakMin" data-day="${i}">
                                <option value="0" ${d.breakMin===0?'selected':''}>0:00</option>
                                <option value="15" ${d.breakMin===15?'selected':''}>0:15</option>
                                <option value="30" ${d.breakMin===30?'selected':''}>0:30</option>
                                <option value="45" ${d.breakMin===45?'selected':''}>0:45</option>
                                <option value="60" ${d.breakMin===60?'selected':''}>1:00</option>
                                <option value="90" ${d.breakMin===90?'selected':''}>1:30</option>
                            </select>
                        </div>
                    </div>
                    ${(userHasThuiswerk() || userHasHotel()) ? `<div class="wd-row-${i}" style="display:flex;gap:12px;margin-left:44px;margin-top:4px">
                        ${userHasThuiswerk() ? `<label style="display:flex;align-items:center;gap:4px;font-size:0.75rem;color:${d.thuiswerk?'#059669':'var(--muted)'};white-space:nowrap;font-weight:${d.thuiswerk?'600':'400'}"><input type="checkbox" ${d.thuiswerk?'checked':''} ${dis} data-field="thuiswerk" data-day="${i}"> 🏠 Thuis</label>` : ''}
                        ${userHasHotel() ? `<label style="display:flex;align-items:center;gap:4px;font-size:0.75rem;color:${d.hotel?'var(--kts-blue)':'var(--muted)'};white-space:nowrap;font-weight:${d.hotel?'600':'400'}"><input type="checkbox" ${d.hotel?'checked':''} ${dis} data-field="hotel" data-day="${i}"> 🏨 Hotel</label>` : ''}
                    </div>` : ''}
                </div>`;
            }).join('');
            document.getElementById('weekdefaults-modal').classList.add('active');
        }

        async function saveWeekDefaults() {
            const defaults = [];
            for (let i = 0; i < 7; i++) {
                const checkbox = document.querySelector(`.wd-row-${i}`).parentElement.querySelector('input[type=checkbox]');
                const start = document.querySelector(`[data-field="start"][data-day="${i}"]`).value;
                const end = document.querySelector(`[data-field="end"][data-day="${i}"]`).value;
                const breakMin = parseInt(document.querySelector(`[data-field="breakMin"][data-day="${i}"]`).value) || 0;
                const thuiswerkEl = document.querySelector(`[data-field="thuiswerk"][data-day="${i}"]`);
                const hotelEl = document.querySelector(`[data-field="hotel"][data-day="${i}"]`);
                defaults.push({
                    start, end, breakMin,
                    active: checkbox.checked,
                    thuiswerk: thuiswerkEl ? thuiswerkEl.checked : false,
                    hotel: hotelEl ? hotelEl.checked : false
                });
            }
            localStorage.setItem(getWeekDefaultsKey(), JSON.stringify(defaults));
            closeModal('weekdefaults-modal');

            // Pas defaults toe op de huidige week als die nog niet opgeslagen is in Supabase
            if (getSupabase() && currentUser && currentUser.id && currentProject) {
                const weekStart = getDateForDayIndex(0);
                const weekEnd = getDateForDayIndex(6);
                const { data: entries } = await getSupabase()
                    .from('time_entries')
                    .select('id')
                    .eq('user_id', currentUser.id)
                    .eq('project_id', currentProject.id)
                    .gte('entry_date', weekStart)
                    .lte('entry_date', weekEnd)
                    .limit(1);

                if (!entries || entries.length === 0) {
                    // Geen opgeslagen data voor deze week · pas nieuwe defaults toe
                    weekData = defaultWeekData();
                    markDirty();
                    renderDays();
                    showToast('✓ Standaard werkweek opgeslagen & toegepast op huidige week');
                    return;
                }
            }

            showToast('✓ Standaard werkweek opgeslagen');
        }

        // ===== KLOK IN/UIT =====
        let clockTimerInterval = null;

        function getClockKey() {
            return 'kts-clock-' + (currentUser ? currentUser.id : 'anon');
        }

        function getClockState() {
            try {
                const stored = localStorage.getItem(getClockKey());
                if (stored) return JSON.parse(stored);
            } catch (e) {
                console.warn('getClockState: corrupt localStorage, klok-state verloren:', e.message);
            }
            return null;
        }

        function getTodayDayIndex() {
            const today = new Date();
            const todayStr = toLocalDateStr(today);
            // Check of vandaag in de huidige week valt
            for (let i = 0; i < 7; i++) {
                const d = new Date(currentWeekMonday);
                d.setDate(d.getDate() + i);
                if (toLocalDateStr(d) === todayStr) return i;
            }
            return -1; // vandaag valt niet in deze week
        }

        function toggleClock() {
            const state = getClockState();
            if (state && state.clockedIn) {
                clockOut();
            } else {
                clockIn();
            }
        }

        function clockIn() {
            const dayIdx = getTodayDayIndex();
            if (dayIdx === -1) {
                showToast('⚠️ Vandaag valt niet in deze week');
                return;
            }
            const now = new Date();
            const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

            // Sla starttijd op in weekData
            weekData[dayIdx].start = timeStr;
            markDirty();

            // Sla klokstatus op
            localStorage.setItem(getClockKey(), JSON.stringify({
                clockedIn: true,
                startTime: now.getTime(),
                dayIndex: dayIdx,
                timeStr: timeStr
            }));

            expandedDay = dayIdx;
            renderDays();
            updateClockUI();
            showToast('✓ Ingeklokt om ' + timeStr);
        }

        function clockOut() {
            const state = getClockState();
            if (!state || !state.clockedIn) return;

            const now = new Date();
            const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
            const dayIdx = state.dayIndex;

            // Sla eindtijd op in weekData als de dag nog in huidige week zit
            if (dayIdx >= 0 && dayIdx < 7) {
                weekData[dayIdx].end = timeStr;
                // Herbereken uren
                if (weekData[dayIdx].start) {
                    const [sh, sm] = weekData[dayIdx].start.split(':').map(Number);
                    const [eh, em] = timeStr.split(':').map(Number);
                    const werkMin = (eh * 60 + em) - (sh * 60 + sm);
                    if (werkMin > 0) {
                        weekData[dayIdx].hours = Math.max(0, (werkMin - weekData[dayIdx].breakMin) / 60);
                    }
                }
                markDirty();
                expandedDay = dayIdx;
                renderDays();
            }

            // Wis klokstatus
            localStorage.removeItem(getClockKey());
            updateClockUI();
            showToast('✓ Uitgeklokt om ' + timeStr);
        }

        function updateClockUI() {
            const btn = document.getElementById('clock-btn');
            const label = document.getElementById('clock-label');
            const wrap = document.getElementById('clock-wrap');
            if (!btn || !label || !wrap) return;

            const state = getClockState();
            const dayIdx = getTodayDayIndex();

            // Verberg klok als vandaag niet in deze week zit, week niet bewerkbaar, of historisch
            const weekStatus = getWeekStatus();
            if (dayIdx === -1 || weekSummary || !weekStatus.editable) {
                wrap.style.display = 'none';
                stopClockTimer();
                return;
            }
            wrap.style.display = '';

            if (state && state.clockedIn) {
                btn.classList.add('clocked-in');
                startClockTimer(state.startTime);
            } else {
                btn.classList.remove('clocked-in');
                label.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:6px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Inklokken';
                stopClockTimer();
            }
        }

        function startClockTimer(startTime) {
            stopClockTimer();
            function update() {
                const label = document.getElementById('clock-label');
                if (!label) return;
                const elapsed = Date.now() - startTime;
                const hrs = Math.floor(elapsed / 3600000);
                const mins = Math.floor((elapsed % 3600000) / 60000);
                const secs = Math.floor((elapsed % 60000) / 1000);
                label.innerHTML = '🔴 Ingeklokt <span class="clock-timer">' +
                    hrs.toString().padStart(2, '0') + ':' +
                    mins.toString().padStart(2, '0') + ':' +
                    secs.toString().padStart(2, '0') + '</span>';
            }
            update();
            clockTimerInterval = setInterval(update, 1000);
        }

        function stopClockTimer() {
            if (clockTimerInterval) {
                clearInterval(clockTimerInterval);
                clockTimerInterval = null;
            }
        }

        // ===== DEBOUNCE HELPER =====
        function debounce(fn, delay) {
            let timer;
            return function(...args) {
                clearTimeout(timer);
                timer = setTimeout(() => fn.apply(this, args), delay);
            };
        }

        // Debounced versie van renderDays · voor tekst-inputs (desc, location)
        const renderDaysDebounced = debounce(() => renderDays(), 300);

        // Debounced versies van admin-zoekvelden (250ms) · voorkomt render-spam
        // bij snel typen in zoekvelden met 100+ rijen
        const filterAdminListDebounced = debounce((type) => filterAdminList(type), 250);
        const adminSearchInvoicesDebounced = debounce((val) => adminSearchInvoices(val), 250);
        const adminRenderListViewDebounced = debounce(() => adminRenderListView(), 250);

        // Debounced auto-save naar localStorage bij elke wijziging
        const autoSaveLocalDebounced = debounce(() => {
            if (typeof saveWeekLocal === 'function') saveWeekLocal();
        }, 2000);

        // ===== STATE =====
        function defaultWeekData() {
            const kmEnkel = getUserKmEnkel();
            const kmRetour = getUserKmRetour();
            const defaults = getWeekDefaults();
            return defaults.map((d, i) => {
                if (!d.active || !d.start || !d.end) {
                    return { start: '', end: '', breakMin: 0, desc: '', location: '', km: 0, kmHeen: 0, kmTerug: 0, hotel: false, thuiswerk: false, hours: 0, dayOff: false };
                }
                const [sh,sm] = d.start.split(':').map(Number);
                const [eh,em] = d.end.split(':').map(Number);
                const werkMin = Math.max(0, (eh*60+em) - (sh*60+sm));
                const effectiveBreak = Math.min(d.breakMin, werkMin);
                const hours = Math.max(0, (werkMin - effectiveBreak) / 60);
                const isThuiswerk = d.thuiswerk || false;
                const isHotel = !isThuiswerk && (d.hotel || false);

                // Km-logica op basis van thuiswerk/hotel
                let km = kmRetour, kmH = kmEnkel, kmT = kmEnkel;
                if (isThuiswerk) {
                    km = 0; kmH = 0; kmT = 0;
                } else if (isHotel) {
                    const prevHotel = i > 0 && defaults[i-1].hotel && !defaults[i-1].thuiswerk;
                    kmH = prevHotel ? KM_HOTEL_PROJECT : kmEnkel;
                    kmT = KM_PROJECT_HOTEL;
                    km = kmH + kmT;
                }

                // Auto-invul locatie
                let loc = '';
                if (isThuiswerk) {
                    loc = 'Thuis';
                } else if (currentProject && currentProject.default_location) {
                    loc = currentProject.default_location;
                }

                // Auto-invul werkzaamheden beschrijving
                let desc = '';
                if (currentProject && currentProject.default_description) {
                    desc = currentProject.default_description;
                }

                return {
                    start: d.start, end: d.end, breakMin: effectiveBreak,
                    desc: desc, location: loc, km: km, kmHeen: kmH, kmTerug: kmT,
                    hotel: isHotel, thuiswerk: isThuiswerk, hours: hours, dayOff: false
                };
            });
        }

        let weekData = defaultWeekData();
        // Snapshot van weekData zoals het laatst uit de DB is geladen. Wordt gebruikt
        // bij saveWeekToSupabase om alleen GEWIJZIGDE dagen te schrijven · voorkomt
        // dat default-waarden de admin-data overschrijven wanneer een zzp inlogt
        // zonder een dag aan te raken. NULL = nog niet geladen (fresh sessie).
        let weekDataLoaded = null;
        let expandedDay = -1;
        let weekDataDirty = false; // track unsaved changes
        let weekOpmerkingen = ''; // opmerkingen bij de weekstaat

        // Waarschuw bij browser sluiten/refresh als er onopgeslagen wijzigingen zijn
        window.addEventListener('beforeunload', function(e) {
            if (weekDataDirty) {
                e.preventDefault();
                e.returnValue = 'Je hebt onopgeslagen wijzigingen. Weet je zeker dat je wilt afsluiten?';
                return e.returnValue;
            }
        });

        // Visuele feedback voor onopgeslagen wijzigingen
        function markDirty() {
            weekDataDirty = true;
            const btn = document.querySelector('#save-uren-btn-wrap .btn');
            if (btn) {
                btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:8px"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>Week opslaan <span style="display:inline-block;width:8px;height:8px;background:#f59e0b;border-radius:50%;margin-left:6px;vertical-align:middle"></span>';
            }
        }
        function markClean() {
            weekDataDirty = false;
            const btn = document.querySelector('#save-uren-btn-wrap .btn');
            if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:8px"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>Week opslaan';
        }

        // Conflict-detectie: communicatie tussen tabs
        const tabChannel = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('kts-uren-sync') : null;

        // Stuur melding naar andere tabs na opslaan
        function notifyOtherTabs() {
            if (tabChannel && currentUser) {
                tabChannel.postMessage({
                    type: 'saved',
                    userId: currentUser.id,
                    weekNumber: currentWeekNumber,
                    year: currentYear,
                    timestamp: Date.now()
                });
            }
        }

        // Luister naar saves van andere tabs
        if (tabChannel) {
            tabChannel.onmessage = function(event) {
                const msg = event.data;
                if (msg.type === 'saved' && currentUser && msg.userId === currentUser.id
                    && msg.weekNumber === currentWeekNumber && msg.year === currentYear) {
                    if (weekDataDirty) {
                        // Andere tab heeft dezelfde week opgeslagen terwijl wij onopgeslagen wijzigingen hebben
                        showToast('⚠️ Week ' + currentWeekNumber + ' is in een ander tabblad opgeslagen · herlaad om actuele data te zien');
                    } else {
                        // Geen lokale wijzigingen: automatisch herladen
                        loadWeekFromSupabase();
                        showToast('🔄 Data bijgewerkt vanuit ander tabblad');
                    }
                }
            };
        }

        let expEntries = [];
        let expNextId = 1;

        // Categorieen voor extra kosten / declaraties.
        // Volgorde matcht de UI dropdown: meest voorkomend eerst, "Overig" als laatste.
        const catIcons = {
            transport:    '🚌',
            parkeren:     '🅿️',
            maaltijd:     '🍽️',  // alias 'meals' (oude waarde) blijft werken via fallback
            meals:        '🍽️',
            materiaal:    '🔧',
            huur:         '🏗️',
            tolheffing:   '🛣️',
            veerboot:     '⛴️',
            doorbelasting:'💸',
            hotel:        '🏨',
            other:        '📦'
        };
        const catLabels = {
            transport:    'Transport',
            parkeren:     'Parkeren',
            maaltijd:     'Maaltijd',
            meals:        'Maaltijd',  // backwards-compat: oude rijen met cat='meals'
            materiaal:    'Materiaal',
            huur:         'Huur',
            tolheffing:   'Tolheffingen',
            veerboot:     'Veerboot',
            doorbelasting:'Doorbelasting',
            hotel:        'Hotel',
            other:        'Overig'
        };

        function fmt(n) {
            // Toon uren als decimaal met komma en 2 decimalen (bijv. 11,75 of 8,00).
            // 2 decimalen voorkomt dat kwartieren (0,25/0,75) verkeerd worden afgerond
            // naar 0,3/0,8 in de weergave. Heel-uren krijgen ',00' voor consistentie
            // met euro-bedragen (€ 12,00).
            if (n === 0) return '0';
            return n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        function fmtDecimal(n) { return n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
        function fmtEuro(n) { return '€ ' + n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

        // ===== PDF BESTANDSNAAM HELPERS =====
        // Naming-conventie (mei 2026):
        //   Weekstaat:   {PROJ}_{DDMMYYYY}_Weekstaat_W{wk}_{naam}.pdf
        //   Inkooporder: {PROJ}-{DDMMYYYY}_Inkooporder_W{wk}_{leverancier}.pdf
        //                (- na PROJ, want dat samen vormt het IO-nummer)
        //   Factuur:     {factuurnum}_{klant}.pdf
        function ktsSlug(s) {
            return (s || '').trim()
                .replace(/[^a-zA-Z0-9-_ ]/g, '')   // strip rare chars
                .replace(/\s+/g, '_')               // spaces → underscore
                .replace(/_+/g, '_');               // collapse underscores
        }
        // DDMMYYYY voor de huidige datum (of een gegeven Date)
        function ktsDateStamp(d) {
            d = d || new Date();
            return String(d.getDate()).padStart(2,'0')
                + String(d.getMonth()+1).padStart(2,'0')
                + d.getFullYear();
        }
        function ktsWeekstaatName(year, week, userName, projectCode, dateStr) {
            const wk = String(week).padStart(2, '0');
            const ddmm = dateStr || ktsDateStamp();
            const proj = ktsSlug(projectCode || '') || 'KTS';
            const userSlug = ktsSlug(userName || '');
            return `${proj}_${ddmm}_Weekstaat_W${wk}${userSlug ? '_' + userSlug : ''}.pdf`;
        }
        function ktsInkooporderName(year, week, projCode, supplierName, dateStr) {
            const wk = String(week).padStart(2, '0');
            const ddmm = dateStr || ktsDateStamp();
            const proj = ktsSlug(projCode || '') || 'KTS';
            const supSlug = ktsSlug(supplierName || '');
            return `${proj}-${ddmm}_Inkooporder_W${wk}${supSlug ? '_' + supSlug : ''}.pdf`;
        }
        function ktsFactuurName(factuurNum, clientName) {
            const slug = ktsSlug(clientName || '');
            return `${factuurNum}${slug ? '_' + slug : ''}.pdf`;
        }
        function todayLabel() {
            const d = new Date();
            const days = ['zo','ma','di','wo','do','vr','za'];
            const months = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
            return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
        }

        // ===== KM SECTION HELPER =====
        function renderKmSection(entry, i) {
            // Geen km-sectie tonen als project geen km-vergoeding heeft
            if (!userHasKm()) return '';

            if (entry.hotel) {
                const prevHotel = i > 0 && weekData[i-1].hotel;
                const heenLabel = prevHotel ? 'Hotel → Project' : 'Thuis → Project';
                const terugLabel = 'Project → Hotel';
                const heenVal = entry.kmHeen || 0;
                const terugVal = entry.kmTerug || 0;
                const totKm = heenVal + terugVal;
                return `<div style="background:var(--app-bg-tint);border:1px solid var(--border);border-radius:10px;padding:12px 14px">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                        <div style="font-size:1.1rem">🚗</div>
                        <div style="font-size:0.75rem;font-weight:600;color:var(--muted)">Kilometers (heen + terug)</div>
                    </div>
                    <div style="display:flex;gap:10px;margin-bottom:8px">
                        <div style="flex:1">
                            <div style="font-size:0.65rem;font-weight:600;color:var(--kts-accent-light);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">↗ ${heenLabel}</div>
                            <div style="display:flex;align-items:center;gap:6px">
                                <input type="number" value="${heenVal}" style="width:70px;padding:6px 10px;border:1px solid var(--app-line-strong);border-radius:6px;font-size:16px;font-weight:600;background:var(--app-surface);color:var(--app-ink-900)" onchange="updateEntry(${i},'kmHeen',this.value)">
                                <span style="font-size:0.75rem;color:var(--app-ink-500)">km</span>
                            </div>
                        </div>
                        <div style="flex:1">
                            <div style="font-size:0.65rem;font-weight:600;color:var(--kts-accent-light);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">↗ ${terugLabel}</div>
                            <div style="display:flex;align-items:center;gap:6px">
                                <input type="number" value="${terugVal}" style="width:70px;padding:6px 10px;border:1px solid var(--app-line-strong);border-radius:6px;font-size:16px;font-weight:600;background:var(--app-surface);color:var(--app-ink-900)" onchange="updateEntry(${i},'kmTerug',this.value)">
                                <span style="font-size:0.75rem;color:var(--muted)">km</span>
                            </div>
                        </div>
                    </div>
                    <div style="font-size:0.8rem;color:var(--muted);padding-top:6px;border-top:1px solid var(--border)">Totaal: <strong>${totKm} km</strong> · ${fmtEuro(totKm * KM_RATE)}</div>
                </div>`;
            }
            // Geen hotel: enkel km-veld
            return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--app-bg-tint);border:1px solid var(--border);border-radius:10px">
                <div style="font-size:1.1rem">🚗</div>
                <div style="flex:1">
                    <div style="font-size:0.75rem;font-weight:600;color:var(--muted);margin-bottom:4px">Kilometers${entry.thuiswerk ? ' (optioneel; bijv. spullen halen of afspraak)' : ' (retour thuis ↔ project)'}</div>
                    <input type="number" value="${entry.km||0}" style="width:80px;padding:6px 10px;border:1px solid var(--app-line-strong);border-radius:6px;font-size:16px;font-weight:600;background:var(--app-surface);color:var(--app-ink-900)" onchange="updateEntry(${i},'km',this.value)">
                    <span style="font-size:0.8rem;color:var(--muted);margin-left:6px">km · ${fmtEuro((entry.km||0) * KM_RATE)}</span>
                </div>
            </div>`;
        }

        // ===== WEEK SUMMARY RENDER (historische data) =====
        function renderWeekSummary(container) {
            const s = weekSummary;
            const hoursAmt = parseFloat(s.hours_amount) || 0;
            const kmAmt = parseFloat(s.km_amount) || 0;
            const hotelAmt = parseFloat(s.hotel_amount) || 0;
            const totalAmt = hoursAmt + kmAmt + hotelAmt;

            container.innerHTML = `
                <div style="background:var(--app-surface);border:2px solid var(--kts-blue);border-radius:16px;padding:20px;margin-bottom:12px">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
                        <div style="width:40px;height:40px;border-radius:10px;background:var(--kts-blue);color:white;display:flex;align-items:center;justify-content:center;font-size:1.1rem">📋</div>
                        <div>
                            <div style="font-weight:700;font-size:1rem;color:var(--kts-blue)">${s.invoice_no ? 'Factuur ' + s.invoice_no : 'Weektotaal'}</div>
                            <div style="font-size:0.75rem;color:var(--muted)">Week ${s.week_number} · ${s.invoice_ref || currentProject?.name || ''}</div>
                        </div>
                        <div style="margin-left:auto;background:var(--green);color:white;padding:3px 10px;border-radius:20px;font-size:0.7rem;font-weight:700;text-transform:uppercase">${s.status}</div>
                    </div>

                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
                        <div style="background:var(--app-surface);padding:12px;border-radius:10px;text-align:center">
                            <div style="font-size:1.3rem;font-weight:700;color:var(--kts-blue)">${fmt(parseFloat(s.total_hours))}</div>
                            <div style="font-size:0.7rem;color:var(--muted);font-weight:600">Uren</div>
                        </div>
                        <div style="background:var(--app-surface);padding:12px;border-radius:10px;text-align:center">
                            <div style="font-size:1.3rem;font-weight:700;color:var(--kts-blue)">${(s.total_km || 0).toLocaleString('nl-NL')}</div>
                            <div style="font-size:0.7rem;color:var(--muted);font-weight:600">Kilometers</div>
                        </div>
                        ${s.hotel_nights > 0 ? `
                        <div style="background:var(--app-surface);padding:12px;border-radius:10px;text-align:center">
                            <div style="font-size:1.3rem;font-weight:700;color:var(--kts-blue)">${s.hotel_nights}</div>
                            <div style="font-size:0.7rem;color:var(--muted);font-weight:600">Hotelnachten</div>
                        </div>` : ''}
                        <div style="background:var(--app-surface);padding:12px;border-radius:10px;text-align:center">
                            <div style="font-size:1.3rem;font-weight:700;color:var(--kts-blue)">${fmtEuro(parseFloat(s.hourly_rate))}/u</div>
                            <div style="font-size:0.7rem;color:var(--muted);font-weight:600">Tarief</div>
                        </div>
                    </div>

                    <div style="background:var(--app-surface);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:6px">
                        <div style="display:flex;justify-content:space-between;font-size:0.85rem">
                            <span style="color:var(--muted)">Uren (${fmt(parseFloat(s.total_hours))} × ${fmtEuro(parseFloat(s.hourly_rate))})</span>
                            <span style="font-weight:600">${fmtEuro(hoursAmt)}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;font-size:0.85rem">
                            <span style="color:var(--muted)">Km (${(s.total_km||0).toLocaleString('nl-NL')} × ${fmtEuro(parseFloat(s.km_rate))})</span>
                            <span style="font-weight:600">${fmtEuro(kmAmt)}</span>
                        </div>
                        ${hotelAmt > 0 ? `<div style="display:flex;justify-content:space-between;font-size:0.85rem">
                            <span style="color:var(--muted)">Hotel (${s.hotel_nights}× ${fmtEuro(parseFloat(s.hotel_rate))})</span>
                            <span style="font-weight:600">${fmtEuro(hotelAmt)}</span>
                        </div>` : ''}
                        <div style="display:flex;justify-content:space-between;font-size:0.95rem;font-weight:700;border-top:1px solid var(--border);padding-top:8px;margin-top:4px">
                            <span>Totaal</span>
                            <span style="color:var(--kts-blue)">${fmtEuro(totalAmt)}</span>
                        </div>
                    </div>

                    <div style="text-align:center;margin-top:14px;font-size:0.7rem;color:var(--muted);font-style:italic">
                        Deze week is geïmporteerd uit factuurdata · alleen-lezen
                    </div>
                </div>`;

            // Update week totaal
            document.getElementById('week-total').textContent = `Totaal: ${fmt(parseFloat(s.total_hours))} uur · ${(s.total_km||0).toLocaleString('nl-NL')} km${s.hotel_nights > 0 ? ' · ' + s.hotel_nights + '× 🏨' : ''}`;
            renderOverview();
        }

