# Atara

<div align="center">

**An AI payment model that prices settlement risk**

![Status](https://img.shields.io/badge/status-in%20development-orange)
![Phase](https://img.shields.io/badge/phase-escrow-blue)

*Computable risk. Efficient capital.*

Atara makes settlement risk computable — so transactions can move with less
trust, less collateral and less cost.

[Overview](#overview) • [Architecture](#system-architecture) • [Payment Flow](#conditional-payment-flow) • [Conditions](#what-a-condition-can-be) • [Applications](#where-this-applies) • [Status](#status) • [Repository](#this-repository)

</div>

---

## Overview

When two parties without an established relationship move money, one of them
pays first — and stays exposed until the other side delivers. Payment systems
guarantee that money *arrives*. None of them answer whether it *should have*:
was the condition met, who decides, and what happens when it wasn't.

Atara closes that gap with two AI models:

- **The adjudication model** — decides whether a condition was met, under
  rules published before anyone commits.
- **The credit model** — turns a counterparty's track record into numbers
  before funds move: how much collateral, what fee, which unwind path.

Adjudication comes first: a default probability means nothing until someone
neutral can rule on what counts as default.

### Why Atara?

| Problem | Traditional approach | Atara | Gain |
|---------|---------------------|-------|------|
| First-mover risk | Full escrow / prepayment | Risk-priced collateral per trade | Capital freed from 100% lock-up |
| Trust is unpriced | Guarantors, middlemen, relationships | Per-counterparty default probability | Reliable actors pay less |
| Access to guarantees | Letters of credit (~40% of corporate applications rejected) | Machine-verifiable conditions | Coverage without bank paperwork |
| Arrival ≠ finality | Clawbacks, post-hoc freezes, disputes in court | Condition-verified finality with rule-based unwind | Outcomes decided by published rules |
| No audit trail | Manual paperwork per trade | Document package generated at settlement | Audit-ready by default |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Entry Layer                              │
│      Conversational front end  /  API & SDK  /  Console          │
│        one plain-language sentence starts a payment              │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                          AI Models                               │
│  ┌────────────────────────┐   ┌─────────────────────────────┐   │
│  │   Adjudication model   │   │        Credit model         │   │
│  │  • Rules published     │   │  • Default probability      │   │
│  │    before commitment   │   │    per counterparty         │   │
│  │  • Evidence levels     │   │  • Collateral & fee         │   │
│  │    L0 / L1 / L2        │   │    per trade                │   │
│  │  • Dispute resolution  │   │  • Outcome write-back       │   │
│  └───────────┬────────────┘   └──────────────┬──────────────┘   │
│              │       adjudication feeds       │                  │
│              └────────── the model ───────────┘                  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                  Conditional Settlement Layer                     │
│   escrow · condition check · release · rollback — atomically     │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                    Verification & Compliance                     │
│   identity · source of funds · wallet screening · sanctions      │
└──────────────────────────────────────────────────────────────────┘
```

---

## Conditional Payment Flow

```
  Payer                    Atara                     Counterparty
    │                        │                            │
    │ 1 submit order         │                            │
    │  amount · condition    │                            │
    ├───────────────────────►│                            │
    │                        │ 2 verify both sides        │
    │                        ├───────────────────────────►│
    │                        │ 3 price the risk           │
    │                        │   default probability →    │
    │                        │   collateral + fee         │
    │ 4 funds into escrow    │                            │
    ├───────────────────────►│                            │
    │                        │ 5 verify the condition     │
    │                        │   L0 → L1 → L2             │
    │                        │                            │
    │        6a release + document trail                  │
    │                        ├───────────────────────────►│
    │  6b or: return, no cooperation needed               │
    │◄───────────────────────┤                            │
    │                        │ 7 outcome → credit record  │
    │                        │                            │
```

**Evidence escalates in three levels:**

| Level | Method | Covers |
|-------|--------|--------|
| L0 | Mutual confirmation | Both sides agree — the common case |
| L1 | Objective data source | Bank confirmation, shipping documents, on-chain events |
| L2 | Dispute adjudication | Conflicting or missing evidence; ruled under published rules |

The write-back at step 7 is what separates a protocol from a payment tool:
every settled trade improves the price of the next one.

---

## What a Condition Can Be

Ordered by how hard they are to verify:

| Level | Example | Verification |
|-------|---------|--------------|
| Receipt | Bank confirmation of an incoming transfer | Deterministic |
| Documents | Bill of lading, customs declaration, invoice | Semi-objective |
| Acceptance | Milestone sign-off on delivered work | Subjective, capped |
| Metered readings | Verified ad conversions, sensor data, trial endpoints | Requires neutral measurement |

---

## Where This Applies

- **Settlement hubs** — a multi-currency corridor onboards local counterparties
  without diligencing each one for weeks or pre-funding it in full.
- **Exchange settlement** — after a large trade matches, the two legs swap
  through escrow instead of on trust.
- **Trade prepayment** — an importer's deposit releases against shipping
  documents rather than promises.
- **Treasury flows** — cross-border repatriation with verification and a full
  audit trail.
- **Agent-to-agent commerce** — machine payments where refund conditions must
  be written before the trade, because software cannot renegotiate afterwards.

---

## What Limits a Corridor

Moving money across a border no longer requires a chain of correspondent banks.
A payment can settle as two domestic transfers with a token transfer between
them — minutes instead of days, verifiable instead of opaque.

```
Today      Payer → Bank A → Correspondent → Correspondent → Bank B → Payee
           a fee at every hop · 2–5 days · no visibility in transit

Token      Payer → local exchange → token transfer → local exchange → Payee
route              (licensed partner)   minutes    (licensed partner)
                   └──── Atara prices each counterparty and releases
                         funds only on verified conditions ────┘
```

No fiat passes through Atara. What the protocol removes is the reason a corridor
stays small: today each local counterparty must be diligenced for weeks and
fully pre-funded before it can be used. Priced risk replaces both.

### Where the fee sits

| Instrument | Rate | What it carries |
|-----------|------|-----------------|
| Letter of credit | 75–150 bp | Counterparty default |
| Escrow services | 25–100 bp | Delivery disputes |
| **Atara** | **12–35 bp** | **Errors in condition adjudication** |
| Card network fee | 10–15 bp | No funding risk carried |

Charged on the amount settled, not per call — the fee scales with the risk
priced, not with compute. Rates are illustrative and subject to the phase noted
below.

---

## Status

In development.

- **Current phase — escrow.** Funds release only when conditions verify; the
  protocol charges a service fee and does not underwrite losses.
- The AI credit model is in development and is not extending credit.
- Rates, amounts and model outputs shown in any product surface are
  illustrative.
- Atara is not a bank. Fiat moves through licensed partners, never
  through Atara.

---

## This Repository

| Path | What it is |
|------|-----------|
| `src/` | Web console for counterparty profiles and order management (React + Vite + Supabase) |
| `supabase/` | Database schema and row-level security policies |
| `papers/` | Research references for the protocol |
| `docs/DEVELOPMENT.md` | Local setup and handover notes |

The public landing page lives on the
[`landing-page`](../../tree/landing-page) branch.

### Quick start (console)

```bash
npm install
cp .env.example .env   # see docs/DEVELOPMENT.md for the two Supabase values
npm run dev
```

---

## Papers

Research references are collected in [`papers/`](papers/) — being assembled.
