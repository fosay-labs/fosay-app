# Error codes

When a policy fails inside the account's `__check_auth`, the transaction shows only
`Error(Auth, InvalidAction)`. The real code is in the simulation diagnostics.
`decodeSimulationError` in `@fosay/sdk` extracts it into a `FosayError` with `code` set to
the name below.

## fosay-mandate-policy (4100–4110)

| Code | Name | Raised by | Meaning | What the client should do |
|---|---|---|---|---|
| 4100 | `NotInstalled` | all but `install`/`uninstall` | No mandate on this wallet and rule | Check the rule id; the agent may be revoked |
| 4101 | `AlreadyInstalled` | `install` | The rule already has a mandate | Use `update_mandate` |
| 4102 | `OnlyCallContractAllowed` | `install` | Rule scope isn't `CallContract(token)` | Create the rule with a token scope |
| 4103 | `InvalidParams` | `install`, `update_mandate` | Budget, cap, period or recipient count out of range | Fix the form values |
| 4104 | `Paused` | `enforce` | The owner paused the agent | Agent: stop paying; ask the owner |
| 4105 | `SignerMissing` | `enforce` | Not every rule signer signed, or the rule has none | Sign with the agent key under the `:pay` rule |
| 4106 | `NotAllowed` | `enforce` | Not a `transfer` on the mandate's token, or amount ≤ 0 | The agent can only send its token |
| 4107 | `PerTxLimitExceeded` | `enforce` | Amount over `max_per_tx` | Agent: open an approval request |
| 4108 | `RecipientNotAllowed` | `enforce` | Recipient not in the allowlist | Agent: open an approval request |
| 4109 | `BudgetExceeded` | `enforce` | Window spend + amount over budget | Agent: open an approval request, or wait |
| 4110 | `MathOverflow` | `enforce`, views | Checked arithmetic overflowed | Report it as a bug |

## fosay-approvals (4200–4208)

| Code | Name | Raised by | Meaning |
|---|---|---|---|
| 4200 | `NotFound` | `execute`, `cancel`, `expire`, `get_intent` | No request with that id |
| 4201 | `NotPending` | `execute`, `cancel`, `expire` | Already executed, cancelled or expired |
| 4202 | `Expired` | `execute` | Past `expires_ledger`; it can only be expired now |
| 4203 | `NotYetExpired` | `expire` | Still inside its TTL |
| 4204 | `InvalidAmount` | `propose` | Amount ≤ 0 |
| 4205 | `InvalidTtl` | `propose` | TTL is 0 or over `max_ttl_ledgers` |
| 4206 | `MemoTooLong` | `propose` | Memo over 140 bytes |
| 4207 | `TooManyPending` | `propose` | The wallet has 20 pending requests |
| 4208 | `InvalidConfig` | `__constructor` | A config value is 0 |
