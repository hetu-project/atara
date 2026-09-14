---
title: Penalties and exit
---

# Penalties and exit

## What is forfeited, by level

| Level | On error |
|---|---|
| Light worker | Routing fees for the failed route; reputation for the event |
| Chain worker | Pool share for the period; reputation |
| Adjudicator | Reputation is burned; the penalty pool and any held pay are forfeited; the node is demoted immediately |

Errors are detected on the clock of the pool: routing errors at once, ledger errors at reconciliation, judgment errors when a ruling is contested inside the dispute window. That is why the pools clear at different speeds; see [Three pools, three clocks](../earnings/three-pools.md).

## Where forfeited funds go

To the Reserve. Never to other nodes. If a penalty could become another node's windfall, someone would have a reason to induce the error that triggers it. The Reserve pays claims first and protocol development second, and never flows back to any node or member.

## Demotion

A node is demoted the moment any one of its five requirements falls below the line for its level. Demotion is executed by code, not by a committee. The node keeps the licenses it still qualifies for and continues to earn from those pools.

## Exit

A node may apply to exit. Its collateral is released after a cooling period, so that any error discovered inside the relevant pool's detection window can still be charged against it. An Adjudicator's held pay is released, or forfeited, when the dispute windows on its outstanding rulings close.

Collateral is never at risk from another node's error, and a node's exit does not depend on anyone's approval.
