KTS Excel Templates (Huisstijl Rev A — mei 2026)
==================================================

Deze 3 templates matchen het design van de PDFs die de KTS Uren-app
genereert. Voor handmatig gebruik buiten de app om:

  KTS-Weekstaat-template-RevA.xlsx     A4 landscape — voor losse weekstaten
  KTS-Inkooporder-template-RevA.xlsx   A4 portrait  — voor inkooporders
  KTS-Factuur-template-RevA.xlsx       A4 portrait  — voor facturen


GEBRUIK
=======

1. Open de gewenste .xlsx in Microsoft Excel
2. Direct opslaan als .xlsx met een nieuwe naam (bijv. naar OneDrive),
   anders overschrijf je het lege template
3. Vul de vierkante haken-plaatshouders in: [Vul je naam in],
   [Projectnaam], [DD-MM-JJJJ], etc.
4. Bedragen: vul de blauwe "AANTAL" en "TARIEF/PRIJS" cellen in —
   Subtotaal en TOTAAL berekenen automatisch via formules
5. Bestand opslaan als PDF voor versturen (Bestand > Opslaan als > PDF)


WIJZIGINGEN T.O.V. ORIGINELE TEMPLATES
=======================================

Deze Rev A-templates volgen de visuele identiteit zoals beschreven in
KTS_Huisstijl_RevA.pdf:

- KTS-blauw header (#07567F) over de tabel-header en TOTAAL-band
- K-logo rechtsboven uit de officiële huisstijl-set
- Adresgegevens rechts onder logo
- Geen Daxline-font in Excel (custom font is niet portable) —
  gebruikt Calibri, dezelfde leesbaarheid maar ondersteund overal
- Footer met verwijzing naar Algemene Voorwaarden Rev A

Wat er WEL hetzelfde blijft als de PDFs:
- Tabelopbouw en kolomstructuur
- KPI-strip met formules onder de weekstaat
- Items-tabel met automatische totaal-berekening
- Betaal-verzoek met IBAN onderaan factuur


GEEN BACKWARDS COMPATIBILITEIT MET BESTAANDE TEMPLATES
=======================================================

De 3 originele templates die in deze /templates/ folder stonden:
  KTS_urenstaat_sjabloon.xlsx
  Inkooporder KTS118-23012026 - Futura Composites BV.xlsx
  2026-XX XXX BV TEMPLATE.xlsx

Deze blijven bewaard. Gebruik wat je gewend bent.

De Rev A-versies zijn aanvullend, voor wie graag de nieuwe huisstijl
in losse documenten gebruikt.


REGENEREREN
===========

Bij wijzigingen aan de huisstijl: pas tools/generate-templates.py aan
en run:

  python3 tools/generate-templates.py

De 3 .xlsx-bestanden worden overschreven.


VRAGEN
======
mark@kuijpers-ts.nl
