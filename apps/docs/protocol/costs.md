# Costs and who pays

Stellar fees are paid in XLM. One XLM is 10,000,000 stroops. Every number on this page was
measured on testnet on 9 November 2026 with a fresh wallet (fosay-contract
`docs/DEPLOYMENT.md`). Mainnet uses the same fee model.

## Per action

| Action | Who pays the fee | Resource fee (stroops) | In XLM |
|---|---|---|---|
| Create the wallet | FOSAY relayer | (smart-account-kit deploy) | — |
| Connect an agent (`:pay` rule + mandate, then `:ask` rule) | relayer | 771,801 + 92,505 charged | 0.0864 |
| Keeper renews the wallet's 12 footprint entries to 31 days | keeper | 412,174 charged | 0.0412 |
| Agent x402 payment (steady state) | x402 facilitator | 18,959 (13,971 charged) | 0.0019 |
| Agent `propose` | relayer | 409,852 charged | 0.0410 |
| Owner `execute(id)` | relayer | 20,697 (15,624 charged) | 0.0021 |

The wallet holder pays no XLM at all. The token they spend is USDC.

## Why the keeper exists

The x402 facilitator refuses payments whose fee is over its ceiling, 50,000 stroops by
default. An agent payment touches 9 to 12 ledger entries: the wallet instance, the agent's
rule, signer and policy data, the mandate entry, the USDC balance and contract code.

The OpenZeppelin account extends any entry it reads that has less than 29 days of TTL left,
and the payment that triggers this pays the rent. Measured: an agent payment before the
keeper ran simulated at **311,366 stroops**, six times the ceiling.

So the API's keeper keeps every entry a payment touches above 29 days, extending them to 31
days whenever they drop below. It also runs right after an agent is paired, so the agent's
first payment is already cheap. After that, a payment costs 18,959 stroops.

## Rough running cost per wallet

The keeper's first renewal for a new wallet (from about 6 days of TTL to 31) cost 412,174
stroops, about 16,500 stroops per day of TTL bought. At that rate, keeping one active wallet's
entries alive costs on the order of **0.6 XLM a year**. This is an estimate from one
measurement. Shared code entries (the OZ account WASM and verifiers) are renewed once for
everyone. On 9 November 2026 that one-off renewal of a 48 KB code entry cost about 37 testnet XLM.

## Known cost to cut

`propose` costs about 410,000 stroops because the request entry and pending counter are
extended to 30 days, though a request lives at most 7 days. Bounding the TTL by the request's
expiry is tracked as an issue in fosay-contract.

## The fee caps FOSAY sets

- The relayer refuses to submit anything whose fee is over `RELAYER_MAX_FEE_STROOPS`
  (default 2,000,000).
- The relayer only pays for FOSAY-shaped calls, so it can't be used as a free fee payer
  (see [Security model](./security)).
