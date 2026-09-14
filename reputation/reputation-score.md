---
title: Reputation score
---

# Reputation score

Every node has a reputation score. It records how much verified work the node has done and how much of it was right. It cannot be bought; it can only be earned.

## What it is

A number per node that moves in three ways:

* Completing a piece of verified work adds to it.
* An error subtracts from it.
* Inactivity decays it, by about 2 percent per month.

The score has one use: it is the multiplier in the pool split. See [How a pool is split](../earnings/how-a-pool-is-split.md).

## What it records

| Level | Adds | Subtracts |
|---|---|---|
| Light worker | Routes completed, SLA met | Routes failed, node offline |
| Chain worker | Ledger consistent, batches settled | Ledger errors, outages |
| Adjudicator | Rulings not overturned, timely responses | Rulings overturned, timeouts |

Every entry is something that was done and verified, not something that was promised.

## Why anyone can recompute it

The score decides pay, so it is a target. If it lived as a number on one server, every node would have to trust that server, and the network's trust model would fail at that one field.

Instead, every event that moves a score is signed and carries its causal order in the protocol's verifiable logical clock. Anyone can replay the events and arrive at the same score. The score is not declared; it is recomputed. When it is disputed, the remedy is to recompute it, not to ask anyone to vouch for it.

The same clock defines time for decay and for rolling-window track records. Nodes disagree about wall-clock time; they do not disagree about the order of signed events.

## Three rules

1. **Earned only.** It cannot be bought, transferred or inherited. A new node starts at zero, whoever funds it.
2. **It decays.** Stop working and it falls. Past work is not a permanent asset.
3. **It gates promotion.** Chain worker requires a score above the threshold; Adjudicator requires the top 5 percent of its category. This is why the top level cannot be bought.
