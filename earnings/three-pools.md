---
title: Three pools, three clocks
---

# Three pools, three clocks

Each level of node is paid from its own pool, and each pool clears on a different clock. The clock is set by how fast that level's errors come to light.

| Pool | Share of settlement fee | Clears | Why this clock |
|---|---|---|---|
| Light pool | 15% | Daily | Routing errors show up at once |
| Chain pool | 45% | Weekly | Ledger errors show up at reconciliation |
| Adjudication pool | 30% | Monthly, with holdback | Judgment errors show up only when someone contests |

The principle behind the table: money reaches an operator no faster than that operator's errors can surface.

## The Adjudication holdback

The Adjudication pool is the only one with memory. At the end of each period a node's share is recorded to its name and about 60 percent is released. The remainder is held until the dispute window on the rulings it was earned on has closed, then released. If a ruling is overturned in that window, the held amount is forfeited to the Reserve.

The held amount is income assigned to a named node, not a pool balance. The pools themselves still clear to zero every period.

## Two kinds of money that never enter a pool

* **Dispute fees.** Paid by the losing party directly to the Adjudicator. If they were pooled, the whole network would be subsidising whoever raises a dispute.
* **Forfeited collateral and penalties.** Sent to the Reserve. If they were shared among other nodes, someone would have a reason to induce a wrong ruling.

## The Reserve

The Reserve takes 10 percent of every settlement fee, all forfeited collateral and held pay, and member and seat fees from institutional roles. It pays claims first and protocol development second. It never flows back to any node or member. It is a claims fund, not a bailout fund.

## Three invariants

1. **Zero balance.** Pools are cleared every period and hold nothing between periods. There is no treasury to attack or to govern.
2. **Clean source.** Only fees generated inside the network enter a pool. Any subsidy is paid outside the pools, so that each pool's level is an honest reading of one kind of activity.
3. **No jurisdiction.** Pools recognise work credits and reputation, not identity or location. The same work earns the same pay anywhere.
