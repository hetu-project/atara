# Atara

Atara is an AI-native conditional payment protocol. A credit model prices each
counterparty before funds move — how much collateral to post, what fee to charge,
and how the payment unwinds if the deal fails. Funds become final when the agreed
condition is verified, not merely when they arrive.

This repository contains the public landing page and research references.

## Landing page

A single static file. No build step, no framework, no tracking. The only external
request is the Inter typeface from Google Fonts.

Local preview:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`. Or deploy the folder to any static host
(Vercel / Netlify / Cloudflare Pages / S3).

## Repository layout

| Path | Purpose |
|---|---|
| `index.html` | The whole page — HTML, CSS and JS inlined |
| `assets/logos/` | Ecosystem logos |
| `assets/photos/` | Section imagery |
| `papers/` | Research references for the protocol |

## Notes

- All rates, amounts and model outputs shown on the page are illustrative.
- Atara is not a bank. The credit engine is in development and is not extending credit.
