# Atara

<div align="center">

**An AI payment model that prices settlement risk**

![Status](https://img.shields.io/badge/status-in%20development-orange)
![Phase](https://img.shields.io/badge/phase-escrow-blue)

*Computable risk. Efficient capital.*

Atara makes settlement risk computable — so transactions can move with less
trust, less collateral and less cost.

[Overview](#overview) • [Architecture](#system-architecture) • [Payment Flow](#conditional-payment-flow) • [Conditions](#what-a-condition-can-be) • [Applications](#where-this-applies) • [Status](#status) • [Repository](#this-repository)

[Adjudication](#adjudication-architecture) • [L0 Settlement](#l0--settlement-layer) • [L1 Aegean](#l1--condition-adjudication-on-aegean) • [L2 Arbitration](#l2--pluggable-arbitration) • [Delivery Plan](#delivery-plan)

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

Two static files, no build step and no framework. The only external request is
the Inter and Newsreader typefaces from Google Fonts.

| Path | What it is |
|------|-----------|
| `index.html` | The landing page — HTML, CSS and JS inlined |
| `console.html` | The conditional-payment console — a working prototype, same single-file form |
| `assets/` | Ecosystem logos and section imagery |
| `papers/` | Research references for the protocol |

The console is a private preview and opens on an invite code. Everything it
shows — counterparties, rates, risk scores — is illustrative.

The Supabase-backed operations app that used to sit on this branch now lives on
[`legacy`](../../tree/legacy), with its own README and setup notes.

### Quick start

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`, or deploy the folder to any static host
(Vercel / Netlify / Cloudflare Pages / S3).

---

## Papers

Research references are collected in [`papers/`](papers/) — being assembled.

---

## Adjudication Architecture

The fee in the table above carries one thing: **errors in condition
adjudication**. Everything else — custody, timeouts, rollback — is mechanical.
So the architecture is organised around a single question: how does a ruling get
made, and how cheaply.

Adjudication happens in three layers. Each layer is cheaper and faster than the
one below it, and its job is to keep work away from the next one.

```
┌─────────────────────────────────────────────────────────────────┐
│  L0 · Settlement adjudication                     deterministic │
│  Signatures, timeouts, escrow state. No judgement required —    │
│  the contract alone decides, with no off-chain dependency.      │
│  cost one transaction                latency challenge window   │
└──────────────────────────────┬──────────────────────────────────┘
                               │ condition not self-evident
┌──────────────────────────────▼──────────────────────────────────┐
│  L1 · Condition adjudication              AI, evidence-driven   │
│  A validator committee rules on the published condition.        │
│  Implemented on Aegean's VAN. This layer carries the volume.    │
│  cost near zero                      latency seconds            │
└──────────────────────────────┬──────────────────────────────────┘
                               │ challenged or inconclusive
┌──────────────────────────────▼──────────────────────────────────┐
│  L2 · Dispute adjudication                pluggable arbitrator  │
│  Ruled under the rules published before either side committed.  │
│  cost high                           latency hours to days      │
└─────────────────────────────────────────────────────────────────┘
```

These are the same L0 / L1 / L2 levels as the evidence table above, read from
the adjudicator's side rather than the evidence's.

**The economic constraint that shapes all three:** adjudication must cost less
than the amount in dispute. A neutral human or on-chain jury ruling costs tens
of dollars and takes days. For a small settlement that is hundreds of times the
amount at stake — so small tickets cannot have an L2 path at all, and L1
accuracy is not an optimisation but the condition for the product existing.

| Ticket | Path | Backstop |
|--------|------|----------|
| Small | L0 + L1 only — the L1 ruling is final | Counterparty credit record, no reversal |
| Mid | L1, escalating to an internal panel | Panel ruling |
| Large | L1, escalating to an external arbitrator | Independent ruling, appealable |

The small-ticket tier has no reversal path. That has to be stated to the payer
at order time, not discovered afterwards.

---

## L0 — Settlement Layer

The escrow vault holds funds and resolves the mechanical questions. One contract
manages all orders; per-order deployment is not affordable.

```
      order created
           │
           ▼
   ┌───────────────┐
   │    FUNDED     │  payer's tokens locked
   └───┬───────┬───┘
       │       │  delivery deadline passes
       │       └────────────────────►  REFUNDED   payer withdraws,
       │                                          no cooperation needed
       │  counterparty attaches condition evidence
       ▼
   ┌───────────────┐
   │   DELIVERED   │  evidence hash on record
   └───┬───────┬───┘
       │       │  L1 rules the condition met
       │       └────────────────────►  RELEASED
       │  L1 inconclusive → window opens
       ▼
   ┌───────────────┐
   │  WINDOW_OPEN  │  payer may accept or dispute
   └───┬───────┬───┘
       │       └────────────────────►  DISPUTED  →  L2  →  RELEASED
       │                                                  REFUNDED
       │  window expires                                  split
       └────────────────────────────►  resolved per corridor rule
```

**Two independent timeouts, both on-chain.** A delivery deadline that lets the
payer withdraw unilaterally, and a response window that resolves inaction. Both
read `block.timestamp`; neither depends on Atara being reachable. If every
Atara service is down, both sides can still get their funds out.

**Evidence is a precondition, not a courtesy.** An order cannot enter
`DELIVERED` without a signed evidence commitment from the counterparty. Without
it the order sits in `FUNDED` until the delivery deadline and the payer takes
the funds back. This closes the obvious hole in any timeout-resolved escrow —
a counterparty doing nothing and waiting for the clock.

### How inaction resolves

This is corridor-dependent, and getting it backwards is expensive.

| Corridor | On expiry | Why |
|----------|-----------|-----|
| On-chain conditions, machine counterparties | Release | Nothing verifiable is pending; requiring a human to be awake breaks unattended settlement |
| Fiat-leg conditions | Escalate, never auto-release | Fiat arrival is not verifiable on-chain, and the amounts are large |

Unattended settlement protocols converge on release-by-default for good
reason — a mechanism that needs someone to respond is a mechanism that stalls.
But that reasoning holds only where the condition is self-evident on-chain.
Where the condition is a bank credit, silence must escalate, and L1's job is to
make silence rare.

---

## L1 — Condition Adjudication on Aegean

L1 is where a condition actually gets ruled on. It runs on
[**Aegean**](https://github.com/AdvaitaLabs/aegean-consensus), AdvaitaLabs'
Byzantine-fault-tolerant multi-agent consensus protocol
([arXiv:2512.20184](https://arxiv.org/abs/2512.20184)), using its Verification
Agent Network. Atara supplies the condition and the evidence; Aegean supplies
the committee and the ruling.

Three properties make it the right substrate for adjudication rather than a
single model call:

- **No single point of judgement.** A committee with weighted voting and a
  quorum, not one model's opinion. Weight is
  `capability × confidence × historical accuracy`, so a validator that has been
  right before counts for more.
- **Cost tracks difficulty.** The Sequencer scores each request and routes it to
  a 2-, 3-, or 5-validator tier. Easy conditions do not pay for hard ones.
- **Deterministic first.** Each validator pre-screens on rules in under 5ms and
  returns immediately when the answer is unambiguous, before any LLM runs. Most
  conditions never reach a model.

```
                    condition + evidence + trace
                                  │
                     ┌────────────▼─────────────┐
                     │        Sequencer         │
                     │  amount, counterparty    │
                     │  trust, velocity, trace  │
                     │  → SIMPLE / MEDIUM / HARD│
                     └────────────┬─────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │  validator committee, parallel                    │
        │                                                   │
        │  Identity 0.90   Compliance 0.95   Amount 0.88    │
        │  Anomaly  0.85   Context    0.80                  │
        │                                                   │
        │  each: pre-screen (<5ms) → RAG → LLM              │
        └─────────────────────────┬─────────────────────────┘
                                  │  ValidatorResult[]
                     ┌────────────▼─────────────┐
                     │  weighted aggregation    │
                     └────────────┬─────────────┘
                                  │
          ┌───────────┬───────────┼───────────┬───────────┐
          ▼           ▼           ▼           ▼           ▼
       APPROVE     REVIEW     CHALLENGE    REJECT      (to L2)
       release    hold for     request     return
                  operator    evidence      funds
```

**`CHALLENGE` is the mechanism that keeps disputes out of L2.** Rather than
ruling on thin evidence, the committee names what is missing —
`required_evidence` — and re-evaluates once it arrives. In escrow terms this is
the L1 → L1′ retry that precedes any escalation. An order only reaches L2 when
the committee has asked for evidence and still cannot rule.

Mapping to the evidence levels already defined above:

| Evidence level | Adjudication path |
|----------------|-------------------|
| L0 mutual confirmation | Settled in the contract, no committee |
| L1 objective data source | Validator committee; usually pre-screen only |
| L2 dispute | Committee returns `CHALLENGE`, then escalates |

The credit model consumes the same outputs. Every ruling, challenge and outcome
writes back to Aegean's ExperienceBase — which is the step-7 write-back in the
payment flow above, and the reason a counterparty's second trade prices better
than its first.

---

## L2 — Pluggable Arbitration

L2 follows the separation established by the on-chain arbitration standard
(ERC-792): the contract that holds funds and the party that rules on them are
different contracts.

```
   Escrow vault  (arbitrable)   ◄──────►   Arbitrator  (per tier)
   holds funds                             returns a ruling
   executes the ruling                     never touches funds
```

Three consequences, all of which matter more than they look:

1. **Funds never leave the vault.** An arbitrator returns a ruling; the vault
   executes it. Compromising an arbitrator can bias one order's outcome — it
   cannot drain the pool.
2. **Arbitrators are swappable per tier.** An internal panel today, an external
   arbitrator for large tickets, with no change to the vault. Replacing
   adjudication logic welded into a custody contract would mean migrating the
   contract, which means migrating funds.
3. **This is not retrofittable.** The interface has to be in the vault from its
   first deployment.

### Rules published before commitment

The condition specification agreed at order creation is serialised and
committed on-chain as the dispute's published rules — the standard evidence
format for on-chain arbitration (ERC-1497) exists for exactly this. The
question an arbitrator answers is the question both parties signed at order
time, not one reconstructed afterwards from competing accounts.

This is what *"rules published before anyone commits"* means in the overview,
expressed as a mechanism.

---

## Interoperability

The HTTP payment handshake for machine payments (x402) has real traction — over
165M agent transactions, with Stripe and Cloudflare support. Atara does not
compete with it. It is a handshake, not a settlement rail and explicitly not a
dispute system: x402 settlements are final by design, with no dispute window
and no reversal path, and dispute frameworks for agent commerce are not expected
to converge before 2026–2027.

So the integration is additive: accept the existing handshake, and publish a
conditional scheme alongside the immediate ones. A client that does not
understand the conditional scheme ignores it and pays immediately, as today. A
client that does gets escrow, a published condition, and an adjudication path.

For metered and streaming conditions, the settlement layer follows the
established state-channel adjudicator pattern — challenge, respond, checkpoint,
conclude, with finalisation at the last mutually-signed state — rather than a
bespoke channel dispute mechanism.

---

## Delivery Plan

Phases, not dates. Each phase is gated on the previous one being real.

| Phase | Scope | Gate to pass |
|-------|-------|--------------|
| **Escrow** *(current)* | Vault, two timeouts, evidence commitment, L0 settlement. Arbitrable interface and tier registry present but only the small tier registered. | Funds recoverable by both sides with every Atara service stopped |
| **Condition adjudication** | Aegean VAN on the live corridor. Receipt and document conditions. Challenge-response loop. Published rules committed at order creation. | Share of orders ruled at L1 without escalation |
| **Dispute adjudication** | Internal panel registered to the mid tier. Evidence submission, split rulings, counterparty credit record. | Escalation rate and time-to-ruling |
| **Credit** | Risk-priced collateral per trade, using accumulated adjudication outcomes. | Realised loss against priced default probability |

**The gate that decides the product is the second one.** If conditions cannot
be ruled at L1 at a high rate, every order lands in a paid human path, and
neither the fee in the table above nor the small-ticket tier survives. It is the
number to instrument first and report continuously.

Two dependencies sit outside engineering and can invalidate scope rather than
delay it: which licensed-partner arrangements cover the corridors in play, and
the tier thresholds — both are commercial and legal decisions, not technical
ones.

---

## References

**Adjudication and arbitration**
- [Aegean Consensus](https://github.com/AdvaitaLabs/aegean-consensus) — AdvaitaLabs' BFT multi-agent consensus and Verification Agent Network
- [Reaching Agreement Among Reasoning LLM Agents](https://arxiv.org/abs/2512.20184) — the consensus protocol Aegean implements
- [ERC-792 Arbitration Standard](https://developer.kleros.io/en/latest/arbitrator.html) — arbitrable / arbitrator separation
- [ERC-1497 Evidence Standard](https://developer.kleros.io/en/latest/erc-1497.html) — published rules and evidence format
- [Kleros Escrow](https://docs.kleros.io/products/escrow/kleros-escrow-specifications) — escrow with external arbitration, in production

**Settlement mechanics**
- [ForceMove](https://magmo.com/force-move-games.pdf) — challenge / respond / timeout finalisation
- [Nitro Protocol](https://magmo.com/nitro-protocol.pdf) — multi-channel adjudication
- [ERC-7824](https://ethereum-magicians.org/t/erc-7824-state-channels-framework/22566) — chain-agnostic state channel framework

**Machine payments**
- [x402](https://solana.com/x402/what-is-x402) — the HTTP payment handshake
- [Risks on Emerging x402 Payments](https://arxiv.org/html/2607.19545) — why finality without a dispute layer is a gap
