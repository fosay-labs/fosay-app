# Security policy

## Status

- **Not audited.** Runs against Stellar **testnet** only. Do not use with real funds.
- smart-account-kit, which the web app uses for passkeys, is also unaudited (per its README).

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's private reporting:
[Security → Report a vulnerability](https://github.com/fosay-labs/fosay-app/security/advisories/new).
Include the component, the steps or a failing test, and the impact.

| Step                   | Target                                              |
| ---------------------- | --------------------------------------------------- |
| Acknowledge            | 3 days                                              |
| Triage and severity    | 7 days                                              |
| Fix or mitigation plan | agreed with the reporter                            |
| Disclosure             | after the fix ships, credited unless you prefer not |

## Scope

In scope: everything in this repo (`packages/sdk`, `packages/agent`, `packages/mcp`,
`apps/api`, `apps/web`) and the hosted testnet deployment described in
[`docs/HOSTING.md`](docs/HOSTING.md). Contract bugs go to
[`fosay-contract`](https://github.com/fosay-labs/fosay-contract/security/advisories/new).

Out of scope: denial of service against the free-tier testnet host, testnet resets, missing
headers on GitHub Pages (known, see HOSTING.md), and findings that need the owner's device or
the agent's key file.

## Trust boundaries

| Component                                        | Holds                                               | Trusted for                         | Not trusted for                                                                        |
| ------------------------------------------------ | --------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------- |
| Owner's browser (`apps/web`)                     | passkey (in the authenticator)                      | deciding what to approve            | nothing from the API is shown as "what you sign"; that is decoded from the transaction |
| Agent machine (`packages/agent`, `packages/mcp`) | agent Ed25519 key (`~/.fosay/agent.key`, 0600)      | spending within its mandate         | anything else; the contracts enforce the mandate                                       |
| API (`apps/api`)                                 | relayer and keeper keys (testnet XLM for fees only) | indexing, push, paying fees         | moving wallet funds: it holds no key that can                                          |
| Contracts                                        | the rules                                           | enforcing the mandate and approvals | see fosay-contract's SECURITY.md                                                       |

## Controls → tests

| Threat                                                                 | Control                                                                                                                                                                                                               | Tests                                                                                                                                  |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| A compromised dependency or prompt makes the agent sign something else | The agent signer accepts only `USDC.transfer(wallet, …)`, `approvals.propose(wallet, …)` and `approvals.cancel(id)` for its own wallet, and refuses before signing                                                    | `sdk auth.test.ts`: "maps the three agent actions to the right rule", "refuses everything else"                                        |
| Agent key leaks through errors or tools                                | Secrets redacted from errors; MCP tools never return the key; key file is 0600 in a 0700 dir and world-readable files are refused                                                                                     | `agent keys.test.ts` (all three), `sdk auth.test.ts`: "rejects bad secrets without echoing them", `mcp tools.test.ts`: "never the key" |
| Owner is tricked into approving a different payment                    | The review screen decodes the auth entry from the simulated transaction, requires root `approvals.execute(id)` with exactly one `transfer`, and blocks approval if amount, recipient or token differ from the request | `web decode-auth.test.ts` (all four)                                                                                                   |
| Relayer is used as a free fee payer for arbitrary calls                | Guard allows only FOSAY-shaped calls; rejects source-account auth and any auth for the relayer's own account; fee cap; per-IP and per-wallet rate limits; client IP from the trusted end of `X-Forwarded-For`         | `api guard.test.ts` (allow and deny tables), `relayer.test.ts`                                                                         |
| Relayer and keeper collide on sequence numbers                         | Startup refuses identical relayer and keeper secrets                                                                                                                                                                  | `api app.test.ts`                                                                                                                      |
| x402 payment rejected by the facilitator, or made outside the mandate  | Payer scheme builds the facilitator's payload shape under the `:pay` rule and checks the mandate first (asks instead of paying over limits)                                                                           | `sdk x402-scheme.test.ts` (all three); verified and settled by the official `@x402/stellar` facilitator in the README's testnet run    |

## Known gaps (testnet v1)

- Push subscriptions and pairing claims are not authenticated (tracked as issues).
- Rate limits are in memory, per instance.
- GitHub Pages can't send security headers such as `X-Frame-Options`.
