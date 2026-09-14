---
title: Quota and work credits
---

# Quota and work credits

Two numbers decide how much a node can do and how much of what it did is paid.

## Quota

A node's quota is the lower of two limits:

```
quota = min( collateral ÷ k₁ ,  compute ÷ k₂ )
```

Collateral caps the node's exposure; compute caps its throughput. To take on more, a node has to raise both. Raising only one does nothing.

## Work credits

Work credits are the verified, settled work a node did inside its quota:

```
work credits = min( actual completed volume , quota )
```

Work beyond the quota is not credited. What counts as "completed volume" depends on the level:

| Level | Work credits count |
|---|---|
| Light worker | Transfers settled |
| Chain worker | Liquidity provided × ledger volume recorded |
| Adjudicator | Attestations issued + certified capacity tier × SLA met |

## Level

```
level = min( collateral , reputation , track record , compute )
```

The lowest requirement sets the level. See [Five requirements](five-requirements.md).

## Income

```
income = direct fees + pool share × reputation multiplier
```

Direct fees are routing fees for Light workers and dispute fees for Adjudicators. Pool share is the node's work credits as a fraction of everyone's, weighted by reputation. How the weighting works is on [How a pool is split](../earnings/how-a-pool-is-split.md).

In one line: capital sets the ceiling, time sets eligibility, work sets income. A node missing any one of the three earns nothing from the pools.
