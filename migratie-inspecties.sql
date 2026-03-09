-- =============================================
-- KTS Uren App — Inspectie Module
-- Migratie: Tabellen voor inspecties
-- =============================================

-- 1. Inspectie templates (taakplannen / formulieren)
CREATE TABLE IF NOT EXISTS inspection_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,                          -- bijv. "Specialistisch onderhoud motor L1"
    description TEXT,                            -- uitgebreide beschrijving
    category TEXT DEFAULT 'algemeen',            -- commissioning, onderhoud, keuring, veiligheid

    -- Locatie / installatie context
    location TEXT,                               -- bijv. "Pompgroepen Den Oever"
    installation TEXT,                           -- bijv. "Pompinstallatie (gemaalpomp)"
    asset TEXT,                                  -- bijv. "Gemaalpomp"

    -- Frequentie & planning
    frequency TEXT,                              -- bijv. "1 jaarlijks", "6 maandelijks", "5 jaarlijks"
    frequency_code TEXT,                         -- bijv. "[i]", "[k]", "[g]", "[m]", "[n]", "[q]"

    -- Secties met vragen (JSONB)
    sections JSONB NOT NULL DEFAULT '[]',
    -- Structuur:
    -- [{
    --   "id": "s1",
    --   "title": "Bekabeling",
    --   "questions": [{
    --     "id": "q1",
    --     "text": "Controleren van de bekabeling op uitdroging / scheurvorming",
    --     "type": "ja_nee",          -- ja_nee, goed_matig_slecht, numeriek, tekst, foto, handtekening, selectie, datum
    --     "required": true,
    --     "unit": null,              -- voor numeriek: "°C", "bar", "mm/s", "MΩ", "V", "A"
    --     "options": null,           -- voor selectie: ["optie1", "optie2"]
    --     "condition": null,         -- conditionele logica: {"questionId": "q1", "value": "nee"}
    --     "component": "Aandrijving: Bekabeling",    -- sub-component
    --     "asset_tag": "1.05.1.1.AR-01.186-.1062-",  -- FMECA-code
    --     "manufacturer": "ABB",                      -- fabrikant
    --     "discipline": "IA&E",                       -- WTB, IA&E
    --     "permit_required": false,                   -- vergunning nodig
    --     "norm_reference": null,                     -- ISO norm, MTR referentie
    --     "materials": null,                          -- benodigde materialen
    --     "tools": null,                              -- benodigd gereedschap
    --     "remarks_template": null                    -- standaard opmerking / instructie
    --   }]
    -- }]

    -- Koppeling
    project_id UUID REFERENCES projects(id),     -- NULL = bedrijfsbreed beschikbaar
    is_active BOOLEAN DEFAULT true,
    is_test BOOLEAN DEFAULT false,

    -- Audit
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Uitgevoerde inspecties
CREATE TABLE IF NOT EXISTS inspections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    template_id UUID REFERENCES inspection_templates(id) NOT NULL,
    project_id UUID REFERENCES projects(id),
    user_id UUID REFERENCES auth.users(id) NOT NULL,

    -- Metadata
    inspection_number TEXT,                      -- auto-gegenereerd: INS-2026-0001
    inspection_date DATE NOT NULL DEFAULT CURRENT_DATE,
    location TEXT,                               -- locatie (overgenomen uit template of handmatig)
    installation TEXT,                           -- installatie
    asset TEXT,                                  -- asset
    asset_tag TEXT,                              -- specifiek tag nummer
    description TEXT,                            -- extra beschrijving / opmerkingen

    -- Antwoorden (JSONB)
    answers JSONB NOT NULL DEFAULT '{}',
    -- Structuur:
    -- {
    --   "q1": { "value": "ja", "remark": "Ziet er goed uit", "photos": ["uuid1", "uuid2"] },
    --   "q2": { "value": 22.5, "remark": "Gemeten bij 20°C", "photos": [] },
    --   "q3": { "value": "matig", "remark": "Lichte corrosie", "photos": ["uuid3"] }
    -- }

    -- Status
    status TEXT DEFAULT 'concept',               -- concept, afgerond, goedgekeurd, afgekeurd

    -- Handtekeningen (base64 PNG)
    signature_inspector TEXT,
    signature_client TEXT,
    signer_name TEXT,                            -- naam ondertekenaar opdrachtgever

    -- Samenvatting (berekend bij afronden)
    total_questions INTEGER DEFAULT 0,
    answered_questions INTEGER DEFAULT 0,
    passed_questions INTEGER DEFAULT 0,          -- ja/goed
    failed_questions INTEGER DEFAULT 0,          -- nee/slecht

    -- Timestamps
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Foto's bij inspecties
CREATE TABLE IF NOT EXISTS inspection_photos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    inspection_id UUID REFERENCES inspections(id) ON DELETE CASCADE NOT NULL,
    question_id TEXT,                            -- NULL = bijlage bij hele inspectie
    storage_path TEXT NOT NULL,                  -- pad in Supabase Storage
    thumbnail_path TEXT,                         -- verkleinde versie
    caption TEXT,
    annotations JSONB,                           -- overlay data (pijlen, cirkels, tekst)
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Document nummering voor inspecties
INSERT INTO document_numbers (type, prefix, next_number)
VALUES ('inspection', 'INS', 1)
ON CONFLICT (type) DO NOTHING;

-- =============================================
-- Row Level Security
-- =============================================

ALTER TABLE inspection_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_photos ENABLE ROW LEVEL SECURITY;

-- Templates: admin kan alles, iedereen kan actieve templates lezen
CREATE POLICY "insp_templates_admin_all" ON inspection_templates
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );
CREATE POLICY "insp_templates_read_active" ON inspection_templates
    FOR SELECT USING (is_active = true);

-- Inspecties: admin ziet alles, monteur ziet/bewerkt eigen
CREATE POLICY "insp_admin_all" ON inspections
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );
CREATE POLICY "insp_user_own" ON inspections
    FOR ALL USING (user_id = auth.uid());

-- Foto's: toegang via inspectie-eigenaar of admin
CREATE POLICY "insp_photos_access" ON inspection_photos
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM inspections i
            WHERE i.id = inspection_id
            AND (i.user_id = auth.uid() OR EXISTS (
                SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
            ))
        )
    );

-- =============================================
-- Storage bucket (handmatig aanmaken in Supabase dashboard)
-- Bucket: inspections (private)
-- Structuur: {inspection_id}/{photo_id}.jpg
-- =============================================
