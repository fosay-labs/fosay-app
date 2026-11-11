# FOSAY: Stellar Wave submission

> Program: [Stellar Wave on Drips](https://www.drips.network/wave/stellar) · Organization: [`fosay-labs`](https://github.com/fosay-labs)
> Repositories: [`fosay-contract`](https://github.com/fosay-labs/fosay-contract) (Soroban contracts) and [`fosay-app`](https://github.com/fosay-labs/fosay-app) (SDK, agent runtime, MCP server, API, owner app, docs)

## Project description

FOSAY (Funds Only Spent After Yes) is a Stellar smart wallet you share with your AI agent.
AI agents can now pay for things themselves: CoinDesk reported about 75 million x402
agent-payment transactions in the 30 days to 15 July 2026, and Stellar is one of the networks
x402 settles on. People don't trust agents with money: in an August 2026 NMI survey of 1,000
US adults, 69% said they don't trust AI to process payments securely. FOSAY puts the limit in
the wallet contract. The agent gets its own key on an OpenZeppelin smart account under a rule
guarded by `fosay-mandate-policy`, a Soroban policy that enforces a per-payment cap, a rolling
budget, a recipient allowlist and a pause switch. Payments inside the mandate, including x402
pay-per-request calls, go through on their own for about 19,000 stroops in fees. Anything
bigger becomes a request in `fosay-approvals`, and the owner approves it on their phone with a
passkey, after the app decodes exactly what the passkey will sign. FOSAY ships the contracts, a
TypeScript SDK with an x402 payer for smart accounts, a CLI and MCP server for agents, an
indexer/relayer API and a passkey web app. All of it runs on testnet today, and it has not
been audited.

**Short version (one sentence):** FOSAY is a Stellar smart wallet for AI agents: a Soroban
policy enforces the budget you set, x402 payments inside it go through automatically, and
anything bigger waits for your passkey.

## How the two repositories relate

- **`fosay-contract`** holds the two Soroban contracts, both used with the canonical
  OpenZeppelin `stellar-accounts` v0.8.0 smart account (FOSAY ships no account contract):
  - `fosay-mandate-policy`: the policy on the agent's `:pay` rule;
  - `fosay-approvals`: the over-limit request queue.

  It also holds the spec with security invariants I1–I7, 48 tests that sign with real Ed25519
  keys against the canonical account WASM, and an idempotent deploy script. Contract IDs are
  published in `deployments/testnet.json`.

- **`fosay-app`** consumes those IDs (`deployments/testnet.json`, generated bindings in
  `packages/sdk`) and builds everything around them:
  - the SDK (contract clients, x402 payer scheme, agent signing allowlist, error decoding);
  - the agent runtime, CLI and MCP server;
  - the API (event indexer, push notifications, fee-paying relayer guarded to FOSAY calls,
    and the TTL keeper that keeps agent payments under the x402 fee ceiling);
  - the Next.js owner app, exported to GitHub Pages;
  - this documentation site.

  It has 102 tests.

- **The interface between them:**
  - the contracts' public functions and events;
  - one design constraint: `enforce` emits no events (I7) so payments pass x402 facilitator
    checks.

  A contract change ships as a new deployment (I4). The app then updates its IDs and
  bindings.

## Links

| #   | What                                                                 | Link                                                                                                        |
| --- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Live app (testnet)                                                   | https://fosay-labs.github.io/fosay-app/                                                                     |
| 2   | Documentation site                                                   | https://fosay-labs.github.io/fosay-app/docs/                                                                |
| 3   | Demo video (3 min, real testnet run)                                 | https://github.com/fosay-labs/fosay-app/blob/main/media/fosay-demo.mp4                                      |
| 4   | Contracts repository                                                 | https://github.com/fosay-labs/fosay-contract                                                                |
| 5   | App, SDK, MCP and API repository                                     | https://github.com/fosay-labs/fosay-app                                                                     |
| 6   | `fosay-mandate-policy` on Stellar Expert                             | https://stellar.expert/explorer/testnet/contract/CABMDEJEXOIBR4F6TDIYQ7CA5GFENXAYDRA4WH7V4QR7PAMTFIEQWWQ5   |
| 7   | `fosay-approvals` on Stellar Expert                                  | https://stellar.expert/explorer/testnet/contract/CAZDF7XQSKLZK5JG4FPCG6ZSGK3C4ZGNBKHU3VYDPQSZWLX2HPRXJCIU   |
| 8   | Agent's x402 payment, settled by the official facilitator (demo run) | https://stellar.expert/explorer/testnet/tx/df378df9ccb46b06b58fd475a00751560315dad57d2340606049e2b94632cc1e |
| 9   | Owner's passkey approval of request #9 (demo run)                    | https://stellar.expert/explorer/testnet/tx/ef9f1a6494246bca00f5e416c2c860aa017fcb6ec34690178d0a9ebcb95d560c |
| 10  | Release `v0.1.0-testnet` (contracts, with deployed IDs)              | https://github.com/fosay-labs/fosay-contract/releases/tag/v0.1.0-testnet                                    |

More: [app release](https://github.com/fosay-labs/fosay-app/releases/tag/v0.1.0-testnet) ·
[Wave issues (contracts)](https://github.com/fosay-labs/fosay-contract/issues?q=is%3Aissue+is%3Aopen+label%3Awave) ·
[Wave issues (app)](https://github.com/fosay-labs/fosay-app/issues?q=is%3Aissue+is%3Aopen+label%3Awave) ·
[security model](https://fosay-labs.github.io/fosay-app/docs/protocol/security.html) ·
[measured costs](https://fosay-labs.github.io/fosay-app/docs/protocol/costs.html)

## Planned issues

There are 42 open issues labelled `wave`, all with acceptance-criteria checklists and a
complexity tier.

| Repository     | Issues | Trivial | Medium | High | Good first issue |
| -------------- | ------ | ------- | ------ | ---- | ---------------- |
| fosay-contract | 16     | 6       | 7      | 3    | 6                |
| fosay-app      | 26     | 7       | 14     | 5    | 7                |

Issues that change auth, signing or fund flows carry `security-sensitive`. These need an
agreed approach on the issue before any code.

### fosay-contract

- **Correctness and security testing:**
  - a property test of `enforce` against a reference model (#4);
  - property tests for `propose` input validation (#10);
  - mixed WebAuthn/Ed25519 signer tests for invariant I3 (#14);
  - budget-metering tests that keep payments under the x402 fee ceiling (#5);
  - deploy plus a full smoke test on a local Stellar network in CI (#17).
- **Cost:** bound request TTL by the request's expiry, which cuts `propose` from about
  410,000 stroops (#3).
- **Supply chain and verifiability:**
  - cargo-audit and cargo-deny (#6);
  - wasm hashes as CI artifacts (#7);
  - OpenSSF Scorecard and CodeQL (#13);
  - a CI check that SECURITY.md's test references exist (#12);
  - rebuilding at the recorded commit and matching the deployed WASM hash (#18).
- **Evolution:** event schema versioning (#16); a mainnet deploy dry run (#11).
- **Docs:** error code reference (#8); decision records for event-free `enforce` and the
  fixed budget ring (#9); rustdoc with `missing_docs` (#15).

### fosay-app

- **Security:**
  - authenticate push subscriptions with a passkey challenge (#2);
  - verify the agent key against the on-chain rule at pairing (#3);
  - a Content-Security-Policy for the static app (#17);
  - persistent rate limits (#15);
  - a backup passkey on the owner rule (#21);
  - reconnecting a wallet when the third-party smart-account indexer is unreachable (#27).
- **Payments:** MPP support from the smart account (#4); the hosted x402 facilitator with
  real testnet USDC (#5).
- **Reliability and operations:**
  - a browser e2e suite with a virtual WebAuthn authenticator (#7);
  - keeper and indexer tests on a local network in CI (#24);
  - indexer backfill beyond RPC retention (#8);
  - Prometheus metrics (#9);
  - relayer and keeper low-balance warnings (#10);
  - a Dockerfile and compose file (#16).
- **Agent developer experience:**
  - publish `@fosay/sdk` and `@fosay/agent` to npm (#20);
  - a `fosay_budget` MCP tool (#12);
  - Streamable HTTP transport for the MCP server (#25);
  - move off the deprecated bindings generator (#6);
  - a non-MCP integration guide (#14).
- **Owner app:**
  - approval expiry as time remaining (#11);
  - an accessibility pass (#13);
  - mandate document and spending history per agent (#22);
  - CSV export (#23).
- **Docs:** sequence diagrams (#18); an OpenAPI description of the API (#19); a
  troubleshooting page (#26).

## Reviewer checklist

| Item                                                                                | Status                                                                                                                      |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Hosted under an organization                                                        | ✅ `fosay-labs`                                                                                                             |
| Permissive license                                                                  | ✅ Apache-2.0, both repositories                                                                                            |
| CI green                                                                            | ✅ contracts: fmt, clippy `-D warnings`, 48 tests, wasm build, fixture hash checks · app: lint, typecheck, 102 tests, build |
| Deployed contracts                                                                  | ✅ testnet, IDs above, release `v0.1.0-testnet`                                                                             |
| Working end-to-end product                                                          | ✅ testnet run in a real browser (demo video), including the production hosting layout                                      |
| README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, issue and PR templates, CODEOWNERS | ✅ both repositories                                                                                                        |
| Threat model mapped to tests                                                        | ✅ `SECURITY.md` in both repositories                                                                                       |
| Documentation site                                                                  | ✅ `apps/docs`, deployed with the app                                                                                       |
| Branch protection, topics, private vulnerability reporting                          | ⏳ `scripts/apply-repo-settings.sh` (needs an org admin)                                                                    |
| Audit                                                                               | ❌ not audited; testnet only                                                                                                |

## Honest limits

- Testnet only and unaudited. Mainnet waits for an external audit.
- Push subscriptions and pairing aren't authenticated yet (#2, #3).
- The x402 payment in the demo used the official `@x402/stellar` facilitator code run locally
  with a test token. The hosted facilitator with Circle testnet USDC is #5.
- Stellar testnet is reset periodically. After a reset the contracts are redeployed with the
  idempotent deploy script and the IDs here change.

## Sources

- CoinDesk, "Ripple joins card giants backing x402 as 75 million payments move just $24 million", 15 July 2026.
- NMI, "Consumers want AI to help them shop, not control their spending", August 2026 (1,000 US adults).
