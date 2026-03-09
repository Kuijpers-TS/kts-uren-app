# KTS Inspectie App — Uitgebreid Plan

## 1. Visie & Doelstelling

KTS levert technische dienstverlening: commissioning, onderhoud, inspecties en asset management. Monteurs en engineers werken dagelijks op locatie bij opdrachtgevers en voeren inspecties, keuringen en checks uit. Momenteel worden deze vastgelegd op papier, in Excel, of helemaal niet gestructureerd.

**Doel**: Een digitale inspectie-app waarmee monteurs op locatie checklists doorlopen, foto's toevoegen, bevindingen vastleggen en rapporten genereren — allemaal vanaf hun telefoon.

**Fasering**: Start als admin-tab in de bestaande KTS Uren App, later uitbouwen tot zelfstandige app met eigen URL en eigen navigatie.

---

## 2. Kernfunctionaliteit

### 2.1 Inspectieformulieren (Templates)
De admin stelt inspectieformulieren samen die monteurs in het veld invullen.

**Template builder (admin)**:
- Formuliernaam, beschrijving, categorie (commissioning, onderhoud, keuring, veiligheid)
- Secties met titel (bijv. "Elektrisch", "Mechanisch", "Veiligheid")
- Per sectie: vragen/checkpunten toevoegen
- Vraagtypes:
  - **Ja/Nee/NVT** — standaard inspectievraag met kleurindicatie (groen/rood/grijs)
  - **Goed/Matig/Slecht** — conditiebeoordeling
  - **Numeriek** — meetwaarde met eenheid (°C, bar, mm, V, A, Ω)
  - **Tekst** — vrij tekstveld voor opmerkingen
  - **Foto** — camera of galerij (met optionele annotatie)
  - **Handtekening** — digitale handtekening (canvas)
  - **Selectie** — dropdown met voorgedefinieerde opties
  - **Datum** — datumkiezer
- Verplicht/optioneel markering per vraag
- Standaard opmerking-veld bij elke vraag (optioneel invullen)
- Vragen kunnen afhankelijk zijn van antwoord op vorige vraag (conditionele logica)
- Templates kunnen gekoppeld worden aan specifieke projecten of bedrijfsbreed beschikbaar zijn

### 2.2 Inspectie uitvoeren (monteur)
De monteur opent een inspectie op zijn telefoon, loopt de checklist door, en slaat op.

**Workflow**:
1. Monteur opent "Inspecties" tab (of aparte app)
2. Kiest project + template
3. Vult metadata in: locatie, asset/tag nummer, datum
4. Loopt secties door, beantwoordt vragen
5. Maakt foto's bij bevindingen (direct vanuit de app)
6. Kan tussentijds opslaan (concept)
7. Rondt af → status wordt "afgerond"
8. Optioneel: ondertekening door monteur + opdrachtgever

**Offline support**:
- Inspectie moet volledig offline ingevuld kunnen worden (monteurs werken vaak in fabrieken/kelders zonder bereik)
- Data opslaan in IndexedDB/localStorage
- Automatisch synchroniseren zodra weer online
- Visuele indicator: "⚡ Offline" / "✓ Gesynchroniseerd"

### 2.3 Foto's & Annotaties
- Camera-integratie via `<input type="file" capture="environment">`
- Foto's worden gecomprimeerd (max 1920px breed, JPEG 80%)
- Optionele annotatie: pijlen, cirkels, tekst op de foto tekenen (canvas overlay)
- Foto's gekoppeld aan specifieke vraag of als bijlage bij de hele inspectie
- Opslag: Supabase Storage bucket `inspections`

### 2.4 Rapportage (PDF)
Na afronding kan een PDF-rapport gegenereerd worden.

**Rapport bevat**:
- KTS header (logo, bedrijfsgegevens) — zelfde stijl als weekstaat/factuur
- Inspectie-metadata: datum, locatie, inspecteur, project, asset
- Per sectie: alle vragen met antwoorden
  - Ja/Nee kleurindicatie (✓ groen, ✗ rood)
  - Meetwaarden met eenheid
  - Opmerkingen
- Ingevoegde foto's (verkleind, met bijschrift)
- Samenvatting: totaal vragen, % goedgekeurd, aantal afwijkingen
- Handtekeningen onderaan
- Portrait A4, zelfde opmaak als factuur/IO

### 2.5 Dashboard & Overzicht (admin)
- Lijst van alle inspecties met filters (project, monteur, datum, status, template)
- Status: concept / afgerond / goedgekeurd / afgekeurd
- Zoekfunctie
- Export naar Excel (alle inspecties of gefilterd)
- Statistieken: aantal inspecties per maand, meest voorkomende afwijkingen

---

## 3. Databaseontwerp

### 3.1 Nieuwe tabellen

```sql
-- Inspectie templates (formulieren)
CREATE TABLE inspection_templates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'algemeen',  -- commissioning, onderhoud, keuring, veiligheid
    sections JSONB NOT NULL DEFAULT '[]',
    -- sections structuur:
    -- [{ "title": "Elektrisch", "questions": [
    --   { "id": "q1", "text": "Aarding gecontroleerd?", "type": "ja_nee",
    --     "required": true, "unit": null, "options": null, "condition": null }
    -- ]}]
    project_id UUID REFERENCES projects(id),  -- NULL = bedrijfsbreed
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Uitgevoerde inspecties
CREATE TABLE inspections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    template_id UUID REFERENCES inspection_templates(id) NOT NULL,
    project_id UUID REFERENCES projects(id),
    user_id UUID REFERENCES auth.users(id) NOT NULL,

    -- Metadata
    inspection_date DATE NOT NULL DEFAULT CURRENT_DATE,
    location TEXT,
    asset_tag TEXT,              -- asset/tag nummer
    description TEXT,            -- extra beschrijving

    -- Antwoorden
    answers JSONB NOT NULL DEFAULT '{}',
    -- answers structuur:
    -- { "q1": { "value": "ja", "remark": "Ziet er goed uit", "photos": ["uuid1"] },
    --   "q2": { "value": 22.5, "remark": null, "photos": [] } }

    -- Status
    status TEXT DEFAULT 'concept',  -- concept, afgerond, goedgekeurd, afgekeurd

    -- Handtekeningen
    signature_inspector TEXT,    -- base64 PNG
    signature_client TEXT,       -- base64 PNG
    signer_name TEXT,            -- naam ondertekenaar opdrachtgever

    -- Timestamps
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Foto's bij inspecties
CREATE TABLE inspection_photos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    inspection_id UUID REFERENCES inspections(id) ON DELETE CASCADE NOT NULL,
    question_id TEXT,            -- NULL = bijlage bij hele inspectie
    storage_path TEXT NOT NULL,  -- pad in Supabase Storage
    thumbnail_path TEXT,         -- verkleinde versie
    caption TEXT,
    annotations JSONB,           -- pijlen, cirkels, tekst overlay data
    created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE inspection_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_photos ENABLE ROW LEVEL SECURITY;

-- Templates: admin kan alles, monteur kan lezen
CREATE POLICY "templates_admin_all" ON inspection_templates
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );
CREATE POLICY "templates_user_read" ON inspection_templates
    FOR SELECT USING (is_active = true);

-- Inspecties: admin ziet alles, monteur ziet eigen
CREATE POLICY "inspections_admin_all" ON inspections
    FOR ALL USING (
        EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
    );
CREATE POLICY "inspections_user_own" ON inspections
    FOR ALL USING (user_id = auth.uid());

-- Foto's: via inspectie-eigenaar
CREATE POLICY "photos_via_inspection" ON inspection_photos
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM inspections i
            WHERE i.id = inspection_id
            AND (i.user_id = auth.uid() OR EXISTS (
                SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
            ))
        )
    );
```

### 3.2 Supabase Storage

```
Bucket: inspections (public: false)
Structuur: {inspection_id}/{photo_id}.jpg
Thumbnails: {inspection_id}/thumb_{photo_id}.jpg
Max bestandsgrootte: 5MB per foto
```

---

## 4. Technische Architectuur

### 4.1 Fase 1: Admin-tab in Uren App

Toevoegen aan de bestaande `index.html`:

**HTML**: Nieuwe admin-tegel "🔍 Inspecties" in het tegels-grid, plus een nieuw `admin-inspecties` div met:
- Template-beheer (lijst, aanmaken, bewerken)
- Inspecties-overzicht (lijst, detail, PDF genereren)

**JavaScript**: Nieuwe functies:
- `loadInspectionTemplates()` — templates ophalen en tonen
- `openTemplateEditor(id?)` — template aanmaken/bewerken in modal
- `loadInspections()` — alle inspecties laden met filters
- `showInspectionDetail(id)` — detail van één inspectie
- `generateInspectionPDF(id)` — PDF rapport genereren met jsPDF

**Geschatte omvang**: ~800-1200 regels JavaScript + HTML toevoegen aan index.html

### 4.2 Fase 2: Monteur-interface

Toevoegen aan de bestaande app, zichtbaar voor alle gebruikers:

**Optie A**: Nieuwe tab "Inspecties" in de bottom navigation (naast Uren, Extra, Overzicht)
**Optie B**: Onder "Extra" tab als knop (minder ingrijpend)

**Aanbeveling**: Optie A — eigen tab, want inspecties zijn een primaire activiteit

**Interface**:
- Lijst van eigen inspecties (concept + afgerond)
- "Nieuwe inspectie" knop
- Template kiezen → formulier invullen
- Camera-integratie voor foto's
- Offline opslag met sync

**Geschatte omvang**: ~1500-2000 regels JavaScript + HTML

### 4.3 Fase 3: Aparte App

Wanneer de inspectie-functionaliteit te groot wordt voor index.html:

- Eigen `inspections.html` (of aparte repo `kts-inspectie-app`)
- Gedeelde Supabase backend
- Gedeelde authenticatie (zelfde users tabel)
- Gedeelde componenten: header, toast, modal, PDF-generatie
- Eigen Service Worker en manifest
- Eigen PWA installeerbaar

---

## 5. UI/UX Ontwerp

### 5.1 Template Builder (Admin)

```
┌─────────────────────────────────┐
│ ◀ Terug    Template bewerken    │
├─────────────────────────────────┤
│ Naam: [Commissioning Checklist] │
│ Categorie: [Commissioning  ▾]  │
│ Project: [Alle projecten   ▾]  │
├─────────────────────────────────┤
│ ── Sectie: Elektrisch ── [✎][🗑]│
│                                 │
│ ☐ Aarding gecontroleerd?       │
│   Type: Ja/Nee | Verplicht ✓   │
│                                 │
│ ☐ Isolatieweerstand (MΩ)       │
│   Type: Numeriek | Eenheid: MΩ │
│                                 │
│ [+ Vraag toevoegen]             │
├─────────────────────────────────┤
│ [+ Sectie toevoegen]            │
│                                 │
│ [💾 Opslaan]                    │
└─────────────────────────────────┘
```

### 5.2 Inspectie Invullen (Monteur)

```
┌─────────────────────────────────┐
│ 🔍 Commissioning Checklist      │
│ PWN Heerhugowaard · 9 mrt 2026 │
├─────────────────────────────────┤
│ ▸ Elektrisch          3/5 ✓    │
│ ▸ Mechanisch          0/4      │
│ ▸ Veiligheid          0/3      │
├─────────────────────────────────┤
│ ── Elektrisch ──                │
│                                 │
│ Aarding gecontroleerd?          │
│ [✓ Ja] [✗ Nee] [— NVT]       │
│ Opmerking: [                  ] │
│ [📷 Foto toevoegen]            │
│                                 │
│ Isolatieweerstand               │
│ [____] MΩ                       │
│                                 │
│ ─────────────────────           │
│ [💾 Concept opslaan]            │
│ [✅ Afronden & ondertekenen]    │
└─────────────────────────────────┘
```

### 5.3 Kleurcodes & Visuele Feedback

| Antwoord | Kleur | Indicator |
|----------|-------|-----------|
| Ja / Goed | Groen (#10b981) | ✓ |
| Nee / Slecht | Rood (#ef4444) | ✗ |
| Matig | Oranje (#f59e0b) | ⚠ |
| NVT | Grijs (#94a3b8) | — |
| Niet ingevuld | Lichtgrijs | ○ |

Voortgangsbalk per sectie toont % ingevuld.

---

## 6. Implementatieplan

### Fase 1: Fundament (admin-tab) — ~2-3 sessies

| Stap | Beschrijving | Geschatte regels |
|------|-------------|-----------------|
| 1.1 | Database tabellen aanmaken (SQL migratie) | ~80 regels SQL |
| 1.2 | Admin-tegel "Inspecties" + basis tab-structuur | ~100 regels |
| 1.3 | Template-lijst laden en tonen | ~150 regels |
| 1.4 | Template-editor: secties + vragen CRUD | ~400 regels |
| 1.5 | Inspecties-overzicht (lijst + filters) | ~200 regels |
| 1.6 | Inspectie-detail view (alleen lezen) | ~200 regels |
| 1.7 | PDF-rapport generatie | ~300 regels |

### Fase 2: Monteur-interface — ~2-3 sessies

| Stap | Beschrijving | Geschatte regels |
|------|-------------|-----------------|
| 2.1 | Navigatie-tab toevoegen (4e tab) | ~50 regels |
| 2.2 | Inspectie starten: template kiezen + metadata | ~200 regels |
| 2.3 | Formulier invullen: alle vraagtypes renderen | ~500 regels |
| 2.4 | Camera/foto-integratie + compressie | ~200 regels |
| 2.5 | Opslaan (concept) + afronden | ~150 regels |
| 2.6 | Handtekening-canvas | ~150 regels |
| 2.7 | Offline opslag + sync | ~300 regels |

### Fase 3: Verfijning — ~1-2 sessies

| Stap | Beschrijving |
|------|-------------|
| 3.1 | Conditionele vragen (toon vraag X alleen als Y = "Nee") |
| 3.2 | Foto-annotaties (pijlen, cirkels tekenen) |
| 3.3 | Dashboard statistieken (grafieken) |
| 3.4 | Excel export |
| 3.5 | Email: inspectie-rapport versturen naar opdrachtgever |
| 3.6 | Template dupliceren / importeren |

### Fase 4: Aparte app (optioneel, later)

| Stap | Beschrijving |
|------|-------------|
| 4.1 | Eigen HTML bestand + routing |
| 4.2 | Gedeelde componenten extraheren |
| 4.3 | Eigen Service Worker + manifest |
| 4.4 | Eigen GitHub Pages URL |

---

## 7. Aandachtspunten

### Performance
- index.html is al ~9200 regels; fase 1+2 voegt ~2500 regels toe
- Dit is houdbaar, maar fase 3+ kan de grens bereiken → dan aparte app
- Foto's comprimeren voor opslag (max 1920px, JPEG 80%)
- Thumbnails genereren voor lijstweergave

### Offline
- IndexedDB voor inspectiedata + foto's in cache
- Sync-queue: bijhouden welke inspecties nog gesynchroniseerd moeten worden
- Conflictresolutie: "laatste schrijft wint" (monteur werkt alleen aan eigen inspecties)

### Beveiliging
- RLS: monteur ziet alleen eigen inspecties
- Admin ziet alles
- Foto's in private Supabase Storage bucket (signed URLs)
- Templates alleen bewerkbaar door admin

### Compatibiliteit
- Moet werken op oudere Android telefoons (monteurs)
- Camera API moet werken in PWA-modus
- Touch-friendly: grote knoppen (min 44x44px), zoomfunctie hergebruiken

---

## 8. Voorbeeldtemplates

### Template 1: Commissioning Checklist
- **Elektrisch**: Aarding (Ja/Nee), Isolatieweerstand (MΩ), Fasevolgorde (Ja/Nee), Draaimomenten (Ja/Nee)
- **Mechanisch**: Uitlijning (Goed/Matig/Slecht), Trillingen (mm/s), Lekcontrole (Ja/Nee)
- **Instrumentatie**: Kalibratie (Ja/Nee), Setpoint (numeriek), Loop check (Ja/Nee)
- **Veiligheid**: Noodstop getest (Ja/Nee), Beveiligingen actief (Ja/Nee), Markering aangebracht (Ja/Nee)

### Template 2: Periodieke Keuring
- **Visuele inspectie**: Corrosie (Goed/Matig/Slecht), Beschadigingen (Ja/Nee), Markering leesbaar (Ja/Nee)
- **Functioneel**: Werking getest (Ja/Nee), Meetwaarden binnen tolerantie (Ja/Nee)
- **Documentatie**: Logboek bijgewerkt (Ja/Nee), Certificaat geldig t/m (Datum)

### Template 3: Veiligheids-rondegang
- **Algemeen**: PBM gedragen (Ja/Nee), Werkvergunning aanwezig (Ja/Nee), Vluchtwegen vrij (Ja/Nee)
- **Elektrisch**: LOTO toegepast (Ja/Nee), Spanningsloos gecontroleerd (Ja/Nee)
- **Brand**: Blusmiddelen bereikbaar (Ja/Nee), Rookmelders actief (Ja/Nee)

---

## 9. Conclusie

De inspectie-app past naadloos in het KTS-ecosysteem: zelfde Supabase backend, zelfde authenticatie, zelfde huisstijl. Door te starten als admin-tab kunnen we snel waarde leveren zonder de architectuur te compliceren. De JSONB-aanpak voor templates en antwoorden maakt het flexibel zonder complexe database-migraties.

**Aanbevolen startpunt**: Fase 1, stap 1.1 t/m 1.4 (database + template builder). Zodra de admin templates kan aanmaken, bouwen we de monteur-interface.
