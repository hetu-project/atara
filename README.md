# Atara — Landing Page

The payment gate for global money. A single static page: no build step, no dependencies.

Open `index.html` in a browser, or deploy the folder to any static host
(Vercel / Netlify / Cloudflare Pages / S3).

Local preview:

```bash
python3 -m http.server 4173
```

---

## Files

| Path | Purpose |
|---|---|
| `index.html` | The whole page — HTML, CSS and JS inlined |
| `assets/logos/` | 14 ecosystem logos (PNG, ~125 KB total) |

External runtime dependencies, all via CDN with fallbacks:

- **Switzer** (Fontshare) + **JetBrains Mono** (Google Fonts)
- **GSAP 3.12 + ScrollTrigger** — loaded `defer`; the page renders fully without it

---

## Configure before launch

Both live at the top of the `<script>` block near the bottom of `index.html`.

1. **`APP_URL`** — empty by default. Once set, all four `Launch App` / `Open the app`
   links point at it. While empty they stay `#`.
2. **`WAITLIST_ENDPOINT`** — empty by default, **deliberately**. When empty, submitting the
   early-access form shows an explicit "not wired up yet" message instead of silently
   dropping the address. Point it at anything that accepts `POST {email}`.

Also worth a look before going live:

- The `[ pending ]` auditor name in the Controls copy — fill it in or delete the line.
- FX rates and the figures marked `Illustrative` are placeholders.
- `Preview` chips mark features that are not shipped yet. Keep them accurate.

---

## Design system

Light page, one dark band (Developers). One set of variable names is defined twice —
once in `:root` for the light page, once in `.dark` — so every component is written
once and works in both contexts.

```
:root (light)                       .dark
--bg      oklch(97.6% .004 168)     oklch(16%   .014 168)
--ink     oklch(19%   .013 168)     oklch(96%   .006 168)
--faint   oklch(46%   .013 168)     oklch(65%   .014 168)
--accent  oklch(47%   .135 158)     oklch(80%   .185 160)
--ui-bg   oklch(99.6% .001 168)     product surfaces inside figures
```

Rules:

- Structure comes from surface and light, not from drawn lines
- Radius 0, except the agent card — a physical object, so it gets real card geometry
- Display type at 300 weight, line-height 1.0, tracking −0.035em
- Mono is for figure labels, codes and data — never body copy
- All numbers `tabular-nums`
- The single accent is used sparingly; on the dark band it lifts to a brighter value,
  because the light-page accent fails contrast there

Every text/background pair is verified at ≥4.5:1 (≥3:1 for large text), measured with
backgrounds composited, in both the light and dark contexts.

---

## Structure

```
Nav                — flat, no divider, no backdrop blur
Hero               — headline + CSS-3D portal + ecosystem logo strip, all above the fold
§01 Capabilities   — six cards: on-ramp / off-ramp / FX / agent cards / conditional / payouts
§02 Why Atara      — three full-size product screens: credit, reversibility, dual entry
§03 Primitives     — four-cell spec grid + an interactive condition set
For People         — draggable globe + a live corridor calculator
Developers         — dark band, TS / Python / cURL tabs + a terminal
FAQ · CTA · Footer
```

## Motion and interaction

Nothing is hidden by CSS. Reveals start from the visible DOM and GSAP sets the "from"
state at runtime, so a CDN failure degrades to a static page rather than a blank one.
The hero has an additional 3-second failsafe that force-restores visibility if the GSAP
ticker never advances (background tab, stalled frame).

Interactive: drag the hero portal, drag the reversal window, toggle conditions, edit the
corridor amount and swap direction, switch code languages, tilt the agent card, replay the
chat/CLI sequence, hover any capability card to replay its figure.

`prefers-reduced-motion` is honoured throughout — the portal holds a single frame and
every sequence jumps to its finished state.
