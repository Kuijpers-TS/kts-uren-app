-- =====================================================
-- SEED: Koelwater inspectie-templates NSM Pompgroepen Den Oever
-- Voer dit uit in Supabase SQL Editor
-- =====================================================

-- Template 1: Visuele inspectie en klein onderhoud beunkoelers & ruwwaterpompen
INSERT INTO inspection_templates (
    name, description, category, location, installation, asset, frequency, frequency_code, sections, is_active
) VALUES (
    'Visuele inspectie beunkoelers & ruwwaterpompen',
    'Jaarlijkse visuele inspectie en klein onderhoud van beunkoelers en ruwwaterpompen. NSM-PG Pompinstallatie Koelwater. Geschatte duur: 18 uur.',
    'POH',
    'Pompgroepen Den Oever',
    'Pompinstallatie (Koelwater)',
    'Gemaal Pompgroep 1 & 2',
    '1 jaarlijks',
    '[i]',
    '[
        {
            "title": "PG1 — Ruwwaterpomp 1",
            "questions": [
                {"text": "Ruwwaterpomp op aangroei en beschadigingen controleren", "type": "goed_fout", "component": "Ruwwaterpomp", "discipline": "WTB", "permit_required": false},
                {"text": "Spervloeistof controleren", "type": "goed_fout", "component": "Ruwwaterpomp", "discipline": "WTB", "permit_required": false},
                {"text": "Elektromotor op beschadigingen controleren", "type": "goed_fout", "component": "Elektromotor", "discipline": "WTB", "permit_required": false},
                {"text": "Motordeksel op beschadigingen controleren", "type": "goed_fout", "component": "Elektromotor", "discipline": "WTB", "permit_required": false},
                {"text": "Kabeldoorvoer en kabel op beschadigingen controleren", "type": "goed_fout", "component": "Bekabeling", "discipline": "WTB", "permit_required": false},
                {"text": "Weerstandsvrijheid van aansluitingen controleren", "type": "goed_fout", "component": "Bekabeling", "discipline": "WTB", "permit_required": false},
                {"text": "Leidingen, flenzen en appendages op lekkage en corrosie controleren", "type": "goed_fout", "component": "Buisleiding", "discipline": "WTB", "permit_required": false},
                {"text": "Kabels, doorvoeren, IP68 afdichtingen en hijsogen controleren", "type": "goed_fout", "component": "Bekabeling", "discipline": "WTB", "permit_required": false}
            ]
        },
        {
            "title": "PG1 — Ruwwaterpomp 2",
            "questions": [
                {"text": "Ruwwaterpomp op aangroei en beschadigingen controleren", "type": "goed_fout", "component": "Ruwwaterpomp", "discipline": "WTB", "permit_required": false},
                {"text": "Spervloeistof controleren", "type": "goed_fout", "component": "Ruwwaterpomp", "discipline": "WTB", "permit_required": false},
                {"text": "Elektromotor op beschadigingen controleren", "type": "goed_fout", "component": "Elektromotor", "discipline": "WTB", "permit_required": false},
                {"text": "Motordeksel op beschadigingen controleren", "type": "goed_fout", "component": "Elektromotor", "discipline": "WTB", "permit_required": false},
                {"text": "Kabeldoorvoer en kabel op beschadigingen controleren", "type": "goed_fout", "component": "Bekabeling", "discipline": "WTB", "permit_required": false},
                {"text": "Weerstandsvrijheid van aansluitingen controleren", "type": "goed_fout", "component": "Bekabeling", "discipline": "WTB", "permit_required": false},
                {"text": "Leidingen, flenzen en appendages op lekkage en corrosie controleren", "type": "goed_fout", "component": "Buisleiding", "discipline": "WTB", "permit_required": false},
                {"text": "Kabels, doorvoeren, IP68 afdichtingen en hijsogen controleren", "type": "goed_fout", "component": "Bekabeling", "discipline": "WTB", "permit_required": false}
            ]
        },
        {
            "title": "PG1 — Beunkoeler 1",
            "questions": [
                {"text": "Beunkoeler op aangroei en beschadigingen controleren", "type": "goed_fout", "component": "Beunkoeler", "discipline": "WTB", "permit_required": false},
                {"text": "Leidingen, flenzen en appendages op lekkage en corrosie controleren", "type": "goed_fout", "component": "Buisleiding", "discipline": "WTB", "permit_required": false},
                {"text": "Load cells indicator reinigen met droge doek", "type": "goed_fout", "component": "Sensor", "discipline": "WTB", "permit_required": false}
            ]
        },
        {
            "title": "PG1 — Beunkoeler 2",
            "questions": [
                {"text": "Beunkoeler op aangroei en beschadigingen controleren", "type": "goed_fout", "component": "Beunkoeler", "discipline": "WTB", "permit_required": false},
                {"text": "Leidingen, flenzen en appendages op lekkage en corrosie controleren", "type": "goed_fout", "component": "Buisleiding", "discipline": "WTB", "permit_required": false},
                {"text": "Load cells indicator reinigen met droge doek", "type": "goed_fout", "component": "Sensor", "discipline": "WTB", "permit_required": false}
            ]
        },
        {
            "title": "PG2 — Ruwwaterpomp 1",
            "questions": [
                {"text": "Ruwwaterpomp op aangroei en beschadigingen controleren", "type": "goed_fout", "component": "Ruwwaterpomp", "discipline": "WTB", "permit_required": false},
                {"text": "Spervloeistof controleren", "type": "goed_fout", "component": "Ruwwaterpomp", "discipline": "WTB", "permit_required": false},
                {"text": "Elektromotor op beschadigingen controleren", "type": "goed_fout", "component": "Elektromotor", "discipline": "WTB", "permit_required": false},
                {"text": "Motordeksel op beschadigingen controleren", "type": "goed_fout", "component": "Elektromotor", "discipline": "WTB", "permit_required": false},
                {"text": "Kabeldoorvoer en kabel op beschadigingen controleren", "type": "goed_fout", "component": "Bekabeling", "discipline": "WTB", "permit_required": false},
                {"text": "Weerstandsvrijheid van aansluitingen controleren", "type": "goed_fout", "component": "Bekabeling", "discipline": "WTB", "permit_required": false},
                {"text": "Leidingen, flenzen en appendages op lekkage en corrosie controleren", "type": "goed_fout", "component": "Buisleiding", "discipline": "WTB", "permit_required": false},
                {"text": "Kabels, doorvoeren, IP68 afdichtingen en hijsogen controleren", "type": "goed_fout", "component": "Bekabeling", "discipline": "WTB", "permit_required": false}
            ]
        },
        {
            "title": "PG2 — Ruwwaterpomp 2",
            "questions": [
                {"text": "Ruwwaterpomp op aangroei en beschadigingen controleren", "type": "goed_fout", "component": "Ruwwaterpomp", "discipline": "WTB", "permit_required": false},
                {"text": "Spervloeistof controleren", "type": "goed_fout", "component": "Ruwwaterpomp", "discipline": "WTB", "permit_required": false},
                {"text": "Elektromotor op beschadigingen controleren", "type": "goed_fout", "component": "Elektromotor", "discipline": "WTB", "permit_required": false},
                {"text": "Motordeksel op beschadigingen controleren", "type": "goed_fout", "component": "Elektromotor", "discipline": "WTB", "permit_required": false},
                {"text": "Kabeldoorvoer en kabel op beschadigingen controleren", "type": "goed_fout", "component": "Bekabeling", "discipline": "WTB", "permit_required": false},
                {"text": "Weerstandsvrijheid van aansluitingen controleren", "type": "goed_fout", "component": "Bekabeling", "discipline": "WTB", "permit_required": false},
                {"text": "Leidingen, flenzen en appendages op lekkage en corrosie controleren", "type": "goed_fout", "component": "Buisleiding", "discipline": "WTB", "permit_required": false},
                {"text": "Kabels, doorvoeren, IP68 afdichtingen en hijsogen controleren", "type": "goed_fout", "component": "Bekabeling", "discipline": "WTB", "permit_required": false}
            ]
        },
        {
            "title": "PG2 — Beunkoeler 1",
            "questions": [
                {"text": "Beunkoeler op aangroei en beschadigingen controleren", "type": "goed_fout", "component": "Beunkoeler", "discipline": "WTB", "permit_required": false},
                {"text": "Leidingen, flenzen en appendages op lekkage en corrosie controleren", "type": "goed_fout", "component": "Buisleiding", "discipline": "WTB", "permit_required": false},
                {"text": "Load cells indicator reinigen met droge doek", "type": "goed_fout", "component": "Sensor", "discipline": "WTB", "permit_required": false}
            ]
        },
        {
            "title": "PG2 — Beunkoeler 2",
            "questions": [
                {"text": "Beunkoeler op aangroei en beschadigingen controleren", "type": "goed_fout", "component": "Beunkoeler", "discipline": "WTB", "permit_required": false},
                {"text": "Leidingen, flenzen en appendages op lekkage en corrosie controleren", "type": "goed_fout", "component": "Buisleiding", "discipline": "WTB", "permit_required": false},
                {"text": "Load cells indicator reinigen met droge doek", "type": "goed_fout", "component": "Sensor", "discipline": "WTB", "permit_required": false}
            ]
        },
        {
            "title": "Algemeen — Inlaat & sensoren",
            "questions": [
                {"text": "Inlaatroosters inspecteren en grofvuil verwijderen", "type": "goed_fout", "component": "Inlaatrooster", "discipline": "WTB", "permit_required": false},
                {"text": "Zuigkast inspecteren en grofvuil verwijderen", "type": "goed_fout", "component": "Zuigkast", "discipline": "WTB", "permit_required": false},
                {"text": "Sensoren schoonmaken", "type": "goed_fout", "component": "Sensor", "discipline": "WTB", "permit_required": false}
            ]
        }
    ]'::jsonb,
    true
);

-- Template 2: Visuele inspectie skids
INSERT INTO inspection_templates (
    name, description, category, location, installation, asset, frequency, frequency_code, sections, is_active
) VALUES (
    'Visuele inspectie koelwater skids',
    'Jaarlijkse visuele inspectie van hoofdpomp skid en verdelerskids. NSM-PG Pompinstallatie Koelwater. Geschatte duur: 10 uur. Verdelerskids voorzien lagers, motor en FO van koelwater.',
    'POH',
    'Pompgroepen Den Oever',
    'Pompinstallatie (Koelwater)',
    'Gemaal Pompgroep 1 & 2',
    '1 jaarlijks',
    '[i]',
    '[
        {
            "title": "Hoofdpomp skid",
            "questions": [
                {"text": "Controleer op lekkages/beschadigingen aan leidingen", "type": "goed_fout", "component": "Buisleiding", "discipline": "WTB", "permit_required": false},
                {"text": "Controleer pompen op lekkages en beschadigingen", "type": "goed_fout", "component": "Pomp", "discipline": "WTB", "permit_required": false},
                {"text": "Controleer warmtewisselaars op lekkages en beschadigingen", "type": "goed_fout", "component": "Warmtewisselaar", "discipline": "WTB", "permit_required": false},
                {"text": "Controleer op corrosie/vervuiling van metalen delen (pompen, frames, afsluiters en flenzen)", "type": "goed_fout", "component": "Frame", "discipline": "WTB", "permit_required": false},
                {"text": "Controleer kabels en aansluitingen op losse verbindingen of slijtage", "type": "goed_fout", "component": "Bekabeling", "discipline": "IA&E", "permit_required": false},
                {"text": "Controleer debietmeters op werking en aansluiting", "type": "goed_fout", "component": "Sensor", "discipline": "IA&E", "permit_required": false},
                {"text": "Controleer temperatuuropnemers op werking en aansluiting", "type": "goed_fout", "component": "Sensor", "discipline": "IA&E", "permit_required": false},
                {"text": "Controleer overige sensoren op losse verbindingen of slijtage", "type": "goed_fout", "component": "Sensor", "discipline": "IA&E", "permit_required": false},
                {"text": "Controleer motoren op beschadiging", "type": "goed_fout", "component": "Elektromotor", "discipline": "WTB", "permit_required": false},
                {"text": "Controleer motoren op trillingen, warmteontwikkeling of afwijkingen", "type": "goed_fout", "component": "Elektromotor", "discipline": "WTB", "permit_required": false}
            ]
        },
        {
            "title": "Verdelerskid 1 (Lagers)",
            "questions": [
                {"text": "Controleer op lekkages/beschadigingen aan leidingen", "type": "goed_fout", "component": "Buisleiding", "discipline": "WTB", "permit_required": false},
                {"text": "Controleer warmtewisselaars op lekkages en beschadigingen", "type": "goed_fout", "component": "Warmtewisselaar", "discipline": "WTB", "permit_required": false},
                {"text": "Controleer op corrosie/vervuiling van metalen delen (pompen, frames, afsluiters en flenzen)", "type": "goed_fout", "component": "Frame", "discipline": "WTB", "permit_required": false},
                {"text": "Controleer kabels en aansluitingen op losse verbindingen of slijtage", "type": "goed_fout", "component": "Bekabeling", "discipline": "IA&E", "permit_required": false},
                {"text": "Controleer debietmeters op werking en aansluiting", "type": "goed_fout", "component": "Sensor", "discipline": "IA&E", "permit_required": false},
                {"text": "Controleer temperatuuropnemers op werking en aansluiting", "type": "goed_fout", "component": "Sensor", "discipline": "IA&E", "permit_required": false},
                {"text": "Controleer motoren op beschadiging, trillingen en warmteontwikkeling", "type": "goed_fout", "component": "Elektromotor", "discipline": "WTB", "permit_required": false}
            ]
        },
        {
            "title": "Verdelerskid 2 (Motor)",
            "questions": [
                {"text": "Controleer op lekkages/beschadigingen aan leidingen", "type": "goed_fout", "component": "Buisleiding", "discipline": "WTB", "permit_required": false},
                {"text": "Controleer warmtewisselaars op lekkages en beschadigingen", "type": "goed_fout", "component": "Warmtewisselaar", "discipline": "WTB", "permit_required": false},
                {"text": "Controleer op corrosie/vervuiling van metalen delen (pompen, frames, afsluiters en flenzen)", "type": "goed_fout", "component": "Frame", "discipline": "WTB", "permit_required": false},
                {"text": "Controleer kabels en aansluitingen op losse verbindingen of slijtage", "type": "goed_fout", "component": "Bekabeling", "discipline": "IA&E", "permit_required": false},
                {"text": "Controleer debietmeters op werking en aansluiting", "type": "goed_fout", "component": "Sensor", "discipline": "IA&E", "permit_required": false},
                {"text": "Controleer temperatuuropnemers op werking en aansluiting", "type": "goed_fout", "component": "Sensor", "discipline": "IA&E", "permit_required": false},
                {"text": "Controleer motoren op beschadiging, trillingen en warmteontwikkeling", "type": "goed_fout", "component": "Elektromotor", "discipline": "WTB", "permit_required": false}
            ]
        },
        {
            "title": "Verdelerskid 3 (FO)",
            "questions": [
                {"text": "Controleer op lekkages/beschadigingen aan leidingen", "type": "goed_fout", "component": "Buisleiding", "discipline": "WTB", "permit_required": false},
                {"text": "Controleer warmtewisselaars op lekkages en beschadigingen", "type": "goed_fout", "component": "Warmtewisselaar", "discipline": "WTB", "permit_required": false},
                {"text": "Controleer op corrosie/vervuiling van metalen delen (pompen, frames, afsluiters en flenzen)", "type": "goed_fout", "component": "Frame", "discipline": "WTB", "permit_required": false},
                {"text": "Controleer kabels en aansluitingen op losse verbindingen of slijtage", "type": "goed_fout", "component": "Bekabeling", "discipline": "IA&E", "permit_required": false},
                {"text": "Controleer debietmeters op werking en aansluiting", "type": "goed_fout", "component": "Sensor", "discipline": "IA&E", "permit_required": false},
                {"text": "Controleer temperatuuropnemers op werking en aansluiting", "type": "goed_fout", "component": "Sensor", "discipline": "IA&E", "permit_required": false},
                {"text": "Controleer motoren op beschadiging, trillingen en warmteontwikkeling", "type": "goed_fout", "component": "Elektromotor", "discipline": "WTB", "permit_required": false}
            ]
        }
    ]'::jsonb,
    true
);
