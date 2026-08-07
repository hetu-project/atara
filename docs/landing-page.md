# Atara — Landing Page

> 这份文档来自落地页独立仓库时期。落地页现已并入本仓库，用 `npm run dev` 预览，
> 访问根路径即可；构建、部署和与应用的衔接见根目录 `README.md`。
> 下面关于设计系统和动效的部分仍然有效。

The payment gate for global money. A single static page: no build step, no dependencies.

The page itself still has no build-time dependencies — Vite passes both HTML files
through untouched and only copies the logos.

---

## Files

| Path | Purpose |
|---|---|
| `index.html` | The whole page — HTML, CSS and JS inlined |
| `desk.html` | Settlement desk — same technique, its own inlined styles |
| `public/assets/logos/` | 14 ecosystem logos (PNG, ~125 KB total) |

External runtime dependencies, all via CDN with fallbacks:

- **Switzer** (Fontshare) + **JetBrains Mono** (Google Fonts)
- **GSAP 3.12 + ScrollTrigger** — loaded `defer`; the page renders fully without it

---

## Configure before launch

1. **进应用的入口** — 导航栏的 `Sign in` / `Get started` 直接指向 `/app/login`
   和 `/app/register`。这两个链接受 `src/__tests__/landingEntry.test.ts` 保护，
   删改前先看那个测试。
2. **`CONTACT_EMAIL`** — `index.html:1084` 和 `desk.html:780` 各有一份，默认都是空串。
   设上之后，两页正文里 id 为 `ctaBtn` 的按钮（`Talk to us` / `Start a trade`）
   会变成 `mailto:` 链接。**空着的时候这两个按钮是死链** —— `href="#contact"`
   指向它们自己所在的区块，点了没有任何反应。上线前必须填，或者改成别的去处。
3. **`APP_URL`** — 只有 `desk.html:781` 有，默认空串。设上之后 `desk.html` 正文的
   `ctaBtn` 会指向它并在新标签打开，优先级高于 `CONTACT_EMAIL`。
   `index.html` 没有这个常量。

进应用的路径已经由导航栏那两个写死的链接覆盖，`APP_URL` 不是必需的。

Also worth a look before going live:

- FX rates and the figures marked `Illustrative` are placeholders（`index.html` 里 3 处）。
- `Preview` chip marks a feature that is not shipped yet（`index.html` 里 1 处）。保持它准确。

页面上没有任何表单或邮箱输入框，不收集邮箱地址。早期版本文档里提到的
`WAITLIST_ENDPOINT` 常量和 early-access 表单都不存在，同样，Controls 文案里
那个 `[ pending ]` 审计方占位也已经不在页面上了。

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
