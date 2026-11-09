# Security model

## Who holds what

| Party | Holds | Can do | Can't do |
|---|---|---|---|
| Owner | passkey, in the authenticator | everything, through rule 0 | — |
| Agent | Ed25519 key in `~/.fosay/agent.key` (mode 0600) | send USDC within the mandate; propose and cancel requests | change rules, unpause, edit the mandate, exceed limits |
| FOSAY API | relayer and keeper keys (fee XLM only) | pay fees, index, notify, renew TTL | move wallet funds: neither key is a wallet signer |
| Contracts | the rules | enforce them | act on their own authority (no admin, no upgrade) |

## Contract invariants

| # | Invariant |
|---|---|
| I1 | The agent key only appears in rules scoped to the token and `fosay-approvals`. It can't administer the wallet or its own mandate. |
| I2 | No FOSAY contract moves funds on its own authority. Every transfer is authorized by the wallet for that call. |
| I3 | `enforce` requires a non-empty signer set on the rule, all of whom authenticated. A misconfigured rule with no signers can never spend. |
| I4 | No admin, no upgrade, no owner-settable config. New versions are new deployments. |
| I5 | The agent's secret key never reaches FOSAY's app or servers. Only its public key is registered. |
| I6 | An owner approval is bound to `execute(id)` and can't be replayed as a bare transfer. |
| I7 | `enforce` emits no events, so agent payments stay compatible with x402 facilitators. |

Each invariant is mapped to the test that checks it in
[fosay-contract SECURITY.md](https://github.com/fosay-labs/fosay-contract/blob/main/SECURITY.md#threat-model).

## Off-chain controls

- **Agent signing allowlist.** The SDK signs only `USDC.transfer(wallet, …)`,
  `approvals.propose(wallet, …)` and `approvals.cancel(id)` for the agent's own wallet. It
  refuses anything else before signing, so a compromised prompt or dependency can't get the
  key to sign a different call.
- **Decoded approvals.** The owner app decodes what the passkey will sign from the simulated
  transaction and blocks approval on any mismatch with the request.
- **Relayer guard.** The relayer pays fees only for FOSAY calls, USDC transfers from FOSAY
  wallets, wallet admin on canonical OZ wallets and OZ wallet deployment. It rejects
  source-account authorization and any authorization for its own account, caps fees, and rate-limits
  per IP and per wallet.
- **Secrets.** Secrets are redacted from errors. MCP tools never return the key. The relayer
  and keeper must use different accounts.

## Known gaps (testnet v1)

- Push subscriptions and pairing claims are not authenticated yet. Anyone can subscribe to a
  wallet's request notifications. Both are tracked as issues.
- Rate limits are in memory, per API instance.
- GitHub Pages can't send security headers such as `X-Frame-Options`.
- Nothing has been audited, including smart-account-kit.

Report vulnerabilities privately through GitHub security advisories on
[fosay-contract](https://github.com/fosay-labs/fosay-contract/security/advisories/new) or
[fosay-app](https://github.com/fosay-labs/fosay-app/security/advisories/new).
