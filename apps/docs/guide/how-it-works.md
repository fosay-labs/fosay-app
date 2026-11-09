# How a payment works

This page follows one agent through a day, with the numbers from the testnet run on
9 November 2026. The mandate: **5 USDC per day, at most 2 USDC per payment, any recipient**.

## The wallet's rules

The wallet has three context rules. The OpenZeppelin account picks the rule from the
`context_rule_ids` the signer supplies, and checks that rule's signers and policies.

| Rule | Scope | Signer | Policy |
|---|---|---|---|
| `0` owner | `Default` (everything) | your passkey | none |
| `agt:pay` | `CallContract(USDC)` | agent's Ed25519 key | `fosay-mandate-policy` |
| `agt:ask` | `CallContract(fosay-approvals)` | agent's Ed25519 key | none |

The agent's key appears nowhere else. It can't add rules, unpause itself, edit its mandate
or upgrade the wallet, because none of those calls fall under `agt:pay` or `agt:ask`.

## 1. A small payment (x402)

The agent requests a paid API and gets `HTTP 402` asking for 1 USDC.

```
agent ──GET /report──▶ API ──402: pay 1 USDC to G…MERCHANT──▶ agent
agent: remaining_budget = 5, 1 ≤ max_per_tx 2  → pay
agent signs an auth entry for USDC.transfer(wallet, merchant, 1) under rule agt:pay
agent ──GET /report + payment──▶ API ──▶ x402 facilitator ──▶ Stellar
  account.__check_auth → rule agt:pay → mandate-policy.enforce
    signer ok · transfer on USDC · 1 ≤ 2 · window 0 + 1 ≤ 5 → record 1
facilitator settles, API returns the report
```

On testnet this payment's resource fee was **18,959 stroops** (0.0019 XLM), and the
facilitator paid it. Remaining budget: 4 USDC.

## 2. A payment over the cap

The agent wants a 3 USDC dataset. 3 is over the 2 USDC cap, so the policy would refuse it
with `PerTxLimitExceeded` (4107). The SDK learns this in simulation, before anything is
signed, and the agent asks instead:

```
agent ──approvals.propose(wallet, USDC, merchant, 3, mandate_hash,
        "buy the full dataset", ttl 17,280 ledgers)──▶ relayer ──▶ Stellar
event IntentProposed(#8) ──▶ FOSAY API indexer ──▶ Web Push ──▶ your phone
```

## 3. You approve

You open request #8. The app builds the `execute(8)` transaction, simulates it, and decodes
the authorization your passkey would sign:

> approvals.execute(#8) → transfer 3 USDC from your wallet to GBP5…XZ77

If the decoded amount, recipient or token differ from the request, the app refuses to let
you approve. You approve with your passkey. `execute` checks the request is still pending
and unexpired, marks it executed and moves the 3 USDC, all in one transaction (20,697
stroops resource fee on testnet, paid by the relayer).

## 4. The dashboard

The indexer attributes each payment: *paid by agent* for the x402 payment, *you approved*
for request #8. The agent still has 4 USDC of today's budget, because approved requests
don't count against the mandate.

## What happens at the edges

| Situation | Result |
|---|---|
| Agent tries to pay a 6th USDC today | `BudgetExceeded` (4109) in simulation; agent asks instead |
| You pause the agent | Every payment fails with `Paused` (4104) until you unpause |
| You revoke the agent | The rule is removed; its key can't sign for the wallet at all |
| Nobody answers a request | It expires at its ledger; anyone can call `expire` to free the slot |
| The agent asks 21 times | The 21st fails with `TooManyPending` (4207): at most 20 pending per wallet |
