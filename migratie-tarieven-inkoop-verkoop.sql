-- ============================================================
-- Migratie: tarieven-scheiding inkoop vs verkoop
-- Datum: 2026-05-04
--
-- Probleem: één hourly_rate werd zowel voor inkooporder (KTS → zzp)
-- als factuur (KTS → klant) gebruikt. Bij detachering naar bv. Levvel
-- factureer je een hoger tarief richting klant dan je de zzp betaalt.
-- Het verkoop-tarief mag de zzp NOOIT zien.
--
-- Oplossing: extra kolom hourly_rate_sale (verkoop-tarief). Bestaande
-- hourly_rate blijft het inkoop-tarief (= wat KTS de zzp betaalt).
-- ============================================================

BEGIN;

-- 1) Nieuwe kolom toevoegen — nullable zodat we backwards compatible zijn.
--    Als hourly_rate_sale NULL is wordt automatisch hourly_rate gebruikt
--    als fallback (admin moet expliciet een verkoop-tarief invullen
--    voor klanten waar dat afwijkt van het inkoop-tarief).
ALTER TABLE rates
    ADD COLUMN IF NOT EXISTS hourly_rate_sale numeric(10, 2);

COMMENT ON COLUMN rates.hourly_rate IS
    'Inkoop-tarief: wat KTS de zzp/leverancier betaalt per uur. Verschijnt op inkooporder.';
COMMENT ON COLUMN rates.hourly_rate_sale IS
    'Verkoop-tarief: wat KTS aan eindklant factureert per uur. Verschijnt op factuur. Alleen zichtbaar voor admin (zzp mag dit niet zien). NULL = gebruik hourly_rate als fallback.';

-- 2) RLS-policies: zzp's mogen hourly_rate_sale NIET zien.
--    We hebben hier een dilemma: Supabase RLS werkt op rij-niveau, niet
--    op kolom-niveau. Voor kolom-scheiding kun je:
--    (a) een view maken die hourly_rate_sale verbergt voor niet-admins
--    (b) of: client-side filtering combineren met admin-only RPC's voor
--        verkoop-data ophalen.
--
--    We kiezen (a) — een rates_public view zonder hourly_rate_sale.
--    Niet-admins gebruiken die view. Admins gebruiken de echte tabel.

CREATE OR REPLACE VIEW rates_public AS
SELECT
    id,
    project_id,
    user_id,
    function_title,
    hourly_rate,
    km_rate,
    saturday_multiplier,
    sunday_holiday_multiplier,
    valid_from,
    valid_to,
    created_at,
    updated_at
FROM rates;

COMMENT ON VIEW rates_public IS
    'Publieke view zonder hourly_rate_sale. Voor zzp/medewerker queries: SELECT FROM rates_public ipv SELECT FROM rates.';

-- 3) Permissions
GRANT SELECT ON rates_public TO authenticated;

-- Notitie voor handmatig nakijken:
-- - Bestaande hourly_rate-waardes blijven gelijk (dat zijn nu inkoop-tarieven).
-- - hourly_rate_sale start als NULL voor alle bestaande records.
-- - Admin moet daarna handmatig het verkoop-tarief vullen via beheer-UI
--   voor projecten waar dat afwijkt van het inkoop-tarief.
-- - Tot dan gebruikt de factuur-generator de fallback (hourly_rate).

COMMIT;
