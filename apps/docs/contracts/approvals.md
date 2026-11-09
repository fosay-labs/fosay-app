# fosay-approvals

A queue of over-limit payment requests. Holds no funds, has no admin. One deployment serves
every wallet.

Testnet: [`CAZDF7XQSKLZK5JG4FPCG6ZSGK3C4ZGNBKHU3VYDPQSZWLX2HPRXJCIU`](https://stellar.expert/explorer/testnet/contract/CAZDF7XQSKLZK5JG4FPCG6ZSGK3C4ZGNBKHU3VYDPQSZWLX2HPRXJCIU)
· Source: [`contracts/approvals`](https://github.com/fosay-labs/fosay-contract/tree/main/contracts/approvals)

## `__constructor`

```rust
pub fn __constructor(e: &Env, max_pending_per_account: u32, max_ttl_ledgers: u32)
```

Runs once at deploy. Both values must be > 0 (`InvalidConfig`), and they can never change.
Testnet: `max_pending_per_account = 20`, `max_ttl_ledgers = 120,960` (about 7 days).

## `propose`

```rust
pub fn propose(e: &Env, account: Address, token: Address, to: Address, amount: i128,
               mandate_hash: BytesN<32>, memo: String, ttl_ledgers: u32) -> u64
```

| | |
|---|---|
| Who | The wallet, authorized by the agent's `:ask` rule or the owner |
| Triggered by | The agent hitting a limit (`fosayFetch`, `fosay_request_approval`, `fosay-agent`) |
| Checks | `amount > 0` (`InvalidAmount`); `0 < ttl_ledgers <= max_ttl_ledgers` (`InvalidTtl`); memo ≤ 140 bytes (`MemoTooLong`); pending < max (`TooManyPending`) |
| Effect | Stores the request as `Pending`, increments the pending count |
| Returns | The new request id |
| Event | `IntentProposed(account, id; token, to, amount, mandate_hash, memo, expires_ledger)` |

## `execute`

```rust
pub fn execute(e: &Env, id: u64)
```

| | |
|---|---|
| Who | The wallet. In practice the owner, with rule ids `[0, 0]` |
| Triggered by | **Approve** in the web app |
| Checks | exists (`NotFound`); `Pending` (`NotPending`); `ledger <= expires_ledger` (`Expired`); then `account.require_auth()` |
| Effect | Marks `Executed`, decrements the count, transfers `amount` of `token` from the wallet to `to`. Atomic |
| Event | `IntentExecuted(account, id; to, amount)` |

## `cancel`

```rust
pub fn cancel(e: &Env, id: u64)
```

The wallet says no (owner: **Reject**) or the agent withdraws (`fosay_cancel_request`).
`Pending` → `Cancelled`. Errors `NotFound`, `NotPending`. Event `IntentCancelled(account, id)`.

## `expire`

```rust
pub fn expire(e: &Env, id: u64)
```

No auth. After `expires_ledger`, `Pending` → `Expired` and the slot is freed. The API keeper
calls it for stale requests. Errors `NotFound`, `NotPending`, `NotYetExpired`. Event
`IntentExpired(account, id)`.

## Views

```rust
pub fn get_intent(e: &Env, id: u64) -> Intent
pub fn pending_count(e: &Env, account: Address) -> u32
```

`get_intent` errors with `NotFound` for unknown ids. Lists of requests come from the API
indexer, not the contract.

## Errors

4200–4208. See [Error codes](./errors).
