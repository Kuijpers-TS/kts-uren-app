#!/usr/bin/env python3
# =============================================================================
# KTS Uren App - index.html opsplitsen in css/ en js/ bestanden
# =============================================================================
# Mechanische, verifieerbare splitsing:
#   1. De twee grote <style>-blokken in de head worden css-bestanden
#   2. Het grote <script>-blok wordt op opgegeven regelnummers geknipt in
#      js-bestanden (knip op top-level sectiemarkers, tussen functies)
#   3. VERIFICATIE: het tool plakt alles weer terug en vergelijkt byte-voor-
#      byte met het origineel. Elke js-chunk gaat door `node --check`.
#      index.html wordt ALLEEN vervangen als alles slaagt.
#
# Gebruik:
#   python tools/split-index.py markers
#       -> toont alle top-level sectiemarkers in het script-blok (kandidaat-
#          kniplijnen) met regelnummers
#   python tools/split-index.py split --cuts 9500,13000,17500,20200 \
#          --names core,uren,admin,inspecties,administratie
#       -> knipt het script-blok VOOR de eerstvolgende marker op/na elk
#          opgegeven regelnummer; aantal names = aantal cuts + 1
# =============================================================================
import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'index.html'
# Wordt in cmd_split gezet op basis van de werkelijke regeleindes in het
# bestand (CRLF op Windows-checkouts) · geconstrueerde regels moeten exact
# dezelfde eindes gebruiken voor de byte-identieke verificatie
NL = '\n'


def read_lines():
    raw = INDEX.read_bytes()
    text = raw.decode('utf-8')
    # splitlines(keepends=True) behoudt de exacte regeleindes (LF/CRLF)
    return raw, text.splitlines(keepends=True)


def find_blocks(lines):
    """Vind de style-blokken en het grote script-blok (0-based indexen)."""
    style_blocks = []  # (open_idx, close_idx) exclusief taglijnen
    script_block = None
    open_idx = None
    kind = None
    for i, line in enumerate(lines):
        s = line.strip()
        if open_idx is None:
            if s == '<style>':
                open_idx, kind = i, 'style'
            elif s == '<script>':
                open_idx, kind = i, 'script'
        else:
            if kind == 'style' and s == '</style>':
                style_blocks.append((open_idx, i))
                open_idx, kind = None, None
            elif kind == 'script' and s == '</script>':
                if i - open_idx > 5000:  # alleen het gigantische app-script
                    script_block = (open_idx, i)
                open_idx, kind = None, None
    # Alleen de grote head-styleblokken (>500 regels) · kleine inline blokken
    # (login-responsive css) laten we met rust
    style_blocks = [b for b in style_blocks if b[1] - b[0] > 500]
    return style_blocks, script_block


def cmd_markers():
    _, lines = read_lines()
    _, script = find_blocks(lines)
    if not script:
        sys.exit('Geen groot script-blok gevonden')
    print(f'Script-blok: regel {script[0] + 1} t/m {script[1] + 1}')
    print('Top-level sectiemarkers (kandidaat-kniplijnen):')
    marker_re = re.compile(r'^\s{0,12}// =====')
    for i in range(script[0] + 1, script[1]):
        if marker_re.match(lines[i]):
            print(f'  {i + 1}: {lines[i].strip()[:90]}')


def cmd_split(cuts, names):
    global NL
    raw, lines = read_lines()
    # Regeleinde-stijl overnemen van het bestand zelf
    NL = '\r\n' if lines and lines[0].endswith('\r\n') else '\n'
    styles, script = find_blocks(lines)
    if len(styles) != 2 or not script:
        sys.exit(f'Onverwachte structuur: {len(styles)} grote style-blokken, script={script}')
    if len(names) != len(cuts) + 1:
        sys.exit(f'{len(cuts)} cuts vereist {len(cuts) + 1} names, kreeg {len(names)}')

    s_open, s_close = script
    marker_re = re.compile(r'^\s{0,12}// =====')

    # Zoek voor elke cut de eerstvolgende markerregel op/na dat regelnummer
    cut_idxs = []
    for c in cuts:
        idx = None
        for i in range(max(c - 1, s_open + 1), s_close):
            if marker_re.match(lines[i]):
                idx = i
                break
        if idx is None:
            sys.exit(f'Geen sectiemarker gevonden op/na regel {c}')
        cut_idxs.append(idx)
    if cut_idxs != sorted(set(cut_idxs)):
        sys.exit(f'Kniplijnen overlappen of staan niet oplopend: {[i + 1 for i in cut_idxs]}')
    print('Knippen op regels:', ', '.join(str(i + 1) for i in cut_idxs))

    # --- CSS-bestanden ---
    css_dir = ROOT / 'css'
    css_dir.mkdir(exist_ok=True)
    css_files = ['base.css', 'design-system.css']
    css_contents = []
    for (b, fname) in zip(styles, css_files):
        content = ''.join(lines[b[0] + 1:b[1]])
        (css_dir / fname).write_text(content, encoding='utf-8', newline='')
        css_contents.append(content)
        print(f'css/{fname}: {b[1] - b[0] - 1} regels')

    # --- JS-bestanden ---
    js_dir = ROOT / 'js'
    js_dir.mkdir(exist_ok=True)
    bounds = [s_open + 1] + cut_idxs + [s_close]
    js_files = [f'{n}.js' for n in names]
    js_contents = []
    for k, fname in enumerate(js_files):
        content = ''.join(lines[bounds[k]:bounds[k + 1]])
        (js_dir / fname).write_text(content, encoding='utf-8', newline='')
        js_contents.append(content)
        print(f'js/{fname}: {bounds[k + 1] - bounds[k]} regels')

    # --- Validatie 1: node --check per chunk ---
    for fname in js_files:
        r = subprocess.run(['node', '--check', str(js_dir / fname)],
                           capture_output=True, text=True, shell=True)
        if r.returncode != 0:
            sys.exit(f'SYNTAXFOUT in js/{fname} (knip valt in een constructie):\n{r.stderr[:2000]}')
        print(f'node --check js/{fname}: OK')

    # --- Nieuwe index.html opbouwen ---
    out = []
    i = 0
    n = len(lines)
    style_no = 0
    while i < n:
        if style_no < 2 and i == styles[style_no][0]:
            indent = lines[i][:len(lines[i]) - len(lines[i].lstrip())]
            out.append(f'{indent}<link rel="stylesheet" href="css/{css_files[style_no]}">{NL}')
            i = styles[style_no][1] + 1
            style_no += 1
        elif i == s_open:
            indent = lines[i][:len(lines[i]) - len(lines[i].lstrip())]
            for fname in js_files:
                out.append(f'{indent}<script src="js/{fname}"></script>{NL}')
            i = s_close + 1
        else:
            out.append(lines[i])
            i += 1
    new_html = ''.join(out)

    # --- Validatie 2: byte-identieke reconstructie ---
    # Plak de externe bestanden virtueel terug en vergelijk met het origineel
    recon = new_html
    for fname, content in zip(css_files, css_contents):
        link = f'<link rel="stylesheet" href="css/{fname}">'
        # zoek de regel met de link en vervang door origineel style-blok
        # (lookahead ipv \r? consumeren · zo blijft het originele regeleinde
        # na de vervanging intact voor de byte-vergelijking)
        pattern = re.compile(r'^([ \t]*)' + re.escape(link) + r'(?=\r?\n|\r?$)', re.M)
        m = pattern.search(recon)
        if not m:
            sys.exit(f'Reconstructie: link voor {fname} niet gevonden')
        indent = m.group(1)
        recon = recon[:m.start()] + f'{indent}<style>{NL}{content}{indent}</style>' + recon[m.end():]
    script_tags = ''.join(
        f'<script src="js/{f}"></script>{NL}' for f in js_files
    )
    # de opeenvolgende script-tags (met indent) terugvervangen door één blok
    first_tag = f'<script src="js/{js_files[0]}"></script>'
    m = re.search(r'^([ \t]*)' + re.escape(first_tag) + r'(?=\r?\n|\r?$)', recon, re.M)
    if not m:
        sys.exit('Reconstructie: eerste script-tag niet gevonden')
    indent = m.group(1)
    all_tags = ''.join(f'{indent}<script src="js/{f}"></script>{NL}' for f in js_files)
    start = recon.find(all_tags)
    if start < 0:
        sys.exit('Reconstructie: script-tagreeks niet aaneengesloten gevonden')
    recon = (recon[:start]
             + f'{indent}<script>{NL}' + ''.join(js_contents) + f'{indent}</script>{NL}'
             + recon[start + len(all_tags):])

    if recon.encode('utf-8') != raw:
        # Schrijf debug-bestand voor diff-onderzoek
        (ROOT / 'tools' / '_recon_debug.html').write_text(recon, encoding='utf-8', newline='')
        sys.exit('VERIFICATIE GEFAALD: reconstructie is niet byte-identiek. '
                 'index.html is NIET aangepast. Zie tools/_recon_debug.html')
    print('Byte-identieke reconstructie: OK')

    # --- Pas nu index.html echt vervangen ---
    INDEX.write_text(new_html, encoding='utf-8', newline='')
    print(f'index.html herschreven: {len(new_html.splitlines())} regels '
          f'(was {len(lines)})')
    print('KLAAR. Vergeet niet: sw.js ASSETS_TO_CACHE bijwerken + cache-bump.')


def main():
    # Windows-console gebruikt cp1252 · voorkom UnicodeEncodeError bij het
    # printen van markers met unicode-tekens
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest='cmd', required=True)
    sub.add_parser('markers')
    sp = sub.add_parser('split')
    sp.add_argument('--cuts', required=True,
                    help='komma-gescheiden regelnummers (1-based)')
    sp.add_argument('--names', required=True,
                    help='komma-gescheiden bestandsnamen zonder .js (cuts+1 stuks)')
    args = p.parse_args()
    if args.cmd == 'markers':
        cmd_markers()
    else:
        cuts = [int(x) for x in args.cuts.split(',')]
        names = [x.strip() for x in args.names.split(',')]
        cmd_split(cuts, names)


if __name__ == '__main__':
    main()
