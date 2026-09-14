---
title: Where the volume comes from
---

# Where the volume comes from

Nodes are paid on conditional settlement volume. This page is about where that volume comes from and which scenarios the network is built for.

## The problem a conditional payment solves

Any transaction between strangers stalls on one question: who moves first. If the buyer pays first, the seller may not deliver. If the seller delivers first, the buyer may not pay. Finance has a name for this, principal risk, and a traditional answer: an intermediary both sides trust. A bank issues a letter of credit; a platform holds the money; an escrow agent takes custody. These cost 1 to 3 percent of the amount.

A conditional payment replaces the intermediary with a contract, evidence, and adjudicators, at 5 to 30 basis points.

## What makes a scenario a fit

Three tests:

| Test | Why it matters |
|---|---|
| Can the evidence be verified by a machine? | Automatic verification keeps the cost per order low. If a person has to read a contract photo, even 30 basis points does not cover it |
| Is the current alternative expensive? | Against a letter of credit at 1 to 3 percent there is room to price. Against a platform's free escrow there is none |
| How often does it happen? | A node's income scales with turnover. A scenario with large tickets and two orders a year pays little |

## Scenarios

**Compute procurement.** Condition: job completed, result verified, SLA met. Evidence is structured (job hash, result hash, SLA metrics) and verified without a human. The buyers and sellers of compute are the same organisations that run Chain workers and Adjudicators.

**The fiat leg of an OTC trade.** Condition: bank wire confirmed. When both legs are on-chain, an atomic swap is enough and no conditional payment is needed. When one leg is a bank transfer, the contract cannot see the bank, and that is where a conditional payment applies. Active OTC desks settle tens of trades a day and hold stablecoin inventory with two-way flow; one desk brings volume, liquidity and a fiat rail at the same time.

**Trade finance and commodity delivery.** Condition: bill of lading, inspection certificate, customs clearance, transfer of title. This is where letters of credit have operated for centuries and the price gap is widest. Documents are slow to digitise and the counterparties are conservative; the network treats this as a later scenario, not a first one.

**Others.** Agent-to-agent payment on result, freelance and outsourcing settlement, and marketplace escrow each fit the mechanism. Their volumes today are small, the tickets are small, or the platform already holds the escrow and will not give it up.

Which scenarios carry a fee at the low end of the 5 to 30 basis point range and which at the high end is set on live data. See [Parameters](../reference/parameters.md).
