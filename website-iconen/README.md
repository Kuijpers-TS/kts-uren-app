# KTS Website iconen — kuijpers-ts.nl

Hi-res iconen gegenereerd vanuit `K_solo_primary_2400px.png` (huisstijl Rev A) met aspect-correct schaling.

## Inhoud

```
website-iconen/
├── voor-pwa-app/             ← upload naar website-root, koppel via manifest.json
│   ├── icon-192.png             192×192  K wit op KTS-blauw vierkant
│   ├── icon-512.png             512×512  idem
│   ├── apple-touch-icon.png     180×180  voor iOS "Toevoegen aan beginscherm"
│   ├── icon-192-maskable.png    192×192  Android maskable variant (full bleed)
│   └── icon-512-maskable.png    512×512  idem
├── voor-favicon/             ← upload naar website-root, koppel via <link>
│   ├── favicon.ico              multi-size (16/32/48) — voor browser-tabblad
│   ├── favicon-16.png           16×16    K blauw op wit
│   ├── favicon-32.png           32×32
│   ├── favicon-48.png           48×48
│   ├── favicon-64.png           64×64
│   ├── favicon-96.png           96×96
│   ├── favicon-128.png         128×128
│   └── favicon-180.png         180×180   alternatief voor apple-touch
└── og-image.png              1200×630  voor Facebook/LinkedIn share previews
```

## Stijlkeuze

- **PWA app-iconen** (springbord): K wit op KTS-blauw `#07567F` — herkenbaar op donker/licht springbord
- **Favicons** (browser-tabblad): K blauw op wit — vriendelijker bij kleine afmetingen op witte browser-tabbalk

## Hoe gebruiken op kuijpers-ts.nl

### 1. Upload naar website-root
Plaats alle bestanden in de root van je website-domein, dus:
```
https://kuijpers-ts.nl/icon-192.png
https://kuijpers-ts.nl/favicon.ico
https://kuijpers-ts.nl/apple-touch-icon.png
... etc
```

### 2. HTML `<head>` koppelingen

```html
<!-- Favicon -->
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">

<!-- iOS Apple Touch -->
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">

<!-- PWA manifest -->
<link rel="manifest" href="/manifest.json">

<!-- Theme color (matched aan KTS-blauw) -->
<meta name="theme-color" content="#07567F">

<!-- Open Graph (social media share) -->
<meta property="og:image" content="https://kuijpers-ts.nl/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:title" content="Kuijpers Technical Services">
<meta property="og:description" content="Technische dienstverlening op het hoogste niveau">
<meta property="og:url" content="https://kuijpers-ts.nl">
```

### 3. PWA `manifest.json`

Plaats dit op `/manifest.json`:

```json
{
  "name": "Kuijpers Technical Services",
  "short_name": "KTS",
  "description": "Technische dienstverlening — KTS BV Waarland",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#07567F",
  "icons": [
    { "src": "/icon-192.png",          "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png",          "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icon-192-maskable.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

## Bron-bestanden

Geregenereerd vanuit:
`K_solo_primary_2400px.png` (KTS Branding Rev A, mei 2026)

Bij wijziging van het K-logo: regenereer alle iconen vanuit de hi-res bron met het script in `tools/regenerate-icons.py` (todo).

## Kleurcodes (huisstijl Rev A)

| Naam | Hex |
|---|---|
| Primary (KTS-blauw) | `#07567F` |
| Darker (donker accent) | `#0A1628` |
| Accent (lichter blauw) | `#3A9CC5` |
| Wit | `#FFFFFF` |
