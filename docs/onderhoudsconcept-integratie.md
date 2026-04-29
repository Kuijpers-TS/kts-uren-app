# Onderhoudsconcept → KTS Inspectie App: integratieplan

## Bron-document

`ASD-REG-0400-0.01 Onderhoudsconcept & Taakplannen 2.0 NSM-PG 2.xlsx`

Bevat 4 sheets:
- **Onderhoudsconcept** (515 rijen) — alle taken voor pompgemaal Den Oever
- **Taakplannen** (82 rijen) — taakplan-nummers en beheerobjecten
- **Input** — referentielijsten (frequenties, disciplines, partijen)
- **Aantekeningen & vragen** — opmerkingen tijdens opstellen

## Inhoudsanalyse

### Elementen (12 unieke generieke installaties)
| Aantal taken | Element |
|---|---|
| 131 | Aandrijving en Bewegingswerk (elektrohydraulisch) |
| 79 | Pompinstallatie (gemaalpomp) |
| 61 | Bediening- en besturingsinstallatie |
| 47 | Meetinstallatie |
| 43 | Klimaatinstallatie |
| 40 | Brandblusinstallatie |
| 35 | Brandmeld- en ontruimingsinstallatie (BMI) |
| 20 | Inbraakbeveiligingsinstallatie |
| 19 | CCTV |
| 16 | Intercom |
| 9 | Transmissie |
| 7 | Toegangscontrole |

### Disciplines
- IA&E: 262 taken
- WTB: 235 taken
- Civiel: 15 taken
- Alle (overlap): rest

### Frequenties (vooral jaarlijks)
- 1 jaarlijks: 448 (87%)
- 1 maandelijks: 16
- 6 maandelijks: 14
- 5 jaarlijks: 6, 10 jaarlijks: 5
- Variabel: 4

### Inspectie-taken
**365 van de 515 taken** (71%) beginnen met *Inspecteer* of *Controleer* — dat zijn potentieel kandidaten voor de inspectie-app.

### Koelwater-relevant (huidige scope)
**29 koelwater/koeler/warmtewisselaar taken** verspreid over:
- Aandrijving en Bewegingswerk: warmtewisselaars
- Pompinstallatie: koelleiding DE-lager, koelwaterleiding mantelkoeling, koeling FR
- Klimaatinstallatie: condensafvoer koelconvector HVAC

## Mapping naar KTS app structuur

| Onderhoudsconcept kolom | KTS template veld |
|---|---|
| `SBS object` | (niet gebruikt — context) |
| `Element Generiek` | Sectie titel of category |
| `Element Specifiek` | Sectie titel (specifieker) |
| `Bouwdeel generiek` + `Bouwdeel specifiek` | Component |
| `Locatie` | Asset / locatie |
| `NEN-2767 Decompositie-code` | Component metadata (decompositie) |
| `Taakomschrijving` | Vraagtekst |
| `Discipline` | Discipline (WTB/IA&E/Civiel) |
| `Frequentie` | Frequentie van de inspectie-template |
| `Materiaal` / `Materieel` | (niet gebruikt nu — kan later als attachment) |

### Vraagtype keuze
Voor de meeste inspectie-taken in het concept past:
- **conditiescore** (1-6 NEN 2767) — voor "Inspecteer X op aangroei/beschadigingen" (visuele beoordeling)
- **goed_fout** — voor "Controleer X op werking" (functionele check)
- **meting** — voor "Meet zuurgraad / temperatuur / drukval"
- **tekst** — voor "Documenteer in logboek"

## Plan voor integratie (toekomst)

### Fase 1 (nu — al klaar)
- ✅ Koelwater skids template (handmatig)
- ✅ Beunkoelers + ruwwaterpompen template (handmatig)

### Fase 2 (binnenkort)
**Eén template per installatie-element**, beperkt tot inspectie-taken:
- Pompinstallatie gemaalpomp → 62 inspectievragen
- Aandrijving en Bewegingswerk → 103 inspectievragen
- Klimaatinstallatie → 31 inspectievragen
- Brandblus / BMI / etc → eigen templates

### Fase 3 (later)
- Volledige integratie inclusief preventief onderhoud, testen, modificaties
- Linken aan taakplannen (TP-nummer voor Maximo)
- Frequentie-sturing (auto-genereren inspecties op vervaldatum)

## Converter-script

Zie `docs/convert_ohc_to_kts.py` (volgt) — converteert een onderhoudsconcept-Excel naar een KTS-import-Excel met:
- Eén template per Element Generiek
- Sectie per Element Specifiek of NEN-decompositie
- Vragen filteren op "Inspecteer..." / "Controleer..."
- Auto-mapping van vraagtype op basis van trefwoorden

Workflow zal worden:
1. Run script op nieuw onderhoudsconcept Excel
2. Krijg KTS-import Excel terug
3. Open en tweak handmatig waar nodig (vraagtypes, asset-codes)
4. Importeer in app via Beheer → Formulieren → 📥 Importeer Excel

## Vragen voor later

- **Maximo-koppeling via TP-nummer**: linken we elke inspectie aan een taakplan-nummer? Dan kan PDF-rapport TP-nummer tonen.
- **Discipline-routering**: moeten WTB-taken naar andere monteur dan IA&E? Of een gemengde lijst?
- **NEN-decompositiecode**: tonen we die op de PDF voor klant? (Maximo-relevant)
- **Materiaal/materieel**: wil je dat in de app zien tijdens inspectie (checklist)?

---

**Status nu**: alleen koelwater-installatie templates actief. Onderhoudsconcept-import komt in een latere fase wanneer dat nodig is.
