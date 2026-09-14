---
title: Chain worker
---

# Chain worker

A Chain worker provides settlement liquidity, runs a full node that keeps the shared ledger, and maintains the register of every node's collateral.

## Why the network needs it

The question is who holds the ledger. The industry has seen a payment intermediary fail while its ledger was an internal database; when the company went down, whose money was whose became a legal question and customer funds were frozen.

On this network, Light workers do not stand on any one company's books. They stand on a ledger that Chain workers keep collectively. A company can fail; the ledger does not fail with it.

## What it does

1. **Provides settlement liquidity.** Locks funds that the network draws on for intraday settlement.
2. **Keeps the ledger.** Verifies that orders, balances, batches and net positions agree; prevents double entries.
3. **Maintains the collateral register.** Every node's collateral is recorded on the ledger, so a penalty is a ledger operation rather than a legal action.
4. **Nets and settles in batches.** Aggregates completed orders, computes net positions, and hands only what must finally be delivered to the external settlement layer.

## Entry

* Settlement liquidity above the minimum; the amount contributed sets the node's ledger weight.
* A record of epochs without penalty and a settlement volume above the bar.
* A full node with uptime of 99.9 percent or better. Throughput sets how much ledger volume the node may take on.

## What it earns

A share of the Chain pool, which receives 45 percent of every conditional settlement fee and is cleared weekly. The share is proportional to liquidity provided multiplied by ledger volume, weighted by reputation score.

Weekly because ledger errors surface at reconciliation, not on the spot. The Chain pool takes the largest share of the fee because it is the ledger's security budget: the ledger is trustworthy only if enough independent operators keep it that attacking it does not pay.

## Cost of error

A ledger error or an outage costs the node its share of the pool for the period, and reputation.

## Who it suits

Teams that already run institutional-grade custody or clearing infrastructure: a full node, redundancy across regions, key management, and people who can resolve a reconciliation break.
