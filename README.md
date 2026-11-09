<p align="center"><img src=".github/assets/banner.svg" alt="FOSAY: Funds Only Spent After Yes" width="100%"></p>

# fosay-app

[![CI](https://github.com/fosay-labs/fosay-app/actions/workflows/ci.yml/badge.svg)](https://github.com/fosay-labs/fosay-app/actions/workflows/ci.yml)
[![Pages](https://github.com/fosay-labs/fosay-app/actions/workflows/pages.yml/badge.svg)](https://github.com/fosay-labs/fosay-app/actions/workflows/pages.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Network: Stellar testnet](https://img.shields.io/badge/network-Stellar%20testnet-7d00ff)](https://stellar.expert/explorer/testnet/contract/CAZDF7XQSKLZK5JG4FPCG6ZSGK3C4ZGNBKHU3VYDPQSZWLX2HPRXJCIU)
[![x402](https://img.shields.io/badge/payments-x402-black)](https://www.x402.org/)
[![Good first issues](https://img.shields.io/github/issues/fosay-labs/fosay-app/good%20first%20issue?label=good%20first%20issues&color=7057ff)](https://github.com/fosay-labs/fosay-app/labels/good%20first%20issue)

A Stellar wallet you share with your AI agent. The agent gets its own key with a budget you
set. Small payments, including x402 pay-per-request APIs, go through on their own. Bigger
ones become requests you approve on your phone with a passkey.

> **Status: testnet, not audited.** 102 tests pass. The full flow runs on testnet in a real
> browser: passkey wallet, connect agent, x402 payment settled by the official facilitator,
> over-budget request, passkey approval. Don't use it with real funds.

**Try it (testnet):** [fosay-labs.github.io/fosay-app](https://fosay-labs.github.io/fosay-app/) ·
**Contracts:** [`fosay-labs/fosay-contract`](https://github.com/fosay-labs/fosay-contract) ·
**Docs:** [fosay-labs.github.io/fosay-app/docs](https://fosay-labs.github.io/fosay-app/docs/) ·
**Hosting:** [`docs/HOSTING.md`](docs/HOSTING.md)

## How it fits together

```
 owner's phone ──passkey──▶ apps/web (static PWA) ──▶ apps/api ──relayer──▶ Stellar
                                 ▲                       │  ▲
                        Web Push │      indexer/keeper   │  │ { func, auth }
                                 └───────────────────────┘  │
 AI agent ──MCP──▶ packages/mcp ──▶ packages/agent ─────────┘ (propose / cancel)
                                        │
                                        └──x402 payment──▶ paid API ──▶ x402 facilitator ──▶ Stellar
```

| Workspace                                         | What it is                                                                                                                                                                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`packages/sdk`](packages/sdk) `@fosay/sdk`       | Contract clients, the **x402 payer scheme for smart accounts**, agent auth-entry signing with an allowlist, readable contract errors (`BudgetExceeded`, `PerTxLimitExceeded`, …), mandate hashing, pairing codes. Runs in Node and the browser. |
| [`packages/agent`](packages/agent) `@fosay/agent` | Agent runtime: key file (0600), pay-or-ask `fosayFetch` (pays HTTP 402 within the mandate, otherwise opens an approval request), `fosay-agent` CLI.                                                                                             |
| [`packages/mcp`](packages/mcp) `@fosay/mcp`       | MCP server (stdio) with five tools: `fosay_wallet_status`, `fosay_fetch_paid`, `fosay_request_approval`, `fosay_approval_status`, `fosay_cancel_request`.                                                                                       |
| [`apps/api`](apps/api) `@fosay/api`               | Hono + Postgres: event indexer, Web Push, fee-paying **relayer** (FOSAY-only guard, fee cap, rate limits), **TTL keeper**, read API, pairing.                                                                                                   |
| [`apps/web`](apps/web) `@fosay/web`               | Next.js PWA, exported as a static site: create a passkey wallet, connect an agent, dashboard, approvals with an **auth-entry decoder** that shows exactly what the passkey will sign, pause / edit / revoke.                                    |
| [`apps/docs`](apps/docs) `@fosay/docs`            | Documentation site (VitePress), served at `/fosay-app/docs/` next to the web app.                                                                                                                                                               |

## Testnet deployment

|                        |                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| Web app                | [fosay-labs.github.io/fosay-app](https://fosay-labs.github.io/fosay-app/) (GitHub Pages) |
| API                    | Render free web service + Supabase Postgres ([setup](docs/HOSTING.md))                   |
| `fosay-mandate-policy` | `CABMDEJEXOIBR4F6TDIYQ7CA5GFENXAYDRA4WH7V4QR7PAMTFIEQWWQ5`                               |
| `fosay-approvals`      | `CAZDF7XQSKLZK5JG4FPCG6ZSGK3C4ZGNBKHU3VYDPQSZWLX2HPRXJCIU`                               |
| OZ smart account WASM  | `c514d35ea67eaea9bfc1fb3327854c0c06111bc1ddebd4fe217c504c1004b9e1`                       |
| USDC (testnet SAC)     | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`                               |

Full record: [`deployments/testnet.json`](deployments/testnet.json). Every package defaults to
these values; see [`.env.example`](.env.example).

## Quick start (local)

Requirements: Node ≥ 22.12, pnpm 10, Postgres 16.

```bash
pnpm install
```

```bash
cp .env.example .env
```

```bash
pnpm --filter @fosay/api secrets    # creates + funds relayer and keeper testnet accounts, VAPID keys
```

Put the printed values and your `DATABASE_URL` in `.env`, then start each app in its own terminal:

```bash
pnpm --filter @fosay/api dev        # http://localhost:8787, migrates the database on start
```

```bash
pnpm --filter @fosay/web dev        # http://localhost:3000
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

102 tests: sdk 23, agent 10, mcp 5, api 54 (on PGlite, with real testnet events and transaction
envelopes as fixtures), web 10. CI runs all of them on every push and pull request.

**Testnet walkthrough (2026-11-09),** real Chromium with a virtual passkey, run twice: once
against the dev servers, once in the production layout (static site under `/fosay-app/` on one
origin, API built with the Render Blueprint's exact commands on another):

1. Create a passkey wallet (deployed through the FOSAY relayer).
2. Connect an agent with two passkey prompts. The API checks the on-chain mandate, issues the
   pairing code and renews the new wallet's storage TTLs.
3. The agent's first x402 payment is verified and settled by the official `@x402/stellar`
   facilitator within its default 50,000-stroop fee ceiling.
4. The agent asks for an over-budget payment. The review screen decodes
   `approvals.execute(#8) → transfer 3 … to GBP5…` from the transaction itself, and the passkey approves it.
5. The dashboard shows the balance, "4 left of 5", and activity attributed as _paid by agent_ / _you approved_.

## Security

- The agent signs only `USDC.transfer(wallet, …)`, `approvals.propose(wallet, …)` and
  `approvals.cancel(id)` for its own wallet. It refuses anything else before signing.
- Owner approvals are bound on-chain to `execute(id)`, and the web app refuses to approve if
  the decoded transfer differs from the request.
- The relayer pays fees only for FOSAY-shaped calls and holds no key that can move wallet funds.

Trust boundaries and the test behind each control: [`SECURITY.md`](SECURITY.md). Report
vulnerabilities privately through
[Security → Report a vulnerability](https://github.com/fosay-labs/fosay-app/security/advisories/new).

## Roadmap

Tracked as [issues](https://github.com/fosay-labs/fosay-app/issues). Issues labelled
[`wave`](https://github.com/fosay-labs/fosay-app/labels/wave) are scoped for Stellar Wave
contributors, with `tier/trivial`, `tier/medium` or `tier/high` complexity. The main open items:
authenticated push and pairing, MPP payments, the hosted facilitator with real testnet USDC,
a browser e2e suite in CI, and an indexer backfill.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md). Claim an issue by commenting on it, run the checks,
and open a PR against `main`.

## Maintainers

| Maintainer | Role                             | GitHub                                     |
| ---------- | -------------------------------- | ------------------------------------------ |
| ciscokwiz  | Lead maintainer (contracts, app) | [@ciscokwiz](https://github.com/ciscokwiz) |

Questions and ideas: [GitHub Discussions](https://github.com/fosay-labs/fosay-app/discussions).

## Contributors

[![Contributors](https://contrib.rocks/image?repo=fosay-labs/fosay-app)](https://github.com/fosay-labs/fosay-app/graphs/contributors)

## License

[Apache-2.0](LICENSE)
