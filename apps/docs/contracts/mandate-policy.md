# fosay-mandate-policy

An OpenZeppelin smart-account policy (`stellar_accounts::policies::Policy`) for the agent's
`:pay` rule. One deployment serves every wallet. State is keyed by
`(smart_account, context_rule_id)`.

Testnet: [`CABMDEJEXOIBR4F6TDIYQ7CA5GFENXAYDRA4WH7V4QR7PAMTFIEQWWQ5`](https://stellar.expert/explorer/testnet/contract/CABMDEJEXOIBR4F6TDIYQ7CA5GFENXAYDRA4WH7V4QR7PAMTFIEQWWQ5)
· Source: [`contracts/mandate-policy`](https://github.com/fosay-labs/fosay-contract/tree/main/contracts/mandate-policy)

## Constants

| Name | Value | Meaning |
|---|---|---|
| `BUCKETS` | 8 | Budget window granularity (ring has `BUCKETS + 1` = 9 slots) |
| `MAX_RECIPIENTS` | 20 | Longest recipient allowlist |
| `MIN_PERIOD_LEDGERS` | 8 | At least one ledger per bucket |
| `MAX_PERIOD_LEDGERS` | 535,680 | 31 days |
| `TTL_EXTEND_TO` | 518,400 | 30 days, for owner calls and `extend_ttl` |

## Functions called by the account

The OpenZeppelin account calls these. You trigger them through account operations, never directly.

### `install`

```rust
fn install(e: &Env, params: MandateParams, context_rule: ContextRule, smart_account: Address)
```

| | |
|---|---|
| Triggered by | `add_context_rule` or `add_policy` with this policy (web app: **Connect agent**, first passkey prompt) |
| Auth | `smart_account.require_auth()` |
| Checks | rule scope is `CallContract(token)` (`OnlyCallContractAllowed`); not installed (`AlreadyInstalled`); `budget > 0`, `0 < max_per_tx <= budget`, period in range, ≤ 20 recipients (`InvalidParams`) |
| Effect | Stores the mandate with 9 zeroed slots, extends TTL |
| Event | `MandateInstalled(smart_account, context_rule_id; token, budget, period_ledgers, max_per_tx, recipients, mandate_hash)` |

### `enforce`

```rust
fn enforce(e: &Env, context: Context, authenticated_signers: Vec<Signer>,
           context_rule: ContextRule, smart_account: Address)
```

| | |
|---|---|
| Triggered by | Every authorization under the `:pay` rule (an agent payment) |
| Auth | `smart_account.require_auth()` |
| Checks | The nine checks in [Rules and mandates](../protocol/rules-and-mandates#checks-in-enforce-in-order) |
| Effect | Adds the amount to the current bucket |
| Event | **none** (invariant I7) |

### `uninstall`

```rust
fn uninstall(e: &Env, context_rule: ContextRule, smart_account: Address)
```

| | |
|---|---|
| Triggered by | `remove_context_rule` or `remove_policy` (web app: **Revoke agent**) |
| Auth | `smart_account.require_auth()` |
| Effect | Removes the mandate; no error if missing |
| Event | `MandateUninstalled(smart_account, context_rule_id)` |

## Functions the owner calls

These need the wallet's authorization. The agent's rules don't cover this contract, so only
the owner (rule 0) can call them.

### `set_paused`

```rust
pub fn set_paused(e: &Env, smart_account: Address, context_rule_id: u32, paused: bool)
```

Pauses or resumes the agent (web app: **Pause** / **Resume**). Extends TTL. Event
`MandatePaused(smart_account, context_rule_id; paused)`. Error `NotInstalled`.

### `update_mandate`

```rust
pub fn update_mandate(e: &Env, smart_account: Address, context_rule_id: u32,
                      budget: i128, max_per_tx: i128, recipients: Vec<Address>,
                      mandate_hash: BytesN<32>)
```

Changes the limits (web app: **Edit limits**). Same validation as `install`. Keeps the token,
period, pause flag and spend so far. Event `MandateUpdated`. Errors `NotInstalled`, `InvalidParams`.

## Functions anyone calls

### `extend_ttl`

```rust
pub fn extend_ttl(e: &Env, smart_account: Address, context_rule_id: u32)
```

No auth. Extends the mandate entry's TTL to 30 days. The keeper extends it further through
a direct footprint TTL operation. Error `NotInstalled`.

### `get_mandate`

```rust
pub fn get_mandate(e: &Env, smart_account: Address, context_rule_id: u32) -> MandateData
```

Returns `{ token, budget, period_ledgers, max_per_tx, recipients, mandate_hash, paused, buckets }`.

### `remaining_budget`

```rust
pub fn remaining_budget(e: &Env, smart_account: Address, context_rule_id: u32) -> i128
```

`budget - spent_in_window`, or 0 when paused. The agent calls it to decide between paying and asking.

## Errors

4100–4110. See [Error codes](./errors).
