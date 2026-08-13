# Atara

Atara is an AI-native conditional payment protocol. A credit model prices each
counterparty before funds move — how much collateral to post, what fee to charge,
and how the payment unwinds if the deal fails. Funds become final when the agreed
condition is verified, not merely when they arrive.

## This repository

| Path | What it is |
|---|---|
| `src/` | Web console for counterparty profiles and order management (React + Vite + Supabase) |
| `supabase/` | Database schema and row-level security policies |
| `papers/` | Research references for the protocol |
| `docs/DEVELOPMENT.md` | Local setup and handover notes |

The public landing page lives on the [`landing-page`](../../tree/landing-page) branch.

## Notes

- All rates, amounts and model outputs shown in product surfaces are illustrative.
- Atara is not a bank. The credit engine is in development and is not extending credit.
