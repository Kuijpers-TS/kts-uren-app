"""
Generates Excel templates voor weekstaat, inkooporder en factuur
matching de PDF-designs (KTS huisstijl Rev A).

Output: templates/KTS-{Weekstaat,Inkooporder,Factuur}-template-RevA.xlsx
"""
import sys, os
sys.stdout.reconfigure(encoding='utf-8') if hasattr(sys.stdout, 'reconfigure') else None

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.drawing.image import Image as XLImage
from openpyxl.utils import get_column_letter

KTS_BLUE = "07567F"
KTS_BLUE_LIGHT = "EAF2F7"
INK_900 = "0F1B2D"
INK_500 = "5C6675"
INK_400 = "8A93A1"
LIGHT_BG = "F8F8F4"
LINE_LIGHT = "DCDCDC"
WEEKEND_BG = "F5F0E6"

# Logo paden (Windows-compatible). Probeer eerst lokale kopie, anders huisstijl-bron.
LOGO_PATH = None
for p in [
    'tools/_K_logo_temp.png',
    r'C:\Users\mkuij\OneDrive\Administratie KTS BV\Website KTDS.eu KTS\KTS Branding\KTS_Huisstijl_RevA_complete\logo_bronbestanden\png_hires\K_solo_primary_2400px.png'
]:
    if os.path.exists(p):
        LOGO_PATH = p
        break

def thin_border(color=LINE_LIGHT):
    s = Side(border_style="thin", color=color)
    return Border(left=s, right=s, top=s, bottom=s)

def header_fill():
    return PatternFill(start_color=KTS_BLUE, end_color=KTS_BLUE, fill_type="solid")

def soft_fill():
    return PatternFill(start_color=LIGHT_BG, end_color=LIGHT_BG, fill_type="solid")

def set_print_a4(ws, landscape=False):
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.orientation = ws.ORIENTATION_LANDSCAPE if landscape else ws.ORIENTATION_PORTRAIT
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 1
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_margins.left = 0.4
    ws.page_margins.right = 0.4
    ws.page_margins.top = 0.4
    ws.page_margins.bottom = 0.4

# =============================================================
# 1. WEEKSTAAT — landscape A4
# =============================================================
def make_weekstaat():
    wb = Workbook()
    ws = wb.active
    ws.title = "Weekstaat"
    set_print_a4(ws, landscape=True)

    widths = [11, 12, 11, 11, 9, 12, 36, 18, 8]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    if LOGO_PATH and os.path.exists(LOGO_PATH):
        try:
            img = XLImage(LOGO_PATH)
            img.width = 110
            img.height = 73
            ws.add_image(img, 'H1')
        except Exception as e:
            print('  logo embed faal:', e)

    ws['A1'] = "URENSTAAT"
    ws['A1'].font = Font(name='Calibri', size=24, bold=True, color=KTS_BLUE)
    ws.row_dimensions[1].height = 32

    ws['F4'] = "Nieuwboerweg 2A, 1738BB Waarland"
    ws['F4'].font = Font(name='Calibri', size=9, color=INK_500)
    ws['F4'].alignment = Alignment(horizontal='right')
    ws.merge_cells('F4:I4')
    ws['F5'] = "+31 6 5123 9050  -  info@kuijpers-ts.nl"
    ws['F5'].font = Font(name='Calibri', size=9, color=INK_500)
    ws['F5'].alignment = Alignment(horizontal='right')
    ws.merge_cells('F5:I5')

    label_font = Font(name='Calibri', size=8, color=INK_400)
    value_font = Font(name='Calibri', size=12, bold=True, color=INK_900)

    ws['A4'] = "NAAM"
    ws['A4'].font = label_font
    ws['A5'] = "[Vul je naam in]"
    ws['A5'].font = value_font
    ws.merge_cells('A5:C5')

    ws['D4'] = "PERIODE"
    ws['D4'].font = label_font
    ws['D5'] = "Week XX - 2026"
    ws['D5'].font = value_font
    ws.merge_cells('D5:E5')

    ws['A7'] = "PROJECT"
    ws['A7'].font = label_font
    ws['A8'] = "[Projectnaam]"
    ws['A8'].font = Font(name='Calibri', size=11, bold=True, color=INK_900)
    ws.merge_cells('A8:C8')

    ws['D7'] = "OPDRACHTGEVER"
    ws['D7'].font = label_font
    ws['D8'] = "[Klantnaam]"
    ws['D8'].font = Font(name='Calibri', size=11, bold=True, color=INK_900)
    ws.merge_cells('D8:E8')

    headers = ["DAG", "DATUM", "BEGINTIJD", "EINDTIJD", "PAUZE", "GEW. UREN", "WERKZAAMHEDEN", "LOCATIE", "KM"]
    header_row = 10
    for col, h in enumerate(headers, start=1):
        c = ws.cell(row=header_row, column=col, value=h)
        c.font = Font(name='Calibri', size=9, bold=True, color="FFFFFF")
        c.fill = header_fill()
        c.alignment = Alignment(
            horizontal='center' if h not in ['DAG', 'WERKZAAMHEDEN', 'LOCATIE'] else 'left',
            vertical='center'
        )
        c.border = thin_border()
    ws.row_dimensions[header_row].height = 22

    days = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag']
    for i, day in enumerate(days):
        row = header_row + 1 + i
        ws.cell(row=row, column=1, value=day).font = Font(name='Calibri', size=10, color=INK_900)
        ws.cell(row=row, column=1).alignment = Alignment(horizontal='left', vertical='center')
        for col in range(1, 10):
            cell = ws.cell(row=row, column=col)
            cell.border = thin_border()
            if col not in [1, 7, 8]:
                cell.alignment = Alignment(horizontal='center', vertical='center')
            else:
                cell.alignment = Alignment(horizontal='left', vertical='center')
        if i >= 5:
            for col in range(1, 10):
                ws.cell(row=row, column=col).fill = PatternFill(start_color=WEEKEND_BG, end_color=WEEKEND_BG, fill_type="solid")
        ws.row_dimensions[row].height = 20

    sum_row = header_row + 1 + 7 + 1
    val_row = sum_row + 1

    kpi_labels = ["REGULIER MA-VR", "ZATERDAG", "ZONDAG/FEEST", "REIS KM", "TOTAAL TE FACTUREREN"]
    for col, lab in enumerate(kpi_labels, start=1):
        c = ws.cell(row=sum_row, column=col, value=lab)
        c.font = Font(name='Calibri', size=8, color="FFFFFF" if col == 5 else INK_400, bold=(col == 5))
        c.fill = header_fill() if col == 5 else soft_fill()
        c.alignment = Alignment(horizontal='center', vertical='center')
        c.border = thin_border()

    formulas = [
        f"=SUM(F{header_row+1}:F{header_row+5})",
        f"=F{header_row+6}",
        f"=F{header_row+7}",
        f"=SUM(I{header_row+1}:I{header_row+7})",
        f"=SUM(F{header_row+1}:F{header_row+7})"
    ]
    for col, f in enumerate(formulas, start=1):
        c = ws.cell(row=val_row, column=col, value=f)
        c.font = Font(name='Calibri', size=20, bold=True, color="FFFFFF" if col == 5 else INK_900)
        c.fill = header_fill() if col == 5 else soft_fill()
        c.alignment = Alignment(horizontal='center', vertical='center')
        c.border = thin_border()

    ws.row_dimensions[sum_row].height = 14
    ws.row_dimensions[val_row].height = 28

    ws.cell(row=sum_row, column=7, value="OPMERKINGEN").font = Font(name='Calibri', size=8, color=INK_400)
    ws.cell(row=sum_row, column=7).fill = soft_fill()
    ws.cell(row=sum_row, column=7).alignment = Alignment(horizontal='left')
    for r in [sum_row, val_row]:
        for col in range(7, 10):
            ws.cell(row=r, column=col).fill = soft_fill()
            ws.cell(row=r, column=col).border = thin_border()
    ws.merge_cells(start_row=sum_row, start_column=7, end_row=sum_row, end_column=9)
    ws.merge_cells(start_row=val_row, start_column=7, end_row=val_row, end_column=9)
    ws.cell(row=val_row, column=7).alignment = Alignment(horizontal='left', vertical='top', wrap_text=True)

    sig_row = val_row + 2
    ws.cell(row=sig_row, column=1, value="HANDTEKENING OPDRACHTNEMER").font = Font(name='Calibri', size=8, bold=True, color=INK_400)
    ws.cell(row=sig_row, column=6, value="HANDTEKENING OPDRACHTGEVER").font = Font(name='Calibri', size=8, bold=True, color=INK_400)
    ws.merge_cells(start_row=sig_row, start_column=1, end_row=sig_row, end_column=5)
    ws.merge_cells(start_row=sig_row, start_column=6, end_row=sig_row, end_column=9)

    for r in range(sig_row, sig_row + 4):
        for col_range in [(1, 5), (6, 9)]:
            for col in range(col_range[0], col_range[1] + 1):
                ws.cell(row=r, column=col).border = thin_border()
        if r > sig_row:
            ws.row_dimensions[r].height = 22

    foot_row = sig_row + 5
    ws.cell(row=foot_row, column=1, value="Op deze opdracht zijn de Algemene Voorwaarden Detachering 2026 van Kuijpers Technical Services BV van toepassing.").font = Font(name='Calibri', size=7, color=INK_400)
    ws.merge_cells(start_row=foot_row, start_column=1, end_row=foot_row, end_column=9)

    out = 'templates/KTS-Weekstaat-template-RevA.xlsx'
    wb.save(out)
    print('  Weekstaat:', out)

# =============================================================
# 2. INKOOPORDER — portrait A4
# =============================================================
def make_inkooporder():
    wb = Workbook()
    ws = wb.active
    ws.title = "Inkooporder"
    set_print_a4(ws, landscape=False)

    widths = [4, 24, 18, 14, 14, 16, 18]  # 7 kolommen
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    # Title
    ws['A1'] = "INKOOPORDER"
    ws['A1'].font = Font(name='Calibri', size=24, bold=True, color=KTS_BLUE)
    ws.row_dimensions[1].height = 32

    # Logo + adres rechts
    if LOGO_PATH and os.path.exists(LOGO_PATH):
        try:
            img = XLImage(LOGO_PATH)
            img.width = 95
            img.height = 63
            ws.add_image(img, 'F1')
        except Exception:
            pass

    ws['F4'] = "Nieuwboerweg 2A, 1738BB Waarland"
    ws['F4'].font = Font(name='Calibri', size=9, color=INK_500)
    ws['F4'].alignment = Alignment(horizontal='right')
    ws.merge_cells('F4:G4')
    ws['F5'] = "+31 6 5123 9050  -  info@kuijpers-ts.nl"
    ws['F5'].font = Font(name='Calibri', size=9, color=INK_500)
    ws['F5'].alignment = Alignment(horizontal='right')
    ws.merge_cells('F5:G5')

    # Info-bar 4 cellen rij 7
    info_row = 7
    info_data = [
        ("PROJECT", "[Projectcode]"),
        ("SCHEIDINGSTEKEN", "-"),
        ("DATUM", "[DD-MM-JJJJ]"),
        ("PO-NUMMER", "[Auto]")
    ]
    cols_per_cell = [(1, 2), (3, 3), (4, 5), (6, 7)]
    for (start_col, end_col), (lbl, val) in zip(cols_per_cell, info_data):
        ws.cell(row=info_row, column=start_col, value=lbl).font = Font(name='Calibri', size=8, color=INK_400)
        ws.cell(row=info_row + 1, column=start_col, value=val).font = Font(name='Calibri', size=11, bold=True, color=INK_900)
        for r in range(info_row, info_row + 2):
            for col in range(start_col, end_col + 1):
                ws.cell(row=r, column=col).fill = soft_fill()
                ws.cell(row=r, column=col).border = thin_border()
                ws.cell(row=r, column=col).alignment = Alignment(horizontal='left', vertical='center')
        if start_col != end_col:
            ws.merge_cells(start_row=info_row, start_column=start_col, end_row=info_row, end_column=end_col)
            ws.merge_cells(start_row=info_row + 1, start_column=start_col, end_row=info_row + 1, end_column=end_col)
    ws.row_dimensions[info_row].height = 12
    ws.row_dimensions[info_row + 1].height = 22

    # Leverancier + Leveradres blokken
    block_row = info_row + 3
    ws.cell(row=block_row, column=1, value="LEVERANCIER").font = Font(name='Calibri', size=9, bold=True, color="FFFFFF")
    ws.cell(row=block_row, column=4, value="LEVERADRES").font = Font(name='Calibri', size=9, bold=True, color="FFFFFF")
    for col in range(1, 4):
        ws.cell(row=block_row, column=col).fill = header_fill()
        ws.cell(row=block_row, column=col).alignment = Alignment(horizontal='left', vertical='center')
    ws.merge_cells(start_row=block_row, start_column=1, end_row=block_row, end_column=3)
    for col in range(4, 8):
        ws.cell(row=block_row, column=col).fill = header_fill()
        ws.cell(row=block_row, column=col).alignment = Alignment(horizontal='left', vertical='center')
    ws.merge_cells(start_row=block_row, start_column=4, end_row=block_row, end_column=7)
    ws.row_dimensions[block_row].height = 18

    # Block content (5 regels)
    leverancier = [
        ("[Bedrijfsnaam leverancier]", True),
        ("[Contactpersoon]", False),
        ("[Adres]", False),
        ("[Postcode + plaats]", False),
        ("[Telefoon  -  E-mail]", False)
    ]
    leveradres = [
        ("Kuijpers Technical Services BV", True),
        ("Crediteurenadministratie", False),
        ("Nieuwboerweg 2A", False),
        ("1738BB, Waarland", False),
        ("+31 6 5123 9050  -  info@kuijpers-ts.nl", False)
    ]
    for i, ((l_text, l_bold), (r_text, r_bold)) in enumerate(zip(leverancier, leveradres)):
        r = block_row + 1 + i
        ws.cell(row=r, column=1, value=l_text).font = Font(name='Calibri', size=9, bold=l_bold, color=INK_900 if l_bold else INK_500)
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=3)
        ws.cell(row=r, column=4, value=r_text).font = Font(name='Calibri', size=9, bold=r_bold, color=INK_900 if r_bold else INK_500)
        ws.merge_cells(start_row=r, start_column=4, end_row=r, end_column=7)
        for col in range(1, 8):
            ws.cell(row=r, column=col).fill = soft_fill()
            ws.cell(row=r, column=col).border = thin_border()
        ws.row_dimensions[r].height = 16

    # Items tabel
    item_header_row = block_row + 7
    item_headers = ["ITEM #", "OMSCHRIJVING", "AANTAL", "EENHEID", "PRIJS / STUK", "TOTAAL"]
    item_cols_widths = [(1, 1), (2, 3), (4, 4), (5, 5), (6, 6), (7, 7)]
    for col_idx, ((s, e), h) in enumerate(zip(item_cols_widths, item_headers)):
        c = ws.cell(row=item_header_row, column=s, value=h)
        c.font = Font(name='Calibri', size=9, bold=True, color="FFFFFF")
        c.fill = header_fill()
        c.alignment = Alignment(horizontal='center', vertical='center')
        if s != e:
            ws.merge_cells(start_row=item_header_row, start_column=s, end_row=item_header_row, end_column=e)
        for col in range(s, e + 1):
            ws.cell(row=item_header_row, column=col).border = thin_border()
            ws.cell(row=item_header_row, column=col).fill = header_fill()
    ws.row_dimensions[item_header_row].height = 20

    # 8 lege regels
    for i in range(1, 9):
        r = item_header_row + i
        ws.cell(row=r, column=1, value=i).alignment = Alignment(horizontal='center')
        # totaal-formule = aantal * prijs
        ws.cell(row=r, column=7, value=f"=IFERROR(D{r}*F{r},\"\")").alignment = Alignment(horizontal='right')
        ws.cell(row=r, column=7).number_format = '#,##0.00 €'
        ws.cell(row=r, column=6).number_format = '#,##0.00 €'
        for col in range(1, 8):
            ws.cell(row=r, column=col).border = thin_border()
            ws.cell(row=r, column=col).font = Font(name='Calibri', size=10)
            if col == 1:
                ws.cell(row=r, column=col).font = Font(name='Calibri', size=10, color=INK_500)
        ws.row_dimensions[r].height = 22

    # Totalen blok rechts
    tot_start_row = item_header_row + 9
    ws.cell(row=tot_start_row, column=5, value="Subtotaal").font = Font(name='Calibri', size=10, color=INK_500)
    sub_formula = f"=SUM(G{item_header_row+1}:G{item_header_row+8})"
    ws.cell(row=tot_start_row, column=7, value=sub_formula).font = Font(name='Calibri', size=10, bold=True, color=INK_900)
    ws.cell(row=tot_start_row, column=7).number_format = '#,##0.00 €'
    ws.cell(row=tot_start_row, column=7).alignment = Alignment(horizontal='right')

    ws.cell(row=tot_start_row + 1, column=5, value="BTW (21%)").font = Font(name='Calibri', size=10, color=INK_500)
    ws.cell(row=tot_start_row + 1, column=7, value=f"=G{tot_start_row}*0.21").font = Font(name='Calibri', size=10, bold=True, color=INK_900)
    ws.cell(row=tot_start_row + 1, column=7).number_format = '#,##0.00 €'
    ws.cell(row=tot_start_row + 1, column=7).alignment = Alignment(horizontal='right')

    ws.cell(row=tot_start_row + 2, column=5, value="Transport").font = Font(name='Calibri', size=10, color=INK_500)
    ws.cell(row=tot_start_row + 2, column=7, value=0).number_format = '#,##0.00 €'

    ws.cell(row=tot_start_row + 3, column=5, value="Overige").font = Font(name='Calibri', size=10, color=INK_500)
    ws.cell(row=tot_start_row + 3, column=7, value=0).number_format = '#,##0.00 €'

    # TOTAAL band
    total_row = tot_start_row + 4
    ws.cell(row=total_row, column=5, value="TOTAAL").font = Font(name='Calibri', size=11, bold=True, color="FFFFFF")
    ws.cell(row=total_row, column=7, value=f"=G{tot_start_row}+G{tot_start_row+1}+G{tot_start_row+2}+G{tot_start_row+3}").font = Font(name='Calibri', size=14, bold=True, color="FFFFFF")
    ws.cell(row=total_row, column=7).number_format = '#,##0.00 €'
    ws.cell(row=total_row, column=7).alignment = Alignment(horizontal='right', vertical='center')
    ws.cell(row=total_row, column=5).alignment = Alignment(horizontal='left', vertical='center')
    ws.cell(row=total_row, column=5).fill = header_fill()
    ws.cell(row=total_row, column=6).fill = header_fill()
    ws.cell(row=total_row, column=7).fill = header_fill()
    ws.row_dimensions[total_row].height = 24

    # Opmerkingen links
    ws.cell(row=tot_start_row, column=1, value="OPMERKINGEN OF SPECIALE INSTRUCTIES").font = Font(name='Calibri', size=8, bold=True, color="FFFFFF")
    for col in range(1, 5):
        ws.cell(row=tot_start_row, column=col).fill = header_fill()
    ws.merge_cells(start_row=tot_start_row, start_column=1, end_row=tot_start_row, end_column=4)
    ws.cell(row=tot_start_row + 1, column=1, value="[Vul opmerkingen in...]").font = Font(name='Calibri', size=10, color=INK_500)
    ws.merge_cells(start_row=tot_start_row + 1, start_column=1, end_row=tot_start_row + 3, end_column=4)
    ws.cell(row=tot_start_row + 1, column=1).alignment = Alignment(horizontal='left', vertical='top', wrap_text=True)
    # Soft fill alleen voor de inhoud-rijen (niet voor de blauwe header)
    for r in range(tot_start_row + 1, total_row):
        for col in range(1, 5):
            ws.cell(row=r, column=col).fill = soft_fill()
    ws.cell(row=total_row, column=1, value="BETALINGSTERMIJN").font = Font(name='Calibri', size=8, color=INK_400)
    ws.cell(row=total_row, column=2, value="30 dagen na factuurdatum").font = Font(name='Calibri', size=10, bold=True, color=INK_900)

    # Footer
    foot_row = total_row + 3
    ws.cell(row=foot_row, column=1, value="Op deze inkooporder zijn de Algemene Voorwaarden 2026 van Kuijpers Technical Services BV van toepassing.").font = Font(name='Calibri', size=7, color=INK_400)
    ws.merge_cells(start_row=foot_row, start_column=1, end_row=foot_row, end_column=7)

    out = 'templates/KTS-Inkooporder-template-RevA.xlsx'
    wb.save(out)
    print('  Inkooporder:', out)

# =============================================================
# 3. FACTUUR — portrait A4
# =============================================================
def make_factuur():
    wb = Workbook()
    ws = wb.active
    ws.title = "Factuur"
    set_print_a4(ws, landscape=False)

    widths = [22, 28, 12, 14, 16, 18, 8]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    # Title
    ws['A1'] = "FACTUUR"
    ws['A1'].font = Font(name='Calibri', size=24, bold=True, color=KTS_BLUE)
    ws.row_dimensions[1].height = 32

    # Logo + adres rechts
    if LOGO_PATH and os.path.exists(LOGO_PATH):
        try:
            img = XLImage(LOGO_PATH)
            img.width = 95
            img.height = 63
            ws.add_image(img, 'F1')
        except Exception:
            pass

    ws['F4'] = "Nieuwboerweg 2A, 1738BB Waarland"
    ws['F4'].font = Font(name='Calibri', size=9, color=INK_500)
    ws['F4'].alignment = Alignment(horizontal='right')
    ws.merge_cells('F4:G4')
    ws['F5'] = "+31 6 5123 9050  -  info@kuijpers-ts.nl"
    ws['F5'].font = Font(name='Calibri', size=9, color=INK_500)
    ws['F5'].alignment = Alignment(horizontal='right')
    ws.merge_cells('F5:G5')

    # Klant blok onder titel (links)
    ws['A4'] = "AAN"
    ws['A4'].font = Font(name='Calibri', size=8, color=INK_400)
    ws['A5'] = "[Klantnaam]"
    ws['A5'].font = Font(name='Calibri', size=12, bold=True, color=INK_900)
    ws['A6'] = "[t.a.v. crediteurenadministratie]"
    ws['A6'].font = Font(name='Calibri', size=10, color=INK_500)
    ws['A7'] = "[invoices@klant.nl]"
    ws['A7'].font = Font(name='Calibri', size=10, color=INK_500)
    ws['A8'] = "[Postbus / Adres]"
    ws['A8'].font = Font(name='Calibri', size=10, color=INK_500)
    ws['A9'] = "[Postcode plaats]"
    ws['A9'].font = Font(name='Calibri', size=10, color=INK_500)
    for r in range(5, 10):
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=3)

    # Info-bar 4 cellen
    info_row = 11
    info_data = [
        ("FACTUURNUMMER", "[2026-XX]", 1, 2),
        ("FACTUURDATUM", "[DD-MM-JJJJ]", 3, 4),
        ("VERVALDATUM", "[DD-MM-JJJJ]", 5, 5),
        ("PROJECT", "[Projectnaam]", 6, 7)
    ]
    for lbl, val, sc, ec in info_data:
        ws.cell(row=info_row, column=sc, value=lbl).font = Font(name='Calibri', size=8, color=INK_400)
        ws.cell(row=info_row + 1, column=sc, value=val).font = Font(name='Calibri', size=11, bold=True, color=INK_900)
        if sc != ec:
            ws.merge_cells(start_row=info_row, start_column=sc, end_row=info_row, end_column=ec)
            ws.merge_cells(start_row=info_row + 1, start_column=sc, end_row=info_row + 1, end_column=ec)
        for r in [info_row, info_row + 1]:
            for col in range(sc, ec + 1):
                ws.cell(row=r, column=col).fill = soft_fill()
                ws.cell(row=r, column=col).border = thin_border()
                ws.cell(row=r, column=col).alignment = Alignment(horizontal='left', vertical='center')
    ws.row_dimensions[info_row].height = 12
    ws.row_dimensions[info_row + 1].height = 22

    # Project-info compact (klein)
    proj_row = info_row + 3
    proj_lines = [
        ("Projectnummer", "[Nummer]"),
        ("Opdrachtnummer", "[Nummer]"),
        ("PO-nummer", "[Nummer]"),
        ("Loonheffingennummer KTDS Holding B.V.", "866381557L01"),
        ("Loonheffingennummer Kuijpers TD Holding B.V.", "866381594L01")
    ]
    for i, (lbl, val) in enumerate(proj_lines):
        r = proj_row + i
        sz = 10 if i < 3 else 8
        ws.cell(row=r, column=1, value=lbl).font = Font(name='Calibri', size=sz, color=INK_500 if i < 3 else INK_400)
        ws.cell(row=r, column=3, value=val).font = Font(name='Calibri', size=sz, bold=(i < 3), color=INK_900 if i < 3 else INK_500)
        ws.row_dimensions[r].height = 14

    # Items tabel
    items_header_row = proj_row + len(proj_lines) + 2
    item_headers = ["PERIODE", "OMSCHRIJVING", "AANTAL", "EENHEID", "TARIEF", "SUBTOTAAL", "BTW%"]
    for col, h in enumerate(item_headers, start=1):
        c = ws.cell(row=items_header_row, column=col, value=h)
        c.font = Font(name='Calibri', size=9, bold=True, color="FFFFFF")
        c.fill = header_fill()
        c.alignment = Alignment(horizontal='center', vertical='center')
        c.border = thin_border()
    ws.row_dimensions[items_header_row].height = 20

    # 6 lege rows
    for i in range(1, 7):
        r = items_header_row + i
        ws.cell(row=r, column=6, value=f"=IFERROR(C{r}*E{r},\"\")").alignment = Alignment(horizontal='right')
        ws.cell(row=r, column=6).number_format = '#,##0.00 €'
        ws.cell(row=r, column=5).number_format = '#,##0.00 €'
        ws.cell(row=r, column=7, value=21).alignment = Alignment(horizontal='right')
        for col in range(1, 8):
            ws.cell(row=r, column=col).border = thin_border()
            ws.cell(row=r, column=col).font = Font(name='Calibri', size=10)
        ws.row_dimensions[r].height = 22

    # Totalen rechts
    tot_row = items_header_row + 8
    ws.cell(row=tot_row, column=5, value="Subtotaal excl. BTW").font = Font(name='Calibri', size=10, color=INK_500)
    sub_formula = f"=SUM(F{items_header_row+1}:F{items_header_row+6})"
    ws.cell(row=tot_row, column=6, value=sub_formula).font = Font(name='Calibri', size=10, bold=True, color=INK_900)
    ws.cell(row=tot_row, column=6).number_format = '#,##0.00 €'
    ws.cell(row=tot_row, column=6).alignment = Alignment(horizontal='right')
    ws.merge_cells(start_row=tot_row, start_column=6, end_row=tot_row, end_column=7)

    ws.cell(row=tot_row + 1, column=5, value="BTW 21%").font = Font(name='Calibri', size=10, color=INK_500)
    ws.cell(row=tot_row + 1, column=6, value=f"=F{tot_row}*0.21").font = Font(name='Calibri', size=10, bold=True, color=INK_900)
    ws.cell(row=tot_row + 1, column=6).number_format = '#,##0.00 €'
    ws.cell(row=tot_row + 1, column=6).alignment = Alignment(horizontal='right')
    ws.merge_cells(start_row=tot_row + 1, start_column=6, end_row=tot_row + 1, end_column=7)

    total_row = tot_row + 2
    ws.cell(row=total_row, column=5, value="TOTAAL TE BETALEN").font = Font(name='Calibri', size=11, bold=True, color="FFFFFF")
    ws.cell(row=total_row, column=6, value=f"=F{tot_row}+F{tot_row+1}").font = Font(name='Calibri', size=14, bold=True, color="FFFFFF")
    ws.cell(row=total_row, column=6).number_format = '#,##0.00 €'
    ws.cell(row=total_row, column=6).alignment = Alignment(horizontal='right', vertical='center')
    ws.cell(row=total_row, column=5).alignment = Alignment(horizontal='left', vertical='center')
    for col in [5, 6, 7]:
        ws.cell(row=total_row, column=col).fill = header_fill()
    ws.merge_cells(start_row=total_row, start_column=6, end_row=total_row, end_column=7)
    ws.row_dimensions[total_row].height = 24

    # Betaal-verzoek + IBAN
    pay_row = total_row + 3
    ws.cell(row=pay_row, column=1, value="Wij verzoeken u vriendelijk het totaalbedrag uiterlijk vervaldatum over te maken,").font = Font(name='Calibri', size=10, color=INK_900)
    ws.merge_cells(start_row=pay_row, start_column=1, end_row=pay_row, end_column=7)
    ws.cell(row=pay_row + 1, column=1, value="onder vermelding van het factuurnummer, naar onderstaande bankrekening:").font = Font(name='Calibri', size=10, color=INK_900)
    ws.merge_cells(start_row=pay_row + 1, start_column=1, end_row=pay_row + 1, end_column=7)
    ws.cell(row=pay_row + 3, column=1, value="IBAN  NL61 BUNQ 2113 3747 30").font = Font(name='Calibri', size=11, bold=True, color=KTS_BLUE)
    ws.merge_cells(start_row=pay_row + 3, start_column=1, end_row=pay_row + 3, end_column=7)
    ws.cell(row=pay_row + 4, column=1, value="t.n.v. Kuijpers Technical Services BV  -  BIC: BUNQNL2A").font = Font(name='Calibri', size=9, color=INK_500)
    ws.merge_cells(start_row=pay_row + 4, start_column=1, end_row=pay_row + 4, end_column=7)

    # Footer
    foot_row = pay_row + 6
    ws.cell(row=foot_row, column=1, value="Op deze factuur zijn de Algemene Voorwaarden 2026 van Kuijpers Technical Services BV van toepassing.").font = Font(name='Calibri', size=7, color=INK_400)
    ws.merge_cells(start_row=foot_row, start_column=1, end_row=foot_row, end_column=7)

    out = 'templates/KTS-Factuur-template-RevA.xlsx'
    wb.save(out)
    print('  Factuur:', out)

if __name__ == '__main__':
    print('Genereren KTS Excel templates (huisstijl Rev A):')
    make_weekstaat()
    make_inkooporder()
    make_factuur()
    print('\nKlaar! 3 templates in templates/ folder.')
