---
title: Parameters
---

# Parameters

Design parameters as currently set. They are calibrated on live settlement data and may change; changes are announced before they take effect.

## Fees

| Parameter | Value |
|---|---|
| Conditional settlement fee | 5–30 bps of amount, by scenario |
| Transfer fee | Fixed micro-fee, priced below a mainstream stablecoin transfer |
| AIUSD mint / redeem | Free, uncapped |
| Dispute fee | Per case, paid by the losing party to the Adjudicator |

## Fee split

| Pool | Share |
|---|---|
| Chain pool | 45% |
| Adjudication pool | 30% |
| Light pool | 15% |
| Reserve | 10% |

## Pool clocks

| Pool | Clears | Holdback |
|---|---|---|
| Light pool | Daily | None |
| Chain pool | Weekly | None |
| Adjudication pool | Monthly | About 40% held until the dispute window closes |

## Requirements by level

| Requirement | Light worker | Chain worker | Adjudicator |
|---|---|---|---|
| Collateral | 1:1 with channel capacity | Settlement liquidity above minimum | Penalty pool ≥ 10–15% of value under adjudication |
| Reputation score | None to start | Above threshold, earned within category | Top 5% of category |
| Track record | None | Clean epochs and settlement volume above the bar | Attestation accuracy above the bar over time |
| Compute | Light node, 99% uptime | Full node, 99.9% uptime | Certified tiers 1× / 4× / 16×, 99.99% SLA |
| Liability | Routing fees | Pool share | Reputation, penalty pool, held pay; demotion |

## Other

| Parameter | Value |
|---|---|
| Reputation decay | About 2% per month of inactivity |
| Concentration cap, Adjudicator | 20% of value under adjudication |
| Concentration cap, Chain worker | 10% of ledger volume |
| Quota | min(collateral ÷ k₁, compute ÷ k₂) |
| Settlement fee payer | Payer by default |
