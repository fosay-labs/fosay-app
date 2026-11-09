# Approval requests

`fosay-approvals` is a queue of payments the agent can't make alone. It holds no funds and
has no admin. One deployment serves every wallet.

## Request lifecycle

```
   propose (agent :ask rule, or owner)
        │
        ▼
     Pending ──execute(id) by the wallet──▶ Executed   (transfer happens in the same call)
        │
        ├──cancel(id) by the wallet───────▶ Cancelled  (owner says no, or agent withdraws)
        │
        └──expire(id) by anyone,
           after expires_ledger───────────▶ Expired
```

Only `Pending` requests can change state. Every transition decrements the wallet's pending
count. With the testnet configuration, a wallet can have at most **20** pending requests,
and a request can live at most **120,960 ledgers** (about 7 days). The agent runtime asks
for 17,280 ledgers (one day) by default.

## What the owner signs

Approving means signing one authorization entry whose root invocation is
`fosay-approvals.execute(id)` and whose only sub-invocation is
`USDC.transfer(wallet, to, amount)`, with rule ids `[0, 0]` (owner for both calls).

That binding is invariant **I6**: an approval can't be replayed as a bare transfer, and a
bare transfer authorization can't be used to execute a request. The contract calls
`account.require_auth()` before it moves the token.

The web app never trusts the API for what you sign. It builds and simulates the `execute`
transaction itself, decodes the authorization entry, and blocks the approve button if the
amount, recipient or token differ from the on-chain request.

## Can the agent execute its own request?

Only if the transfer would pass its own `:pay` rule anyway. `execute` needs the wallet's
authorization, and the agent can only provide that through `agt:pay`, whose policy still
enforces the cap and budget. So an over-limit request can only be executed by the owner.

## Fields

| Field | Type | Notes |
|---|---|---|
| `id` | `u64` | Starts at 1 |
| `account` | `Address` | The wallet that would pay |
| `token`, `to`, `amount` | `Address`, `Address`, `i128` | The transfer |
| `mandate_hash` | `BytesN<32>` | Links the request to the agent's mandate document |
| `memo` | `String` | The agent's reason, at most 140 bytes |
| `created_ledger`, `expires_ledger` | `u32` | |
| `status` | `Pending` · `Executed` · `Cancelled` · `Expired` | |

`IntentProposed` events drive the push notification. The API indexes all four events, so
lists and history come from the API, while each approval screen reads the request itself
from the contract.
