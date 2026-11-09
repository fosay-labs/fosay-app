# fosay-app
FOSAY SDK, x402 signer, MCP server and passkey approval app for AI agents on Stellar.

> **F**unds **O**nly **S**pent **A**fter **Y**es. Your AI agent gets its own key on your
> smart wallet with a budget you set. Small payments go through on their own; bigger ones
> become requests you approve on your phone with a passkey.

Contracts: [`fosay-labs/fosay-contract`](https://github.com/fosay-labs/fosay-contract)
(mandate policy + approvals queue on the canonical OpenZeppelin smart account).

## How it fits together

```
 owner's phone ──passkey──▶ apps/web (Next.js PWA) ──▶ apps/api ──relayer──▶ Stellar
                                 ▲                       │  ▲
                        Web Push │      indexer/keeper   │  │ { func, auth }
                                 └───────────────────────┘  │
 AI agent ──MCP──▶ packages/mcp ──▶ packages/agent ─────────┘ (propose / cancel)
                                        │
                                        └──x402 payment──▶ paid API ──▶ x402 facilitator ──▶ Stellar
```

| Workspace | What it is |
|---|---|
| [`packages/sdk`](packages/sdk) `@fosay/sdk` | Contract clients (generated bindings + typed reads), the **x402 payer scheme for smart accounts**, agent auth-entry signing with an allowlist (via smart-account-kit), diagnostic error decoding (`BudgetExceeded`, `PerTxLimitExceeded`, …), mandate hashing, pairing codes. Isomorphic. |
| [`packages/agent`](packages/agent) `@fosay/agent` | Agent runtime: key file (0600), pay-or-ask `fosayFetch` (pays HTTP 402 within the mandate, otherwise opens an approval request), `fosay-agent` CLI. |
| [`packages/mcp`](packages/mcp) `@fosay/mcp` | MCP server (stdio) exposing the wallet as tools: `fosay_wallet_status`, `fosay_fetch_paid`, `fosay_request_approval`, `fosay_approval_status`, `fosay_cancel_request`. |
| [`apps/api`](apps/api) `@fosay/api` | Hono + Postgres: event indexer with payment attribution, Web Push on new requests, fee-sponsoring **relayer** (smart-account-kit protocol, FOSAY-only guard, fee cap, rate limits), **TTL keeper**, read API, pairing. |
| [`apps/web`](apps/web) `@fosay/web` | Next.js PWA: create passkey wallet, connect agent (mandate form → two passkey prompts → pairing code), dashboard, approvals with an **auth-entry decoder** (shows exactly what the passkey will sign), pause / edit / revoke. |

## Testnet deployment

| | |
|---|---|
| `fosay-mandate-policy` | `CABMDEJEXOIBR4F6TDIYQ7CA5GFENXAYDRA4WH7V4QR7PAMTFIEQWWQ5` |
| `fosay-approvals` | `CAZDF7XQSKLZK5JG4FPCG6ZSGK3C4ZGNBKHU3VYDPQSZWLX2HPRXJCIU` |
| OZ smart account WASM | `c514d35ea67eaea9bfc1fb3327854c0c06111bc1ddebd4fe217c504c1004b9e1` |
| USDC (testnet SAC) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |

Full record: [`deployments/testnet.json`](deployments/testnet.json). Everything defaults to these values; see [`.env.example`](.env.example).

## Run it locally

Requirements: Node ≥ 22.12, pnpm 10, Postgres 16, and two funded testnet accounts (relayer and keeper; they **must differ**).

```bash
pnpm install
cp .env.example .env    # fill DATABASE_URL, RELAYER_SECRET, KEEPER_SECRET, VAPID_* (npx web-push generate-vapid-keys)
```

```bash
pnpm --filter @fosay/api dev       # http://localhost:8787 (migrates the DB on start)
```

```bash
pnpm --filter @fosay/web dev       # http://localhost:3000
```

Connect an agent:

```bash
node packages/agent/bin/fosay-agent.mjs keygen          # prints the agent public key
# web app → Connect agent → paste the key → approve 2 passkey prompts → copy the pairing code
node packages/agent/bin/fosay-agent.mjs pair <code>
node packages/agent/bin/fosay-agent.mjs status
node packages/agent/bin/fosay-agent.mjs fetch https://paid-api.example/report --max 1
```

Use it from an MCP client (Claude Desktop / Claude Code `mcpServers` entry):

```json
{
  "fosay": {
    "command": "node",
    "args": ["/path/to/fosay-app/packages/mcp/bin/fosay-mcp.mjs"],
    "env": { "FOSAY_API_URL": "http://localhost:8787" }
  }
}
```

The agent key stays in `~/.fosay/agent.key` on the agent's machine; tools never return it.

## Tests

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

101 tests: sdk 23, agent 10, mcp 5, api 53 (on PGlite, with **real testnet events and transaction envelopes** as fixtures), web 10. CI runs all of it on every push.

**End-to-end on testnet (2026-11-09)**, real Chromium with a virtual WebAuthn authenticator,
local API and Postgres:

1. Created a passkey wallet in the web app (deployed through the FOSAY relayer).
2. Connected an agent with two passkey prompts; the API checked the on-chain mandate and issued the pairing code, then renewed the new wallet's storage TTLs.
3. The agent's **first** x402 payment was verified and settled by the official `@x402/stellar` facilitator at its default 50,000-stroop fee ceiling.
4. The agent asked for an over-budget payment through the relayer; the owner's review screen decoded `approvals.execute(#7) → transfer 3 … to GBP5…` from the transaction itself; the passkey approved it and it was paid.
5. The dashboard showed the balance, "4 left of 5", and the activity attributed as *paid by agent* / *you approved*.

Bugs that run found and fixed: in-memory passkey sessions (now IndexedDB), cold storage
TTLs on new wallets (keeper now runs right after pairing), duplicate keys in the keeper's
`getLedgerEntries` call, and a shared relayer/keeper account colliding on sequence numbers.

## Security notes

- The agent signs only `USDC.transfer(wallet, …)`, `approvals.propose(wallet, …)` and `approvals.cancel(id)` for its own wallet; anything else is refused before signing.
- Owner approvals are bound on-chain to `execute(id)` (contract invariant I6), and the web app refuses to approve if the decoded transfer differs from the request.
- The relayer pays only for FOSAY-shaped calls (approvals, mandate policy, USDC transfers **from FOSAY wallets**, wallet admin on canonical OZ wallets, OZ wallet deployment); it rejects source-account auth and any auth for its own account.
- Push subscriptions and pairing are unauthenticated in v1 (testnet). Not audited. smart-account-kit is also unaudited (per its README).

## Known gaps

- MPP (`@stellar/mpp` 0.7.1 signs as a G-account and needs `@stellar/stellar-sdk` ^15).
- Hosted Built-on-Stellar facilitator + real testnet USDC not yet exercised (the e2e used the same facilitator code locally with a test token).
- `stellar contract bindings typescript` is deprecated in Stellar CLI 30; regenerate with the JS SDK CLI later.

## License

Apache-2.0
