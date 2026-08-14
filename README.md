# Atara

**An AI payment model that prices settlement risk.**

Two models decide before funds move: one prices the counterparty — how much
collateral to post, what fee to charge, how the payment unwinds if the deal
fails — and one rules on whether the agreed condition actually holds. Funds
become final when the condition is verified, not merely when they arrive.

*Computable risk. Efficient capital.* Settlement risk becomes computable, so
transactions can move with less trust, less collateral and less cost.

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
- Atara is not a bank. The AI credit model is in development and is not
  extending credit.
- The current phase operates as escrow for a service fee and does not
  underwrite losses. Fiat moves through licensed partners, never through Atara.
