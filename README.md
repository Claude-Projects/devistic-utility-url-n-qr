# Devistic Counter

A neighborhood stamp desk for long URLs and QR codes. No account, no watermark, no “unlock with email”.

Live on GitHub Pages after you enable it (see below):  
`https://claude-projects.github.io/devistic-utility-url-n-qr/`

## What it does

TinyURL-style **URL cutting** plus a full **QR workshop**, built as a static site so it can sit on GitHub Pages.

- **Cut a URL** — TinyURL first, then is.gd, zip1.io, spoo.me, da.gd if one shrugs. Optional custom ending.
- **Stamp a QR** — URL, text, Wi-Fi, vCard, email, SMS, WhatsApp, phone, location, UPI pay, calendar event.
- **Ink & paper** — colors, size, module shape (square / rounded / dots / classy), error correction, center logo.
- **Download** — PNG, SVG, or JPG. Copy image. Print.
- **Read a scan** — camera or a photo of a QR.
- **UTM slip** — campaign tags with Instagram / WhatsApp / email / poster presets, then cut or stamp the tagged link.
- **Desk ticket** — if every public cutter is down, a redirect on this same site (`go.html`) still works.
- **Receipt roll** — recent work stays in *this browser only* (localStorage). Export JSON anytime.
- **EN / हिन्दी** and a lamp / daylight switch.

QR payloads never leave the machine. Shortening has to ask a public cutter — that’s how redirects work.

## GitHub Pages

The site is plain HTML, CSS, and JS at the repo root (plus `.nojekyll`). Two ways to publish:

### A. GitHub Actions (workflow already in the repo)

1. Merge this branch to `main`.
2. Repo **Settings → Pages**.
3. Source: **GitHub Actions**.
4. The workflow `.github/workflows/pages.yml` deploys on every push to `main`.

### B. Deploy from a branch (no Actions permissions needed)

1. Merge to `main`.
2. Settings → Pages → **Deploy from a branch**.
3. Branch: `main` · Folder: `/ (root)`.
4. Save. The site appears at `https://<user>.github.io/<repo>/`.

Project Pages URLs need the trailing slash. GitHub usually redirects `/repo` → `/repo/`.

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
