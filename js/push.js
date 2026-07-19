        // =====================================================================
        // PUSHMELDINGEN (admins) · Web Push via service worker + Supabase
        // =====================================================================
        // Admin zet op het Profiel-scherm de toggle 'Pushmeldingen' aan. Het
        // toestel abonneert zich bij de browser-pushdienst en het abonnement
        // wordt opgeslagen in push_subscriptions. Een Supabase Edge Function
        // (send-push) stuurt bij weekstaat ingediend / klant goedgekeurd of
        // afgewezen / inspectie afgerond een melding naar alle admin-toestellen.
        // Vereist eenmalige setup: zie supabase-push-setup.md (lokaal).
        // De publieke VAPID-sleutel hieronder is bedoeld om openbaar te zijn.

        const PUSH_VAPID_PUBLIC = 'BBNAJJsOIqRgiaGVLaXpQ9zYH51PVbq0fn398oVEcDBIWyFB4uz8_zW8fm79Mgb1FmOW34xAN2aEJpcxJzz3tFM';

        function _pushB64ToUint8(base64) {
            const padding = '='.repeat((4 - base64.length % 4) % 4);
            const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
            const arr = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
            return arr;
        }

        function pushSupported() {
            return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
        }

        // Toon de meldingen-rij op het Profiel-scherm (alleen admins, alleen als
        // de browser het ondersteunt) en zet de toggle op de huidige stand.
        async function initPushRow() {
            const row = document.getElementById('pf-push-row');
            if (!row) return;
            const isAdmin = currentUser && currentUser.role === 'admin';
            if (!isAdmin || !pushSupported()) { row.style.display = 'none'; return; }
            row.style.display = '';
            const toggle = document.getElementById('push-toggle');
            if (!toggle) return;
            try {
                const reg = await navigator.serviceWorker.ready;
                const sub = await reg.pushManager.getSubscription();
                toggle.checked = !!sub && Notification.permission === 'granted';
            } catch (e) { toggle.checked = false; }
        }

        async function pushToggle(aan) {
            const toggle = document.getElementById('push-toggle');
            try {
                if (aan) {
                    const perm = await Notification.requestPermission();
                    if (perm !== 'granted') {
                        if (toggle) toggle.checked = false;
                        showToast('⚠️ Meldingen geweigerd · zet ze aan via de browser-instellingen van deze site');
                        return;
                    }
                    const reg = await navigator.serviceWorker.ready;
                    let sub = await reg.pushManager.getSubscription();
                    if (!sub) {
                        sub = await reg.pushManager.subscribe({
                            userVisibleOnly: true,
                            applicationServerKey: _pushB64ToUint8(PUSH_VAPID_PUBLIC)
                        });
                    }
                    const keys = sub.toJSON().keys || {};
                    const sb = getSupabase();
                    const { error } = await sb.from('push_subscriptions').upsert({
                        user_id: currentUser.id,
                        endpoint: sub.endpoint,
                        p256dh: keys.p256dh,
                        auth: keys.auth
                    }, { onConflict: 'endpoint' });
                    if (error) throw error;
                    showToast('🔔 Pushmeldingen aan op dit toestel');
                } else {
                    const reg = await navigator.serviceWorker.ready;
                    const sub = await reg.pushManager.getSubscription();
                    if (sub) {
                        const sb = getSupabase();
                        await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
                        await sub.unsubscribe();
                    }
                    showToast('🔕 Pushmeldingen uit op dit toestel');
                }
            } catch (e) {
                if (toggle) toggle.checked = !aan;
                if (/push_subscriptions/.test((e && e.message) || '')) {
                    showToast('⚠️ Tabel ontbreekt · draai eerst migratie-push-subscriptions.sql');
                } else {
                    showToast('⚠️ Meldingen instellen mislukt: ' + (typeof friendlyError === 'function' ? friendlyError(e) : (e && e.message) || e));
                }
            }
        }
