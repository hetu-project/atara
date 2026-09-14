---
title: A worked example
---

# A worked example

One conditional payment, followed through the fee.

**Scenario.** Buyer pays seller 10,000 USDC on the condition "shipment signed for". The settlement fee for this scenario is 20 basis points.

| Step | Action | Amount |
|---|---|---|
| 1 | Buyer deposits 10,000 USDC | 10,000 AIUSD minted, no fee |
| 2 | Buyer locks into escrow | Buyer −10,000, escrow +10,000 |
| 3 | Seller ships and submits the signature | State: awaiting adjudication |
| 4 | Automatic verification passes | State: release |
| 5 | Settlement fee taken | 20 bps = 20 AIUSD |
| 6 | Light worker routes | Seller +9,980 AIUSD |
| 7 | Fee split | Chain pool 9 · Adjudication pool 6 · Light pool 3 · Reserve 2 |
| 8 | Seller redeems | 9,980 AIUSD burned, 9,980 USDC out, no fee |

The buyer paid 20 AIUSD, 0.2 percent of the amount. A letter of credit on the same transaction typically costs 1 to 3 percent.

## What each node sees

* The Light worker that routed step 6 received its routing micro-fee on the spot, and 3 AIUSD entered the Light pool it will share at the end of the day.
* 9 AIUSD entered the Chain pool, shared at the end of the week among Chain workers by liquidity and ledger volume.
* 6 AIUSD entered the Adjudication pool, shared at the end of the month, with part of each Adjudicator's share held until the dispute window closes.
* 2 AIUSD went to the Reserve and stays there.

## If it had been disputed

The dispute fee is a separate, per-case charge paid by the losing party directly to the Adjudicator. It does not come out of the 20 AIUSD, and it never enters a pool.

## On yields

This documentation does not quote an annual yield for any level. The two inputs are not yet fixed: the fee curve within the 5 to 30 basis point range is set per scenario on live data, and the utilisation of locked funds depends on real network volume. What is fixed is the structure: income comes only from real settlement volume, there is no reward for posting collateral and doing nothing, reputation multiplies work rather than adding to it, and the cost of error rises with the level.
