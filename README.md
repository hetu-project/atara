# Atara

<div align="center">

**An AI-Native Conditional Payment Protocol**

![Status](https://img.shields.io/badge/status-in%20development-orange)
![Phase](https://img.shields.io/badge/phase-escrow-blue)

*Funds become final when the agreed condition is verified — not merely when they arrive.*

[Overview](#overview) • [Architecture](#system-architecture) • [Payment Flow](#conditional-payment-flow) • [Conditions](#what-a-condition-can-be) • [Applications](#where-this-applies) • [Status](#status) • [Repository](#this-repository)

</div>

---

## Overview

When two parties without an established relationship move money, one of them
pays first — and stays exposed until the other side delivers. Payment systems
guarantee that money *arrives*. None of them answer whether it *should have*:
was the condition met, who decides, and what happens when it wasn't.

Atara closes that gap with two capabilities:

- **Adjudication** — deciding whether a condition was met, under rules
  published before anyone commits.
- **Credit pricing** — an AI model that turns a counterparty's track record
  into numbers before funds move: how much collateral, what fee, which
  unwind path.

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
│                        Atara Protocol                            │
│  ┌────────────────────────┐   ┌─────────────────────────────┐   │
│  │      Adjudication      │   │       Credit Pricing        │   │
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

- **Exchange settlement** — after a large trade matches, the two legs swap
  through escrow instead of on trust.
- **Trade prepayment** — an importer's deposit releases against shipping
  documents rather than promises.
- **Treasury flows** — cross-border repatriation with verification and a full
  audit trail.
- **Agent-to-agent commerce** — machine payments where refund conditions must
  be written before the trade, because software cannot renegotiate afterwards.

---

## Status

In development.

- **Current phase — escrow.** Funds release only when conditions verify; the
  protocol charges a service fee and does not underwrite losses.
- The credit engine is in development and is not extending credit.
- Rates, amounts and model outputs shown in any product surface are
  illustrative.
- Atara is not a bank.

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
