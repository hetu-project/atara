---
title: Three levels, one ladder
---

# Three levels, one ladder

A conditional payment needs three things done: the money has to move, the ledger has to be kept, and the outcome has to be decided. The network assigns one to each level of node.

```
Payer locks funds
      │
      ▼
┌──────────────────────┐
│  Light worker        │  Move the money: provide liquidity, route payments, net channels
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  Chain worker        │  Keep the ledger: record, reconcile, net, maintain the collateral register
└──────────┬───────────┘
           ▼ (when a condition is contested)
┌──────────────────────┐
│  Adjudicator         │  Decide the outcome: verify evidence, issue rulings
└──────────────────────┘
```

## The same node at three ages

The three levels are three licenses held by one node, not three types of institution.

* A node enters as a Light worker. It is promoted on work, record and reputation, never on capital alone.
* A higher license includes the lower ones. An Adjudicator may still route and ledger; a Light worker may not adjudicate.
* Licenses cannot be bought, transferred or inherited.

## At a glance

| | Light worker | Chain worker | Adjudicator |
|---|---|---|---|
| Core work | Route payments | Ledger and settle | Decide disputes |
| What it earns | Turnover | Volume | Judgment |
| Main input | Payment liquidity | Settlement liquidity and a full node | Adjudication compute and a penalty pool |
| Entry | Post collateral, run a light node; same day | Reputation and a clean record over time | Top-tier reputation and a long error-free record |
| Cost of error | Loses routing fees | Loses pool share | Loses reputation and collateral; demoted at once |

Each level has its own page: [Light worker](light-worker.md), [Chain worker](chain-worker.md), [Adjudicator](adjudicator.md).
