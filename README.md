# Devistic Counter

A neighborhood stamp desk for long URLs and QR codes. No account, no watermark, no “unlock with email”.

Live on GitHub Pages:  
`https://claude-projects.github.io/devistic-utility-url-n-qr/`

## What it does

TinyURL-style **URL cutting** plus a full **QR workshop**, built as a static site so it can sit on GitHub Pages.

- **Cut a URL** — TinyURL first, then is.gd, zip1.io, spoo.me, da.gd if one shrugs. Optional custom ending.
- **Stamp a QR** — URL, text, Wi-Fi, vCard, email, SMS, WhatsApp, phone, location, UPI pay, calendar event.
- **Ink & paper** — colors, size, module shape (square / rounded / dots / classy), error correction, center logo.
- **Download** — PNG, SVG, or JPG. Copy image. Print.
- **Read a scan** — camera, a photo, or **paste a QR from the clipboard** (Ctrl+V / ⌘V anywhere).
- **EN / हिन्दी / اردو** and a lamp / daylight switch.
- **UTM slip** — campaign tags with Instagram / WhatsApp / email / poster presets, then cut or stamp the tagged link.
- **Desk ticket** — if every public cutter is down, a redirect on this same site (`go.html`) still works.
- **Receipt roll** — recent work stays in *this browser only* (localStorage). Export JSON anytime.

QR payloads never leave the machine. Shortening has to ask a public cutter — that’s how redirects work.

## GitHub Pages

The site is plain HTML/CSS/JS at the repo root (plus `.nojekyll`).

Your repo is already set to **Deploy from a branch → `main` → `/(root)`**.  
Every push to `main` publishes by itself. No extra branch, no extra button.

Live: `https://claude-projects.github.io/devistic-utility-url-n-qr/`

## Local

Any static server from the repo root:

```bash
python3 -m http.server 4173
```

Open `http://127.0.0.1:4173`.

## Stack

- [qr-code-styling](https://github.com/kozakdenys/qr-code-styling) (vendored)
- [jsQR](https://github.com/cozmo/jsQR) (vendored)
- Public shorteners: TinyURL, is.gd, zip1.io, spoo.me, da.gd
