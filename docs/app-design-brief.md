# Design Brief: KTS Uren App — UI moderniseren (rest van de app)

> Brief voor Claude Design / UI-designer om de rest van de KTS Uren App te brengen naar het niveau dat we voor de inspectiemodule hebben bereikt.

## Context

De **KTS Uren App** is een interne PWA voor Kuijpers Technical Services BV — een installatie- en onderhoudsbedrijf. Naast inspecties beheren monteurs hier hun werkuren, kosten, en kunnen admins weekstaten/inkooporders/facturen genereren.

De **inspectiemodule** heeft recent een design-update gekregen op basis van een eerdere brief (zie `inspecties-design-brief.md`). Het Plex-typografie + hairline-borders + status-via-accent design-systeem werkt goed daar. Nu willen we dat doortrekken naar de rest van de app zodat alles één samenhangend geheel wordt.

## Wat al klaar is (referentie)

In de inspectiemodule is geïmplementeerd:
- IBM Plex Sans + Plex Mono fonts (mono voor codes/cijfers/labels)
- Warme off-white achtergrond (`#FAFAF7`) ipv koud slate-grijs
- Hairline borders (`#E7E4DD`), geen volle gekleurde achtergronden
- Status via 3px accentstreep links (groen/oranje/rood/grijs)
- SVG-iconen in plaats van emoji
- Gedempte status-kleuren (geen neon)
- Mono cijfers met `tabular-nums` feel
- Soft shadows in lagen (geen zware drops)

Tokens en classes staan onder `:root` en `.insp-*` prefix in `index.html`. We willen die generaliseren waar mogelijk.

## Scope: wat te moderniseren

### A. Hoofdtabs (bottom nav schermen)

1. **Uren** (`#screen-uren`) — hoofdscherm voor monteur: weekoverzicht met dag-cards, urenkaart, status (concept/verstuurd), download/sign/verstuur knoppen
2. **Kosten / Extra** (`#screen-kosten`) — declaratie-overzicht: km, hotel, expense entries, totalen
3. **Overzicht** (`#screen-overzicht`) — historisch overzicht per maand/jaar, urenstaat-historie
4. **Beheer** (`#screen-admin`) — admin-tegels grid (Dashboard, Projecten, Personen, Gebruikers, Tarieven, Bedrijf, Weekstaten, Inkooporders, Facturen, Inspectie-templates)

### B. Bottom navigation

- Huidige icons zijn emoji + Nederlandse labels
- Wel/niet vervangen door SVG-iconen?
- Actieve tab is nu KTS-blauw — dat blijft

### C. Header

- KTS logo + "Kuijpers | Technical Services" titel
- User-badge rechtsboven met dropdown
- Project-selector dropdown daaronder

### D. Modals (admin-flows)

- Project bewerken
- Persoon/bedrijf bewerken
- Gebruiker bewerken
- Tarief bewerken
- Week-defaults instellen
- Wachtwoord wijzigen
- Welkomstgids
- Confirm-dialogen

### E. Lijsten en cards in beheer

- Projecten-lijst
- Personen & bedrijven lijst
- Gebruikers-lijst
- Tarieven-lijst
- Weekstaten-overzicht
- Inkooporders-lijst
- Facturen-lijst

### F. Formulieren

- Inputs (text, number, date, time)
- Selects/dropdowns
- Textareas
- Checkboxes / switches
- File-upload buttons
- Form-rows (label + input)

### G. Knoppen

- Primary (KTS-blauw)
- Secondary
- Ghost
- Danger
- Icon-buttons

### H. Statistieken / dashboard

- KPI-cards (omzet, uren, projecten)
- Charts (Chart.js — al in gebruik)
- Tabellen met statussen

### I. Toasts en feedback

- Success/warning/error toasts (huidige zijn pillen)
- Loading states
- Empty states

## Wat NIET moderniseren

- **Inspectiemodule** — die is al klaar
- **Login overlay** — die is al stijlvol genoeg
- **PDF generatie** — die heeft eigen styling (jsPDF), apart traject
- **Watermerk** — blijft zoals het is
- **Bestaande tokens (`--kts-blue`, `--kts-darker`)** — basis blijft

## Huisstijl uitbreiding

We willen het Plex-design-systeem doortrekken maar niet alles 100% van inspecties kopiëren. Keuze:

### Optie 1: Volledige Plex (mijn voorkeur)
Hele app krijgt Plex Sans + Plex Mono, hairline borders, off-white achtergrond. Inspectiemodule blijft consistent met rest. DaxlinePro blijft beschikbaar als optionele KTS-huisfont (bv. PDF rapporten).

### Optie 2: Hybride
Plex blijft alleen voor inspectiemodule, rest van de app blijft DaxlinePro met huidige styling maar wordt visueel opgepoetst (hairline borders, betere spacing).

### Optie 3: DaxlinePro overal
Inspectiemodule omschakelen naar DaxlinePro, design-systeem inhouden maar met huisfont.

**Vraag aan designer:** wat past het beste bij de KTS-identiteit? Het bedrijf is technisch / installatie / vakmensgericht. DaxlinePro heeft een "industriële" vibe, Plex is moderner / softwarematig.

## Pijnpunten in huidige UI (rest van de app)

1. **Beheer tegels** zijn pastelkleuren met emoji — voelt soms speels voor een admin-scherm
2. **Form rows** verschillen per modal in hoogte, padding, label-stijl
3. **Inputs** hebben verschillende borders (1px / 2px) en focus-states
4. **Knoppen** mengen primary/secondary/ghost zonder strikte regel
5. **Lijsten in beheer** gebruiken `.entry-card` met basic shadow — geen status-accent
6. **Dashboard KPIs** zijn cards met cijfer + label, weinig hiërarchie
7. **Status-badges** hebben veel verschillende kleurcombinaties, niet altijd consistent
8. **Toasts** zijn pillen die kort verschijnen — werkt, maar voelt niet premium

## Belangrijkste screens om te ontwerpen

### 1. Uren-tab (hoofdscherm voor monteur)
Dit is het meest gebruikte scherm. Bevat:
- Weeknavigatie (vorige/huidige/volgende)
- Project-info kaart
- Dag-cards (ma t/m zo) — elk met start/eind/uren/werkzaamheden
- Status-banner (concept / verstuurd)
- Action-knoppen (opslaan, ondertekenen, versturen, PDF)

Mockup gewenst voor:
- Empty state (lege week)
- Half ingevuld (concept)
- Volledig ingevuld + ondertekend (klaar voor versturen)
- Verstuurd (afgerond, alleen bekijken)

### 2. Beheer-grid (admin homepagina)
9-12 tegels in grid. Wat zien admins als ze inloggen?
- Dashboard tegel die naast cijfers ook trends toont?
- Snelkoppelingen naar laatst gebruikte items?
- Notification badges (open weekstaten, openstaande facturen)?

Mockup: tegelgrid met betere hiërarchie tussen "vaak gebruikt" en "soms gebruikt".

### 3. Beheer → Weekstaten (lijst)
De admin verwerkt hier verstuurde weekstaten. Bevat:
- Filter (project, medewerker, jaar, week)
- Lijst met weekstaten (medewerker · week · status · acties)
- Acties: goedkeuren, afwijzen, downloaden, verwijderen

Mockup: zelfde patroon als nieuwe inspecties-lijst (hairline + accentstreep + status-pill + action-buttons in design-stijl).

### 4. Modals (admin-flows)
Algemene template voor alle modals:
- Header (titel + sluit-knop)
- Body (form-rows)
- Footer (annuleren + opslaan)

Met aandacht voor:
- Sticky header bij lange forms
- Form-row spacing en typography
- Disabled state knoppen
- Validatiefeedback

### 5. Form-componenten library
- Input (default, focus, error, disabled)
- Select met chevron
- Textarea
- Date/time picker
- Checkbox / radio / switch
- File upload zone

## Specifieke design-uitdagingen

### 1. Beheer-tegels
Hoe maak je de 12 admin-tegels mooi maar overzichtelijk? Voorbeelden:
- Dashboard, Projecten, Personen & Bedrijven (gebruikt vaak)
- Gebruikers, Tarieven (af en toe)
- Weekstaten, Inkooporders, Facturen (deels)
- Inspectie-templates, Inspectie-overzicht, Bedrijf-info (zelden)

Mogelijk in groepen: "Dagelijks", "Beheer", "Documentatie"?

### 2. Weekoverzicht (Uren)
7 dag-cards verticaal stacken op telefoon. Hoe geef je per dag genoeg info zonder dat het tabel wordt?
- Datum + dag-naam
- Start/eind tijd
- Aantal uren
- Pauze
- Werkzaamheden (mogelijk lang)
- Afwijking van standaardweek (stippeltje?)

### 3. Project-selector
Dropdown bovenin: alle projecten waar gebruiker aan is toegewezen. Bij admins zijn dat tientallen. Hoe scanbaar maken?
- Zoekveld?
- Recent gebruikt bovenaan?
- Categorisatie (lopend / archief)?

### 4. Dashboard KPI's
Admin Dashboard heeft cijfers die snel scanbaar moeten zijn:
- Totaal uren deze maand
- Omzet deze maand
- Open weekstaten
- Open facturen
- Trend t.o.v. vorige periode

Hoe presenteer je die zodat ze betekenis hebben (rood/groen/neutraal) zonder dashboard-overload?

### 5. Confirm-dialogen
Veel acties hebben een bevestiging (verwijderen, archiveren, etc.). Huidige `confirmAsync()` is een eigen modal. Design verbeteren naar:
- Duidelijke vraag bovenaan
- Optionele toelichting
- Twee knoppen rechts (annuleren + bevestigen)
- Bij gevaarlijke actie: rode bevestigknop

## Technische beperkingen

- Vanilla JavaScript + HTML + inline CSS in single file `index.html` (~14.500 regels)
- Geen build-step, geen frameworks
- Beschikbaar via CDN: jsPDF, Chart.js, Supabase SDK, jspdf-autotable, SheetJS
- Mag CSS uitbreiden met custom properties / utility classes
- Mag inline SVG iconen toevoegen
- Werkt op iOS Safari, Android Chrome, desktop Chrome/Edge

## Deliverables

1. **Concept / mood** — kleurenpalet uitgebreid, typografie keuze (Plex / Daxline / hybride)
2. **Component library** voor de hele app:
   - Buttons (4 varianten)
   - Inputs / selects / textarea / checkbox / radio
   - Cards (entry, KPI, tegel)
   - Status-pills / badges
   - Modals (header + body + footer)
   - Toasts (success / warn / error / info)
   - Empty states
3. **Layout-mockups** voor de 5 belangrijkste schermen:
   - Uren-tab (4 statussen)
   - Beheer-grid
   - Beheer → Weekstaten lijst
   - Modal voorbeeld (Project bewerken)
   - Dashboard
4. **Implementatie-richtlijnen** — concrete CSS / inline styles voor in `index.html`

## Werkwijze

Net als bij de inspectiemodule:
1. Designer levert mockups + CSS + spec
2. Claude Code implementeert in `index.html` zonder datamodel of functionaliteit te raken
3. Per scherm één commit zodat we kunnen reviewen voordat we doorgaan

## Volgorde van implementatie (suggestie)

**Fase 1: foundations**
- Tokens + typografie keuze
- Component library (knoppen, inputs, cards)
- Modal-template

**Fase 2: hoofd-flows**
- Uren-tab refresh
- Beheer-grid refresh
- Weekstaten-lijst refresh

**Fase 3: details**
- Andere admin-lijsten
- Dashboard KPIs
- Toasts en feedback

## Succescriteria

- Een KTS-monteur opent de app en denkt: "dit voelt strak en doordacht — net als die nieuwe inspectie-app"
- Een admin opent het beheerpaneel en kan in 3 seconden zien wat aandacht nodig heeft
- Visuele consistentie: dezelfde card, dezelfde knop, dezelfde input overal
- Past binnen de KTS-identiteit (technisch, vakmensgericht, betrouwbaar)
- Geen regressie op functionaliteit — alle bestaande flows blijven werken

## Bijlagen

- App live: [URL] (login nodig)
- Codebase: `index.html` — hoofdsecties:
  - `<style>` blok met huidige tokens + nieuwe `.insp-*` design-systeem
  - `screen-uren`, `screen-kosten`, `screen-overzicht`, `screen-admin` containers
  - Modals: `admin-modal`, `project-modal`, `expense-modal`, `weekdefaults-modal`, etc.
- Inspectie design brief (als referentie): `docs/inspecties-design-brief.md`
- Inspectie design CSS (al geïmplementeerd, te hergebruiken): `index.html` regel ~841 e.v.

---

**Versie:** v1.0
**Datum:** april 2026
**Auteur:** Mark Kuijpers (KTS BV) i.s.m. Claude Code
**Volgende fase:** PDF rapport-styling apart traject (jsPDF customisatie)
