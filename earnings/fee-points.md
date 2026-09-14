---
title: Fee points
---

# Fee points

The network charges at four points. Two of them are priced at or near zero on purpose.

| Fee point | How it is charged | Where it goes |
|---|---|---|
| Transfer | Fixed micro-fee per payment, priced below a mainstream stablecoin transfer | Routing fee paid directly to the Light worker as the transfer clears; the settlement part enters the Light pool |
| AIUSD mint and redeem | Free, no cap | Nowhere. It is the entry point, not revenue |
| Conditional settlement | 5 to 30 basis points of the amount, depending on scenario | Split among three pools and the Reserve |
| Dispute adjudication | Per case, paid by the losing party | Directly to the Adjudicator; never pooled |

The pattern: both ends are free or nearly free, and the network earns where the condition is settled and the judgment is made.

## The settlement fee split

Every conditional settlement fee is divided the same way:

```
Conditional settlement fee (5–30 bps)
   ├─ Chain pool          45%   → Chain workers, cleared weekly
   ├─ Adjudication pool   30%   → Adjudicators, cleared monthly with holdback
   ├─ Light pool          15%   → Light workers, cleared daily
   └─ Reserve             10%   → claims fund, never distributed
```

These four ratios are the only parameter shared across pools. They are protected at the highest level and are not adjusted lightly. The pools do not subsidise or transfer to one another; each is cleared independently.

## Who pays the settlement fee

By default the payer. Whether it can be negotiated onto the payee, and whether a refunded payment is charged, are open design points and are listed in [Parameters](../reference/parameters.md).
