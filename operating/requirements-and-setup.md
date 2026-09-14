---
title: Operating requirements
---

# Operating requirements

What a node has to run, keep online, and post, by level. Registration and onboarding steps will be published separately.

## Compute and uptime

| Level | Node | Uptime | Notes |
|---|---|---|---|
| Light worker | Light node | 99% or better | A single small instance with a hot standby is sufficient |
| Chain worker | Full node | 99.9% or better | Typical full-node class: 8–16 cores, 32–64 GB memory, 2–4 TB NVMe, gigabit connectivity. Multi-region redundancy is expected at this uptime. Throughput sets how much ledger volume the node may record |
| Adjudicator | Certified adjudication compute | 99.99% SLA | Three certified tiers, 1×, 4× and 16×. The tier sets how many cases the node may handle concurrently |

Uptime is measured by the network and feeds the compute requirement and the reputation score.

## Collateral to post

| Level | Collateral |
|---|---|
| Light worker | Equal to channel capacity, 1:1. Value in transit never exceeds collateral |
| Chain worker | Settlement liquidity above the minimum; the amount sets ledger weight |
| Adjudicator | A penalty pool of at least 10 to 15 percent of the value under adjudication |

Collateral is held in two layers, a cash layer in AIUSD and a static layer in whitelisted sovereign debt. See [Collateral](../collateral/two-layers.md).

## Key management and security

Chain workers and Adjudicators sign ledger entries and rulings. Operators at those levels are expected to run institutional key management: hardware or cloud HSM, multi-signature operational control, and an audit trail. The choice between self-hosted and cloud HSM is the operator's; both are acceptable.

## Operations

Chain workers need someone who can resolve a reconciliation break. Ledger disagreements cannot be automated away; when balances do not agree, a person has to find out why. Plan for on-call coverage at this level.

## Exit

A node may exit at any time by applying. Collateral is released after a cooling period. See [Penalties and exit](../collateral/penalties-and-exit.md).
