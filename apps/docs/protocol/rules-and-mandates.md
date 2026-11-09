# Rules and mandates

## Context rules

A FOSAY wallet is an OpenZeppelin `stellar-accounts` v0.8.0 smart account. Every
authorization names one **context rule** per call it authorizes (`context_rule_ids`, in
call order). The account checks that the rule's scope matches the call, that the rule's
signers signed, and that every policy on the rule agrees.

Connecting an agent adds two rules:

| Rule | Scope | Signers | Policies |
|---|---|---|---|
| `<name>:pay` | `CallContract(USDC SAC)` | agent Ed25519 key (External signer, OZ Ed25519 verifier) | `fosay-mandate-policy` with the mandate |
| `<name>:ask` | `CallContract(fosay-approvals)` | same key | none |

Rule `0` is the owner's `Default` rule, with the passkey (External signer, OZ WebAuthn
verifier). The web app creates both agent rules with two passkey prompts: one adds `:pay`
and installs the mandate, the other adds `:ask`.

## The mandate

```rust
pub struct MandateParams {
    pub budget: i128,              // max total spend in any rolling window of period_ledgers
    pub period_ledgers: u32,       // 8 ..= 535,680 (31 days)
    pub max_per_tx: i128,          // 0 < max_per_tx <= budget
    pub recipients: Vec<Address>,  // empty = any recipient; at most 20
    pub mandate_hash: BytesN<32>,  // sha256 of the canonical mandate document
}
```

Amounts are in token base units. USDC has 7 decimals on Stellar, so 5 USDC is `50_000_000`.
A ledger closes about every 5 seconds, so a day is 17,280 ledgers.

The **mandate document** is the human-readable version the owner approved: agent name,
purpose, token, limits, recipients, creation time. The web app stores it with the API and
puts its sha256 (over canonical JSON with sorted keys) on-chain as `mandate_hash`. The API
refuses to pair an agent unless the hash on-chain matches the document.

## Mandate lifecycle

```
            install (owner adds :pay rule)
                      │
                      ▼
   ┌──────────────► Active ◄──────────────┐
   │                  │                   │
   │ set_paused(false)│ set_paused(true)  │ update_mandate
   │                  ▼                   │ (budget, cap, recipients, hash;
   └─────────────── Paused                │  spend so far still counts)
                      │                   │
                      ▼                   │
          uninstall (owner removes the rule: agent revoked)
```

`period_ledgers` and the token are fixed at install. Changing them means a new rule.

## The rolling budget

The policy keeps spend in a ring of exactly **9 slots** (8 buckets + 1). With
`bucket_len = ceil(period_ledgers / 8)`, the current bucket is `ledger / bucket_len`. A payment
adds its amount to the current bucket's slot, overwriting the slot if it holds an older
bucket. The live window is the current bucket and the 8 before it.

**Any `period_ledgers`-long interval ending now lies inside the live window**, so total spend
in any rolling period never exceeds the budget. The window can be up to one bucket stricter
than the nominal period, never looser.

### Worked example

Budget 5 USDC, period 17,280 ledgers (1 day), so `bucket_len = 2,160` ledgers (3 hours).

| When | Bucket | Event | Spent in window | Remaining |
|---|---|---|---|---|
| ledger 216,000 | 100 | pay 2 | 2 | 3 |
| ledger 222,500 | 103 | pay 2 | 4 | 1 |
| ledger 223,000 | 103 | try 1.5 | refused: `BudgetExceeded` | 1 |
| ledger 233,280 | 108 | (window is 100–108) | 4 | 1 |
| ledger 235,440 | 109 | (window is 101–109: bucket 100 drops out) | 2 | 3 |

The first 2 USDC came back 27 hours after its bucket started, 3 hours later than a perfect
24-hour window. That is the trade-off for constant storage.

### Why a fixed ring

A list that grows with use makes some payments pay rent for new bytes. On testnet the first
payment into a growing list cost 54,322 stroops, against 18,683 in steady state. That's over the
x402 facilitator's 50,000-stroop ceiling, so x402 payments would fail. The ring is created
full at install and written in place, so the entry never changes size.

## Checks in `enforce`, in order

1. Mandate installed, else `NotInstalled`.
2. Not paused, else `Paused`.
3. The rule has at least one signer, and all of them authenticated, else `SignerMissing` (invariant I3).
4. The call is `transfer` on the mandate's token with 3 arguments, else `NotAllowed`.
5. Amount > 0, else `NotAllowed`.
6. Amount ≤ `max_per_tx`, else `PerTxLimitExceeded`.
7. Recipient in the list (when the list is non-empty), else `RecipientNotAllowed`.
8. Spent in window + amount ≤ budget, else `BudgetExceeded`.
9. Record the amount. **No event and no TTL extension**, to keep x402 payments valid and cheap.

When a policy fails inside `__check_auth`, the transaction only reports
`Error(Auth, InvalidAction)`. The specific code is in the simulation diagnostics, and the
SDK reads it so the agent knows to ask instead of retry.
