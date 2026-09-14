---
title: What the network does
---

# What the network does

Atara settles conditional payments: the payer locks funds in an escrow contract, the funds are released when the agreed condition is met, and disputes are decided on evidence.

An ordinary transfer moves money from A to B. A conditional payment moves money from A to B only after something has happened: goods were delivered, a compute job passed verification, a bank wire arrived. That is the whole difference, and it is what the network charges for.

## Three jobs

Settling a conditional payment breaks into three jobs, and the network assigns each to a level of node operator:

| Job | Question it answers | Who does it |
|---|---|---|
| Move the money | How does value get from A to B? | Light workers |
| Keep the ledger | What is the final state of every account? | Chain workers |
| Decide the outcome | Was the condition met? | Adjudicators |

The three levels are described in [Roles](../roles/overview.md).

## One unit of account

Inside the network there is a single unit, AIUSD. External assets are converted to AIUSD on the way in and converted back on the way out. Locking, adjudication, routing, ledgering, collateral and penalties are all denominated in AIUSD. A single unit is what makes netting possible: payments in opposite directions can cancel, and only the net difference needs to settle.

Minting and redeeming AIUSD are free and uncapped. They are the entry point, not the revenue.

## Where the fees are

The network charges at two points and almost nowhere else:

* **Conditional settlement.** A percentage of the amount, between 5 and 30 basis points depending on the scenario. This fee is split among the three levels of node and a reserve.
* **Dispute adjudication.** A per-case fee, paid by the losing party directly to the adjudicator.

Plain transfers carry a fixed micro-fee priced below a mainstream stablecoin transfer. Minting and redemption are free. The network is cheap at both ends and earns in the middle, where the condition is settled and the judgment is made.

## What the network is not

No node takes deposits, lends, or holds a customer's balance on its own books. Collateral is registered on the ledger and penalties are executed on the ledger. The network pays no interest on collateral. The reasons are on the [Collateral](../collateral/two-layers.md) page.
