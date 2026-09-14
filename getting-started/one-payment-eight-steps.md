---
title: One payment, eight steps
---

# One payment, eight steps

This page follows one conditional payment from the payer's wallet to the payee's, and shows where each level of node touches it and where the fee is taken.

## The eight steps

| # | Step | Who acts | What changes |
|---|---|---|---|
| 1 | Deposit | Payer | External stablecoin is deposited; AIUSD is minted 1:1, no fee |
| 2 | Lock | Payer | AIUSD moves into the escrow contract. Neither party can move it. The condition, evidence requirements and dispute window are recorded |
| 3 | Deliver | Payee | Payee performs and submits evidence: a delivery signature, an API callback, an on-chain proof, a bank confirmation |
| 4 | Adjudicate | Adjudicators | Evidence is checked against the condition. Outcome: release, refund, or dispute |
| 5 | Route | Light workers | AIUSD is delivered to the payee through payment channels; opposite flows are netted and only the difference settles |
| 6 | Ledger | Chain workers | The final state is recorded on the shared ledger, balances are reconciled, the batch is netted |
| 7 | Split | Protocol | The settlement fee is divided among three pools and the reserve |
| 8 | Withdraw | Payee | AIUSD is redeemed for external stablecoin, no fee |

Most payments never reach a human. In step 4, the large majority of orders are verified automatically against preset rules. A small share is flagged for more evidence. A very small share becomes a dispute, and only those are reviewed in full.

## A worked example

Buyer pays seller 10,000 USDC on the condition "shipment signed for". The settlement fee for this scenario is 20 basis points.

| Step | Amount |
|---|---|
| Deposit | 10,000 USDC in, 10,000 AIUSD minted |
| Lock | Buyer −10,000, escrow +10,000 |
| Adjudicate | Automatic verification passes |
| Fee | 20 bps = 20 AIUSD taken from escrow |
| Route | Seller +9,980 AIUSD |
| Split | 9 to the Chain pool, 6 to the Adjudication pool, 3 to the Light pool, 2 to the Reserve |
| Withdraw | 9,980 AIUSD redeemed for 9,980 USDC |

The buyer's total cost is 20 AIUSD, 0.2 percent. A letter of credit for the same transaction typically costs 1 to 3 percent.

If the payment had been disputed, the dispute fee would be paid separately by the losing party, directly to the adjudicator. It does not come out of the 20 AIUSD.

## Where the money sits

At any moment, funds in the network are in one of four places, and none of them can be used for another purpose:

| Where | Whose | Who can move it |
|---|---|---|
| Reserve account backing AIUSD | All AIUSD holders | Only minting and redemption |
| Escrow contracts | The two parties, outcome pending | Only an adjudication result |
| Node collateral register | The node itself | The node, after a cooling period; the contract, as a penalty |
| The three pools | Nodes that worked this period | Cleared automatically every period |

How the fee split and the pools work is on the [Earnings](../earnings/fee-points.md) pages.
