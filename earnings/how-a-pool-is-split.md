---
title: How a pool is split
---

# How a pool is split

A node's share of a pool is one formula:

```
your share = your work credits × your reputation multiplier
             ÷ Σ (work credits × reputation multiplier) over all nodes in the pool
```

Work credits are defined on [Quota and work credits](../progression/quota-and-work-credits.md). The reputation multiplier is derived from the node's [reputation score](../reputation/reputation-score.md).

## Reputation is a multiplier, not a bonus

Suppose the Light pool holds 3,000 AIUSD for the day and the network's weighted total is 1,000.

| Node | Work credits | Reputation multiplier | Weighted | Paid |
|---|---|---|---|---|
| A | 100 | 1.0 | 100 | 300 |
| B | 100 | 1.5 | 150 | 450 |

Same work, B is paid 50 percent more. The reverse is the point: a node that inflates volume without reputation is paid less for the same volume, and the difference goes to nodes that have earned theirs. Volume farming is not banned by a rule. It is unprofitable by arithmetic.

## Three rules that are easy to miss

1. **Work beyond quota is not credited.** Work credits are capped at quota, and quota is the lower of collateral ÷ k₁ and compute ÷ k₂. To earn more, raise both.
2. **A higher license draws from every pool below it.** An Adjudicator may route, ledger and adjudicate, and earns work credits in all three pools at once. This is the most concrete return on promotion.
3. **Direct fees bypass the pools.** A Light worker's routing fee is paid as the transfer clears. Its daily income is routing fees plus its Light pool share.
