# Atara

**An AI-native conditional payment protocol.** A credit model prices each
counterparty before funds move — how much collateral to post, what fee to
charge, and how the payment unwinds if the deal fails. Funds become final when
the agreed condition is verified, not merely when they arrive.

## The problem

When two parties without an established relationship move money, one of them
pays first — and stays exposed until the other side delivers. Payment systems
guarantee that money *arrives*. None of them answer whether it *should have*:
was the condition met, who decides, and what happens when it wasn't.

Today that gap is covered by workarounds, and none of them price the risk:

| Mechanism | Cost |
|---|---|
| Full escrow / prepayment | 100% of the capital locked for the whole trade |
| Guarantors and middlemen | Priced by relationship, not by risk; hard to scale |
| Letters of credit | Slow, expensive, and roughly 40% of corporate applications are rejected |
| Spending caps and manual review | Limits unrelated to the counterparty; good actors capped, bad actors approved |

A reliable counterparty and an unreliable one pay the same. That is the gap
Atara is built for.

## How a conditional payment works

```
order in            verify both sides        price the risk
amount, party,  →   identity, funds,     →   default probability →
release condition   wallet, sanctions        collateral + fee
                                                   ↓
outcome written  ←  release or return   ←    funds in escrow,
back to record      with documents           condition verified
```

1. A payer submits an order: amount, counterparty, release condition.
2. Both sides pass verification — identity, source of funds, wallet screening,
   sanctions lists.
3. The credit model estimates this counterparty's probability of default and
   sets the collateral and fee for this specific trade.
4. Funds move into escrow.
5. The condition is verified. Evidence escalates in three levels: mutual
   confirmation → an objective data source (bank confirmation, shipping
   documents, an on-chain event) → dispute adjudication.
6. Condition met: funds release, with a document trail for audit. Not met:
   funds return to the payer — no cooperation from the other side required.
7. The outcome is written back to the counterparty's record, so the next
   trade prices better.

Two capabilities carry the design:

- **Adjudication** — deciding whether a condition was met, under rules
  published before anyone commits.
- **Credit pricing** — turning a counterparty's track record into numbers:
  how much collateral, what fee, which unwind path.

Adjudication comes first: a default probability means nothing until someone
neutral can rule on what counts as default.

## What a condition can be

Ordered by how hard they are to verify:

| Level | Example |
|---|---|
| Receipt | Bank confirmation of an incoming transfer |
| Documents | Bill of lading, customs declaration, invoice |
| Acceptance | Milestone sign-off on delivered work |
| Metered readings | Verified ad conversions, sensor data, trial endpoints |

## Where this applies

- **Exchange settlement** — after a large trade matches, the two legs swap
  through escrow instead of on trust.
- **Trade prepayment** — an importer's deposit releases against shipping
  documents rather than promises.
- **Treasury flows** — cross-border repatriation with verification and a full
  audit trail.
- **Agent-to-agent commerce** — machine payments where refund conditions must
  be written before the trade, because software cannot renegotiate afterwards.

## Status

In development. The first phase operates as pure escrow: funds release only
when conditions verify, and the protocol charges a service fee — it does not
underwrite losses. The credit engine is in development and is not extending
credit. Rates, amounts and model outputs shown in any product surface are
illustrative.

## This repository

| Path | What it is |
|---|---|
| `src/` | Web console for counterparty profiles and order management (React + Vite + Supabase) |
| `supabase/` | Database schema and row-level security policies |
| `papers/` | Research references for the protocol |
| `docs/DEVELOPMENT.md` | Local setup and handover notes |

The public landing page lives on the
[`landing-page`](../../tree/landing-page) branch.

## Notes

Atara is not a bank.
