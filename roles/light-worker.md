---
title: Light worker
---

# Light worker

A Light worker provides liquidity in payment channels, finds a path for other people's payments, and is paid on real flow.

## Why the network needs it

Every on-chain transfer waits in a queue and pays a fee. Payments have a property that makes most of that unnecessary: flows in opposite directions cancel. If A pays B 100 and B pays A 80 through the same channel, only 20 has to move. Light workers hold payments inside channels, net them against each other, and settle only the net difference on the ledger. That is where the network's speed and low cost come from.

## What it does

* **Provides liquidity.** Locks funds in channels so that a payment can always be honoured on arrival.
* **Routes.** A payment may cross several channels; the Light worker finds the path and delivers it.
* **Rebalances.** When one side of a channel runs dry, it moves funds back from the other side to keep both directions open.

## Entry

The lowest bar in the network: post collateral, run a light node, and open the same day.

* Collateral equals channel capacity, 1:1. Value in transit never exceeds the collateral behind it.
* A light node with uptime of 99 percent or better.
* No reputation or track record is required to start. Both accumulate from zero.

This is the level with the most nodes.

## What it earns

Two streams:

* **Routing fees**, a fixed micro-fee on each transfer, paid to the Light worker as the transfer clears, not at the end of the day.
* **A share of the Light pool**, which receives 15 percent of every conditional settlement fee and is cleared daily. The share is proportional to settled transfers, weighted by reputation score.

The Light pool is cleared daily because routing errors show up immediately. How pool shares are computed is on [How a pool is split](../earnings/how-a-pool-is-split.md).

## Cost of error

A failed route or a dropped connection costs the routing fee and the reputation score for that event. Collateral is not touched for routing errors.

## Who it suits

Organisations that already hold stablecoin inventory and have two-way payment flow: OTC desks, market makers, payment companies. For them the liquidity is already on the balance sheet, and the network turns idle inventory into infrastructure paid on flow.
