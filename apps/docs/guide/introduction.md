# Introduction

FOSAY is a Stellar smart wallet that you share with your AI agent. The agent gets its own
key on the wallet with a mandate you write: how much it may spend per payment, how much in
total over a period, and optionally who it may pay. Payments inside the mandate go through
on their own. Anything outside it becomes a request that you approve or reject on your
phone with a passkey.

The name is the rule: **F**unds **O**nly **S**pent **A**fter **Y**es. You say yes once, to
the mandate. Every payment beyond it needs another yes.

## The problem

AI agents can now buy things. The x402 protocol lets an agent pay for an API call over plain
HTTP. CoinDesk reported about 75 million x402 transactions worth about $24 million in the
30 days before 15 July 2026, and Stellar is one of the networks x402 settles on.

People don't trust agents with money yet. Surveys published in 2026 keep finding the same
gap:

- NMI (1,000 US adults, August 2026): 45% would not trust AI to make purchases for them, and
  69% do not trust AI to process payments securely.
- Checkout.com (June 2026): one in four consumers say they will never delegate purchases
  to AI, and merchants expect customers to want to revoke an agent's permissions in real time.

Today's choices are both bad. Either you give the agent a funded key, and a bug or a
prompt injection can drain it. Or you approve every payment by hand, which removes the point
of having an agent.

## What FOSAY does about it

FOSAY puts the limit where the money is: in the wallet contract.

1. **You create a wallet with a passkey.** It's the canonical OpenZeppelin smart account
   on Stellar. Your passkey (Face ID, Touch ID, Windows Hello, a security key) is the owner.
2. **You connect an agent.** You write its mandate (for example 5 USDC a day, at most 2 USDC
   per payment), and the agent's public key is added to the wallet under two narrow rules.
   It can only send USDC, within the mandate, and ask you for more.
3. **The agent pays on its own within the mandate.** Every payment passes through
   `fosay-mandate-policy` on-chain, which checks the cap, the budget, the recipient and the
   pause flag. A payment that fails a check never happens.
4. **Bigger payments become requests.** The agent calls `fosay-approvals.propose`. You get a
   push notification, open the request, and the app shows the exact transfer your passkey
   would authorize, decoded from the transaction itself.
5. **You say yes or no.** Approving signs `execute(id)` with your passkey, and the payment
   goes out. Rejecting cancels it. You can pause, edit or revoke the agent at any time.

## What it is made of

| Piece | Repository | What it does |
|---|---|---|
| `fosay-mandate-policy` | [fosay-contract](https://github.com/fosay-labs/fosay-contract) | Policy on the agent's payment rule: cap, rolling budget, recipients, pause |
| `fosay-approvals` | fosay-contract | Queue of over-limit requests; owner approval bound to `execute(id)` |
| `@fosay/sdk` | [fosay-app](https://github.com/fosay-labs/fosay-app) | Contract clients, x402 payer for smart accounts, allowlisted agent signing |
| `@fosay/agent`, `@fosay/mcp` | fosay-app | Agent runtime, CLI and MCP server (five tools) |
| `@fosay/api` | fosay-app | Indexer, push notifications, fee-paying relayer, TTL keeper |
| `@fosay/web` | fosay-app | Owner app: passkey wallet, connect agent, approvals |

FOSAY doesn't ship its own account contract. Wallets are the canonical
OpenZeppelin `stellar-accounts` v0.8.0 smart account, deployed per user by
smart-account-kit. FOSAY adds a policy and a queue on top.

## Status

Testnet. Not audited. The full flow (passkey wallet, connect agent, x402 payment settled by
the official facilitator, over-budget request, passkey approval) has been run end to end on
testnet in a real browser. Planned work is tracked as GitHub issues in both repositories.

::: details Sources
- CoinDesk, "Ripple joins card giants backing x402 as 75 million payments move just $24 million", 15 July 2026.
- NMI, "Consumers want AI to help them shop, not control their spending", 2026.
- Checkout.com newsroom, "Consumer demand for AI shopping is forming fast but trust for agentic commerce is still catching up", June 2026.
:::
