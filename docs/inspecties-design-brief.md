# Design Brief: KTS Inspecties UI Modernisering

> Brief voor Claude Design / UI-designer om de inspectiemodule van de KTS Uren App te professionaliseren.

## Context

De **KTS Uren App** is een interne webapp voor Kuijpers Technical Services BV — een installatie- en onderhoudsbedrijf. Monteurs (engineers) registreren werkuren, kosten en voeren inspecties uit. Het app draait als PWA, primair gebruikt op telefoon en tablet (ook desktop voor admins).

De inspectiemodule is recent toegevoegd en functioneel goed, maar visueel nog niet op het niveau van de rest van de app. We willen het naar een professionele, moderne uitstraling brengen die past bij een **technisch installatiebedrijf** — dus rustig, betrouwbaar, vakmanschap, geen frivoliteit.

## Huisstijl / huidige visuele identiteit

- **Primair blauw**: `#07567F` (KTS-blauw)
- **Donker blauw**: `#044560` (KTS-darker), `#0A1628` (deepest)
- **Achtergrond**: `#f1f5f9` (slate-100)
- **Tekst**: `#1e293b` (slate-800)
- **Lettertype**: DaxlinePro (eigen font), fallback: Segoe UI / system-ui
- **Logo**: KTS gear-icoon + naam "Kuijpers | Technical Services"
- **Cards**: `border-radius: 12-16px`, subtiele schaduw
- **Watermerk**: Stijlvolle "K" 10% opacity op alle PDF rapporten

De rest van de app gebruikt voornamelijk witte cards op een lichte slate-grijze achtergrond, met KTS-blauwe accenten.

## Scope: wat er wel/niet veranderd mag worden

### ✅ Mag veranderd worden
- Visuele styling, kleuren, spacing, typography, iconografie
- Layout en compositie van schermen
- Animaties en transities (subtiel, professioneel)
- Manier waarop content gegroepeerd wordt
- UI-componenten (knoppen, cards, badges, modals)

### ❌ Moet ongewijzigd blijven
- Functionele flow: overzicht → sectie → vragen
- Datamodel (Supabase)
- Navigatiestructuur (bottom nav, beheer-menu)
- App is en blijft een single-page HTML/CSS/JS in `index.html`
- Bestaande huisstijlkleuren als basis (mag uitgebreid)

## Huidige inspectie-flow

### 1. Inspectie-overzichtspagina ("Inspecties" tab)
- Bovenaan: **"Nieuwe inspectie starten"** — lijst van templates als clickable cards
- Daaronder: **"Mijn inspecties"** — eigen inspecties met statusfilter, kunnen worden geopend, gearchiveerd, gekopieerd voor ander object, of verwijderd

### 2. Inspectie openen
- **Sectie-overzicht**: 2-koloms grid met sectie-cards (bv. "PG1 — Ruwwaterpomp 1"), kleur per status:
  - Groen = klaar zonder afwijkingen
  - Rood/oranje = afwijking gevonden
  - Geel = bezig
  - Grijs = nog niet gestart
- Voortgangsbalk bovenin met totaal stats
- "Inspectie afronden" knop onderaan

### 3. Sectie-view (klik op sectie-card)
- Compacte sticky header: sectie-naam, asset-code, voortgang in deze sectie
- Lijst met vragen, elk een kaart met:
  - Vraagtekst + component-tag
  - Antwoord-knoppen (zie hieronder)
  - Foto-toevoegen iconen (camera + galerij)
  - Opmerkingenveld
  - Eventueel toegevoegde foto's als thumbnails
- Onderaan: **Vorige | Overzicht | Volgende** navigatie

### 4. Vraagtypes
- **Goed / Fout / N.v.t.** — drie knoppen
- **Conditiescore 1-6 (NEN 2767)** — zes gekleurde knoppen, gradient groen→rood, score 4-6 = afwijking
- **Meting (numeriek)** — input met eenheid
- **Tekst** — vrij textarea

### 5. PDF rapport
- Opmaak: KTS huisstijl, watermerk, voettekst met paginanummer
- Bevat: meta-info, samenvatting (telt goed/fout/score), conditiescore-verdeling (NEN 2767), per sectie alle vragen met antwoorden en foto's

## Pijnpunten in huidige UI

1. **Te veel verschillende kleurkaders en achtergronden** in vragenkaarten — voelt soms rommelig
2. **Header bij sectie-view** is functioneel maar visueel saai (witte achtergrond, plat)
3. **Vraagkaarten** hebben weinig hiërarchie — vraagtekst en component-tag staan dicht op elkaar, opmerkingenveld voelt "tussen alles in"
4. **Conditiescore-knoppen** zijn nu verbeterd (gradient zichtbaar, actieve knop springt eruit), maar de hele rij voelt nog wat "elementair"
5. **Foto-thumbnails** zijn klein en functioneel maar niet mooi (vierkant, 60x60, harde rand)
6. **Stats / progressie** is correct maar weinig opvallend / bemoedigend voor de gebruiker
7. **Sectie-cards in overzicht** missen een "tactiel" gevoel — zijn nu vlak met een statusicoon
8. **Geen visuele "celebration"** als sectie of inspectie compleet is

## Doelstellingen design-update

### A. Premium, vakmensgericht gevoel
De gebruiker is een ervaren monteur. De UI moet aanvoelen als kwalitatief gereedschap: solide, betrouwbaar, geen tutturige animaties. Denk aan: Notion, Linear, Apple Mail — sober en stevig, met aandacht voor detail.

### B. Heldere informatiehiërarchie
- Op één blik zien: waar ben ik (welke sectie), hoe ver, wat is er afwijkend
- Onderscheid tussen "vraag" (statisch), "antwoord" (interactief) en "metadata" (component, foto's)

### C. Efficiënt voor mobiel/tablet gebruik
Monteur staat in werkplaats / installatieruimte:
- Touch targets minimaal 44x44px
- Eén-hand-bediening waar mogelijk
- Hoog contrast, ook bij lichte achtergrond / zonlicht
- Snel scrollen door vragen, snel wisselen tussen secties

### D. Status-emotionaliteit (subtiel)
- "Bijna klaar" — kleine motivatie zichtbaar
- "Afwijking gevonden" — duidelijke aandacht zonder paniekerig te worden
- "Klaar" — voldoening (subtiele celebration, geen confetti)

## Specifieke design-uitdagingen waar input gewenst is

### 1. Sectie-overzicht
Hoe maak je 9 sectiekaarten zo dat:
- Status (afgerond/bezig/leeg/afwijking) direct zichtbaar is
- De naam goed leesbaar is op kleine cards
- Het niet "een tabel" wordt maar wel scanbaar
- Niet té speels (geen grote emoji's, gradient backgrounds zijn ok)

### 2. Vraagkaart layout
Een vraagkaart bevat veel informatie:
- Vraagnummer + tekst (kan lang zijn, multi-line)
- Component-tag (bv. "Ruwwaterpomp · WTB")
- Foto-actie iconen (camera + galerij)
- Antwoord-knoppen (3 of 6 stuks)
- Opmerkingenveld
- Eventueel toegevoegde foto's

Hoe organiseer je dit zodat het kalm aanvoelt op een telefoon? Voorbeeld-richting: rustige typografie, duidelijke whitespace, gegroepeerde secties.

### 3. Conditiescore-component (NEN 2767)
6 knoppen in gradient van groen naar rood. Dit is een specialistisch beoordelingssysteem voor onderhoud:
- 1 = Uitstekend
- 2 = Goed
- 3 = Redelijk
- 4 = Matig (afwijking)
- 5 = Slecht (afwijking)
- 6 = Zeer slecht (afwijking)

Hoe maak je deze knoppen-rij zodat:
- De gradient logisch aanvoelt (linker = goed, rechter = slecht)
- De geselecteerde knop duidelijk gekozen is
- Niet-geselecteerde knoppen subtiel hinten naar hun kleur
- Touch-vriendelijk
- Past bij het niveau van een professionele inspectie-app (geen schoolse "1-2-3-4-5-6")

### 4. Foto-galerij in vraag
Foto's komen rechtstreeks van de monteur (camera op telefoon). Hoe presenteer je ze:
- Klein genoeg om niet de UI te domineren
- Klikbaar voor groot zien (lightbox?)
- Mogelijk om te verwijderen
- Aantal duidelijk zichtbaar

### 5. Voortgang & celebration
- Hoe toon je voortgang elegant? (linear progress, ringen, segmenten?)
- Hoe vier je "compleet" zonder kindachtig te worden?

## Technische beperkingen

- Vanilla JavaScript + HTML + inline CSS in single file `index.html` (~14000 regels)
- Geen build step, geen frameworks (geen React/Vue/Tailwind)
- Wel beschikbaar via CDN: jsPDF, Chart.js, Supabase SDK, jspdf-autotable
- Mag CSS uitbreiden met meer utility classes / custom properties
- Mag SVG-iconen toevoegen (geen externe icon libraries)
- App moet werken op iOS Safari, Android Chrome, desktop Chrome/Edge

## Deliverables die we zoeken

1. **Concept / mood board** — sfeer, kleurenpalet uitgebreid, typografie keuzes
2. **Component library** voor inspecties:
   - Sectie-card (4 statussen)
   - Vraag-card (alle types)
   - Conditiescore-component
   - Voortgangsbalk
   - Sticky header (sectie-view)
   - Statistieken-blok
3. **Layout-mockups** voor:
   - Sectie-overzicht (2 statussen: leeg + half ingevuld)
   - Sectie-view met vragen (verschillende vraagtypes)
4. **Implementatie-richtlijnen** — concrete CSS / inline styles die we kunnen toepassen in de bestaande HTML

## Succescriteria

- Een KTS-monteur opent de app en denkt: "dit voelt strak en doordacht"
- Eindklant ziet de gegenereerde PDF en denkt: "dit is een professioneel rapport"
- Visueel onderscheid tussen "afgerond goed" / "afgerond met afwijking" / "in progress" / "leeg" is in 1 seconde te zien
- Past binnen de KTS-blauwe huisstijl, mag deze uitbreiden maar niet overschrijven

## Bijlagen

- App live: [URL] (ingelogd nodig)
- Codebase: `index.html` — relevante secties:
  - `inspRenderOverview()` — sectie-grid (rond regel 11700)
  - `inspRenderSectionView()` — sectie-view met vragen (rond regel 11820)
  - PDF rapport: `inspGeneratePDF()` (rond regel 12462)
- Screenshots huidige situatie: zie `docs/screenshots/` (toevoegen)

---

**Vraag aan designer**: gaag een eerste concept / mood + 2-3 componenten uitgewerkt, zodat we kunnen zien of de richting klopt voordat we het hele systeem doortrekken.
