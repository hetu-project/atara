# Atara Console

Console frontend for the Atara settlement protocol. Vite + React + TypeScript.

## Running it

The backend has to be up first (the `atara-pay` repo):

```bash
cd ../../atara-pay && make run      # :8080
```

Then:

```bash
npm install
npm run dev                          # :5173
```

The dev server proxies `/api` to `http://localhost:8080`, so from the browser's point of
view everything is same-origin — no dependence on backend CORS, and no getting stuck on
"the request seems not to have gone out" because a preflight failed.
If the backend is elsewhere, set `ATARA_API`:

```bash
ATARA_API=http://10.0.0.5:8080 npm run dev
```

## Watching both sides of a trade

Backend auth is mocked: the `X-Atara-User` header injects an identity directly, with no
session. Hence the identity switcher in the top right, and `?as=<handle>` in the URL:

```
http://localhost:5173/?as=demo
http://localhost:5173/?as=CrabWalk%20Trading
```

**Open two windows, each with its own `as`**, and you can watch both sides of one trade at
once. This is not a debugging backdoor — for the same ticket the two parties see
complementary phases (when one is at `pay/you` the other is necessarily at `wait/them`),
and without switching identity you never see the most important step in the protocol:
**the receipt has to be verified by the payee; the uploader cannot verify their own**.

## Structure

```
src/
  api/
    types.ts       types for the backend's JSON, field by field against atara-pay's dto.go
    client.ts      fetch wrapper: error envelope, identity header, confirmation tokens
    endpoints.ts   one function per endpoint; the token-tier forking rule is encapsulated here
  hooks/
    useApi.ts      fetching and polling
    useIdentity.ts identity (mock auth)
    useRoute.ts    hash routing
  views/
    Market.tsx     the pool + taking orders
    OrderDetail.tsx commit / receipt / verify / track / on-chain facts / trail
    Tasks.tsx      the to-do projection + my tickets
    Wallet.tsx     account and funds
  components/bits.tsx  phase badges, track, error box
  styles/
    tokens.css     design variables, taken verbatim from the old console.html
    app.css
```

## Three conventions

**Amounts are always strings.** The backend's amounts are decimal strings in major units,
and the frontend **never** converts them to `number` — at 18 digits of precision, float
silently alters the trailing digits. If you need arithmetic, reach for a decimal library.

**Do not derive phases yourself.** `phase` / `actor` are computed by the backend from the
current caller's perspective, and the frontend renders them directly. Do not rebuild the
state machine in the frontend — two implementations will inevitably diverge.

**Branch on `code`, not `message`.** `message` is English prose for humans and will change;
`code` is the contract. The `remedy` the backend supplies is "a clickable alternative", and
`ErrorBox` already renders it as a button.

## Coverage

Six views, with every backend endpoint wired up:

| View | Contents |
|---|---|
| **Trade** | the pool, taking orders (in coin or fiat terms) |
| **Tasks** | the to-do projection + my tickets |
| **Discover** | three verticals, two-stage maker onboarding review, listings, the review queue (reviewer role) |
| **People** | counterparty directory, conversations (chat and order cards in one stream) |
| **Money** | spending authority (allowances), payee address book, the withdrawal loop (including tx write-back) |
| **Account** | identity, funds, escrow contract |
| **Ticket detail** | commit / receipt / verify / track / on-chain facts / trail |

**Not wired up**: conditional payments (`conditional_transfer`). The backend implementation
is complete but V1 does not enable it; the endpoints are `/orders/parse`, `POST /orders`,
`/orders/{id}/evidence` and `/orders/{id}/confirm`.

## Contract regression

```bash
python3 scripts/contract-check.py
```

Runs the core paths through the dev server proxy and verifies that the frontend API layer
matches the backend contract. Run it with both the frontend and the backend up.

## Deployment

**This is the step that most often goes wrong**: `dev` relies on the Vite proxy to forward
`/api` to the backend, and **production has no proxy**. Two options, pick one:

### A - Reverse proxy (recommended)

Frontend and backend are same-origin, the frontend uses relative paths, and no CORS is needed:

```bash
npm run build           # output in dist/
```

Nginx / Caddy forwards `/api` to the backend:

```nginx
location /api/ { proxy_pass http://backend:8080; }
location /     { root /srv/atara-console/dist; try_files $uri /index.html; }
```

`try_files ... /index.html` is mandatory — refreshing a hash-route deep link would otherwise 404.

### B - Different origins

Give the full backend address at build time:

```bash
VITE_API_BASE=https://api.example.com/api/v1 npm run build
```

The backend has to allow the frontend's domain:

```bash
ATARA_CORS_ORIGINS=https://console.example.com
```

**Do not use `ATARA_CORS_ORIGINS=*` in production** (that is the demo default) — requests
carrying an identity header would be accepted from any origin, which amounts to no
same-origin protection at all.

### The repo root's vercel.json does not cover this directory

The one at the root is a purely static deployment (`outputDirectory: "."`) and ships only
`index.html` / `console.html` / `api.html`. **This React console is not in its scope** and
has to be deployed separately (or have `app/dist`'s build output merged into it).

## Relationship to the old version

`console.html` in the repo root is the single-file version from before the rewrite (10,394
lines), kept for visual comparison. `index.html` is the landing page and was not touched in
this round.
