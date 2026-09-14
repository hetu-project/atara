---
title: Glossary
---

# Glossary

**AIUSD.** The network's single unit of account. Minted 1:1 against deposited stablecoin, redeemed 1:1 on exit, both free. Every lock, fee, collateral position and penalty is denominated in it.

**Adjudicator.** The third node level. Verifies evidence and issues rulings; paid from the Adjudication pool and by dispute fees.

**Adjudication pool.** Receives 30% of each settlement fee. Cleared monthly with a holdback.

**Attestation.** An Adjudicator's signed statement that a condition was, or was not, met.

**Chain worker.** The second node level. Provides settlement liquidity, runs a full node, keeps the ledger and the collateral register. Paid from the Chain pool.

**Chain pool.** Receives 45% of each settlement fee. Cleared weekly.

**Clearing member.** An institutional role: net settlement, margin, fiat rails. Governed by contract, not code.

**Collateral register.** The on-ledger record of every node's collateral, maintained by Chain workers. Penalties are debits against it.

**Conditional payment.** A payment released only when an agreed condition is met, decided on evidence.

**Dispute window.** The period after a ruling during which it can be contested. Adjudicator holdback is released when it closes.

**Epoch.** One clearing period of a pool: a day, a week or a month.

**Escrow contract.** Where locked funds sit between lock and release. Neither party can move them; only an adjudication result can.

**Holdback.** The part of an Adjudicator's pool share, about 40%, held until the dispute window closes.

**Ledger seat.** An institutional role: one of about 100 chartered validators that finalise net positions hourly.

**Light worker.** The first node level. Provides channel liquidity and routes payments. Paid routing fees directly and from the Light pool.

**Light pool.** Receives 15% of each settlement fee. Cleared daily.

**Quota.** The most work a node is credited for in a period: the lower of collateral ÷ k₁ and compute ÷ k₂.

**Reputation score.** A per-node score of verified work done and errors made. Multiplies the node's pool share. Earned only; decays with inactivity.

**Reserve.** Receives 10% of each settlement fee, all forfeited collateral and held pay, and member and seat fees. Pays claims. Never distributed to nodes or members.

**Underwriting member.** An institutional role: credit lines, rollback risk pricing, settlement insurance.

**Work credits.** Verified, settled work inside quota. The basis of a node's pool share.
