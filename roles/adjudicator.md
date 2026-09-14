---
title: Adjudicator
---

# Adjudicator

An Adjudicator verifies evidence and issues rulings when a condition is contested. It is paid for judgment.

## Why the network needs it

The value of a conditional payment is that funds are released only when the condition is met. Someone has to decide whether it was. The payer cannot decide alone, or it would refuse to pay. The payee cannot decide alone, or it would claim delivery. A single platform deciding would put the trust back in one company's hands. Adjudicators decide by preset rules, evidence, and consensus among several nodes.

## What it does

Work is tiered by difficulty. Each tier is smaller and more expensive than the one above it.

1. **Normal orders**, the large majority. Evidence is checked automatically against the preset condition. If everything matches, release is triggered with no human involved.
2. **Flagged orders**, a small share. Evidence conflicts. The order is marked, and more evidence is requested before a decision.
3. **Disputes**, a very small share. All evidence is reviewed, a ruling is issued, and the full record is kept.

## Entry

The highest bar in the network:

* A penalty pool of at least 10 to 15 percent of the value under adjudication.
* Reputation score in the top 5 percent of its category.
* A long record without error, and attestation accuracy above the bar.
* Certified adjudication compute in one of three tiers (1×, 4×, 16×), with a 99.99 percent SLA. The tier sets how many cases the node may handle at once.

Reputation and record cannot be bought. This is the one level that must be earned case by case.

## What it earns

Two parts:

* **A share of the Adjudication pool**, which receives 30 percent of every conditional settlement fee. The share is proportional to attestation volume plus certified capacity weighted by SLA, all weighted by reputation score. Capacity counts because the network pays for judgment to be on standby, not only for judgment delivered.
* **Dispute fees**, charged per case and paid by the losing party directly to the Adjudicator. Dispute fees never enter a pool: pooling them would mean the whole network subsidising whoever raises a dispute.

The Adjudication pool is cleared monthly with a holdback. About 60 percent of a node's share is released at the end of the period; the rest is held until the dispute window on those rulings has closed. A ruling that is overturned forfeits the held amount to the Reserve. Judgment is paid once time has verified it.

## Cost of error

The heaviest in the network: reputation is burned, the penalty pool and held pay are forfeited, and the node is demoted immediately.

## Who it suits

Operators with certified compute, a long record on the network, and the appetite to post a penalty pool against the cases they decide. In practice, Adjudicators are Chain workers who have earned their way up.
