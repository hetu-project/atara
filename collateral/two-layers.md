---
title: Collateral
---

# Collateral

Every node posts collateral. It is registered on the ledger, it is forfeited on the ledger, and the network pays no yield on it.

## Two layers

| Layer | What it holds | What it is for |
|---|---|---|
| Cash layer | AIUSD | Covers exposure in transit and any active penalty. Movable in seconds. This is the layer that penalties are taken from |
| Static layer | Whitelisted tokenised short-dated sovereign debt | The remainder of the node's collateral. Its yield is paid to the node's own account, not through the issuer and not through the network |

All collateral, both layers, is recorded in the collateral register that Chain workers maintain. A penalty is a ledger operation: the contract debits the register. No one has to sue anyone.

## No yield from the network

The network never pays interest on collateral. Three reasons, in order of weight:

1. **Legal.** Paying interest on posted funds is taking deposits and paying interest on them. That is what a bank does, and the network is not one.
2. **Incentive.** Interest on collateral has nothing to do with work. Paying it would reward capital for sitting still, and it would tie the network's security budget to an external interest rate.
3. **Separation.** The issuer of AIUSD and the network must have no channel of value between them. Interest on the AIUSD reserve belongs to the issuer, and the issuer distributes none of it to nodes.

The static layer is how a node avoids the opportunity cost. Yield on the node's own sovereign-debt holdings is the node's own income. The economic effect is the same as being paid interest; the legal character is different, and that difference is the point.

## What collateral does and does not do

Collateral sets how much a node may take on: quota is the lower of collateral ÷ k₁ and compute ÷ k₂. It does not set what the node is paid. Pay comes from work credits and reputation. A node with large collateral and no work earns nothing from the pools.
