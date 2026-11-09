#!/usr/bin/env bash
# Creates the labels and the planned Wave issues for fosay-labs/fosay-app (idempotent:
# existing labels are updated, issues whose title already exists are skipped).
#   gh auth login && bash scripts/seed-issues.sh
set -euo pipefail
REPO=fosay-labs/fosay-app
# REST only (no GraphQL), so it also runs where GraphQL is unavailable
existing=$(gh api --paginate "repos/$REPO/issues?state=all&per_page=100" --jq ".[].title")
label() { # name color description: create, or update if it exists
  gh api "repos/$REPO/labels" -f name="$1" -f color="$2" -f description="$3" >/dev/null 2>&1 ||
    gh api -X PATCH "repos/$REPO/labels/${1//\//%2F}" -f color="$2" -f description="$3" >/dev/null
}
issue() { # title comma-separated-labels body-file
  if grep -Fxq -- "$1" <<<"$existing"; then echo "skip: $1"; return; fi
  local args=(); IFS=, read -ra ls <<<"$2"; for l in "${ls[@]}"; do args+=(-f "labels[]=$l"); done
  gh api "repos/$REPO/issues" -f title="$1" -F body=@"$3" "${args[@]}" --jq '"#\(.number) \(.title)"'
}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

label "wave" 7d00ff "Scoped task for Stellar Wave contributors"
label "tier/trivial" c2e0c6 "Wave complexity: trivial (hours)"
label "tier/medium" fbca04 "Wave complexity: medium (a few days)"
label "tier/high" d93f0b "Wave complexity: high (a week or more)"
label "security-sensitive" b60205 "Touches auth, signing, funds or invariants: agree the approach first"
label "testing" 0e8a16 "Tests and test infrastructure"
label "ci" 5319e7 "CI and automation"
label "area/sdk" 1d76db "sdk"
label "area/agent" 1d76db "agent"
label "area/mcp" 1d76db "mcp"
label "area/api" 1d76db "api"
label "area/web" 1d76db "web"
label "area/deploy" 1d76db "deploy"
label "area/ci" 1d76db "ci"
label "area/docs" 1d76db "docs"

cat > "$tmp/1.md" <<'BODY'
## Summary

`POST /push/subscribe` accepts any wallet address, so anyone can subscribe to another wallet's approval requests and read the amounts and memos. Require proof that the subscriber controls the wallet.

> **Security-sensitive.** Post your approach on this issue and get a maintainer's OK before writing code.

## Context

- `apps/api/src/routes/push.ts:25` stores `{wallet, subscription}` without checks.
- The owner's passkey is rule 0 on the OZ smart account. A signed auth entry for a no-op call, or a WebAuthn assertion over a server nonce verified against the wallet's passkey signer, can prove control.
- Web client: `apps/web/src/lib/push.ts` (`enablePush`).

## Acceptance criteria

- [ ] `GET /push/challenge?wallet=` returns a single-use nonce that expires after 5 minutes.
- [ ] `POST /push/subscribe` requires a passkey signature over the nonce that verifies against a signer of the wallet's rule 0 (read on-chain). Otherwise 401.
- [ ] `/push/unsubscribe` requires the same proof, or the subscription's own endpoint secret.
- [ ] Tests cover a valid proof, a wrong wallet, a replayed nonce and an expired nonce.
- [ ] SECURITY.md's “Known gaps” is updated.

## Out of scope

- Changing the contracts.

## Tech stack

Hono, zod, drizzle, @stellar/stellar-sdk, smart-account-kit (web), Web Push

## Verify before opening the PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Paste the real output in the PR. Read `CONTRIBUTING.md` first.

## Complexity

`tier/high`. Claim it by commenting “I'll take this”. A claim with no activity for 7 days goes back to the pool.
BODY
issue "feat(api): require a wallet-signed challenge to subscribe to push notifications" "wave,tier/high,area/api,enhancement,security-sensitive" "$tmp/1.md"

cat > "$tmp/2.md" <<'BODY'
## Summary

`POST /pairing` checks the mandate hash on chain but stores `agentPublicKey` and the agent name as sent. Check that the `:pay` and `:ask` rules' signer is that key before issuing a pairing code.

> **Security-sensitive.** Post your approach on this issue and get a maintainer's OK before writing code.

## Context

- `apps/api/src/routes/pairing.ts:64` (mandate hash check, then insert).
- Rule signers can be read with the account's `get_context_rule` (see smart-account-kit `rules.get`).

## Acceptance criteria

- [ ] Pairing fails with 409 `agent_key_mismatch` unless both rules contain exactly one External Ed25519 signer equal to `agentPublicKey`.
- [ ] Re-pairing the same rule cannot overwrite a different agent's record.
- [ ] Tests on PGlite with a fake contract client cover match, mismatch and an `:ask` rule from another agent.

## Out of scope

- Web app changes beyond showing the new error.

## Tech stack

Hono, zod, @fosay/sdk contract clients

## Verify before opening the PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Paste the real output in the PR. Read `CONTRIBUTING.md` first.

## Complexity

`tier/medium`. Claim it by commenting “I'll take this”. A claim with no activity for 7 days goes back to the pool.
BODY
issue "fix(api): verify the agent key against the on-chain rule when pairing" "wave,tier/medium,area/api,bug,security-sensitive" "$tmp/2.md"

cat > "$tmp/3.md" <<'BODY'
## Summary

FOSAY pays x402 today. Add MPP support so agents can pay MPP-protected endpoints from the same mandate, with the same pay-or-ask fallback.

> **Security-sensitive.** Post your approach on this issue and get a maintainer's OK before writing code.

## Context

- x402 payer: `packages/sdk/src/x402/scheme.ts`; pay-or-ask: `packages/agent/src/fetch.ts`.
- `@stellar/mpp` 0.7.1 signs as a G-account and depends on `@stellar/stellar-sdk` ^15, while this workspace is pinned to 16.4.1 (one copy). Check for a newer release, or implement the client scheme against the spec.
- The mandate policy only allows `USDC.transfer(wallet, …)`, which must be the only operation.

## Acceptance criteria

- [ ] An `MppPayer` produces an MPP credential whose transfer is authorized by the agent's `:pay` rule (C-account), with the same allowlist checks as `auth.ts`.
- [ ] `fosayFetch` handles both x402 and MPP challenges and falls back to an approval request over the mandate.
- [ ] Unit tests with recorded challenges, plus a testnet run documented in the PR.
- [ ] Still exactly one `@stellar/stellar-sdk` version in the lockfile.

## Out of scope

- Changing the mandate policy.

## Tech stack

TypeScript, @stellar/stellar-sdk 16.4.1, @stellar/mpp, smart-account-kit

## Verify before opening the PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Paste the real output in the PR. Read `CONTRIBUTING.md` first.

## Complexity

`tier/high`. Claim it by commenting “I'll take this”. A claim with no activity for 7 days goes back to the pool.
BODY
issue "feat(sdk): pay MPP (machine payments protocol) requests from the smart account" "wave,tier/high,area/sdk,enhancement,security-sensitive" "$tmp/3.md"

cat > "$tmp/4.md" <<'BODY'
## Summary

The testnet run used the official facilitator code locally with a test token. Run the same flow against the hosted Built-on-Stellar facilitator with Circle testnet USDC and record the result.

## Context

- Scheme: `packages/sdk/src/x402/scheme.ts`. Agent: `packages/agent/src/fetch.ts`.
- README → Tests → testnet walkthrough step 3.

## Acceptance criteria

- [ ] A script under `packages/agent/scripts/` pays a 402 endpoint through the hosted facilitator with a paired testnet wallet holding testnet USDC.
- [ ] The PR includes the settlement transaction hash and the fee charged.
- [ ] Any incompatibility is filed as an issue with the facilitator's response.

## Out of scope

- Mainnet.

## Tech stack

TypeScript, @x402/stellar, @fosay/agent, testnet USDC

## Verify before opening the PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Paste the real output in the PR. Read `CONTRIBUTING.md` first.

## Complexity

`tier/medium`. Claim it by commenting “I'll take this”. A claim with no activity for 7 days goes back to the pool.
BODY
issue "test(agent): pay through the hosted x402 facilitator with testnet USDC" "wave,tier/medium,area/agent,testing" "$tmp/4.md"

cat > "$tmp/5.md" <<'BODY'
## Summary

`scripts/gen-bindings.sh` uses `stellar contract bindings typescript`, which is deprecated in Stellar CLI 30, and patches the output with `sed`. Move to the supported generator and drop the patches.

## Context

- `scripts/gen-bindings.sh:18` and the `sed` lines after it (they mark `ClientOptions`, `MethodOptions` and `Result` as type imports for tsx/SWC).
- Output: `packages/sdk/src/generated/`.

## Acceptance criteria

- [ ] Bindings are generated with the currently supported tool for both contracts, from the wasm or the deployed IDs.
- [ ] No hand-patching. If a fix is still needed, it's a documented, minimal post-process with a test.
- [ ] `pnpm typecheck` and every test pass, and the generated API stays compatible with `clients.ts`.

## Out of scope

- Changing contract interfaces.

## Tech stack

Stellar CLI 30, @stellar/stellar-sdk contract bindings generator, bash

## Verify before opening the PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Paste the real output in the PR. Read `CONTRIBUTING.md` first.

## Complexity

`tier/medium`. Claim it by commenting “I'll take this”. A claim with no activity for 7 days goes back to the pool.
BODY
issue "chore(sdk): generate contract bindings without the deprecated CLI command" "wave,tier/medium,area/sdk,enhancement" "$tmp/5.md"

cat > "$tmp/6.md" <<'BODY'
## Summary

Turn the manual testnet walkthrough (README → Tests) into a Playwright suite that runs nightly in CI: create wallet, connect agent, agent pays, agent asks, owner approves, dashboard.

## Context

- Playwright's CDP session supports `WebAuthn.addVirtualAuthenticator` (protocol `ctap2`, resident key, user verification).
- Static export: `FOSAY_STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/fosay-app pnpm --filter @fosay/web build` (`docs/HOSTING.md`).
- The suite needs funded testnet accounts, created per run with Friendbot (see `apps/api/scripts/gen-secrets.mjs`).

## Acceptance criteria

- [ ] `pnpm --filter @fosay/web e2e` runs the full flow headless against a local API, a Postgres service and testnet.
- [ ] A nightly workflow (and `workflow_dispatch`) runs it and uploads screenshots and the trace on failure.
- [ ] Selectors use roles and labels, not CSS classes.
- [ ] Running twice in parallel doesn't collide (fresh keys per run).

## Out of scope

- Running it on every PR (testnet is too slow and flaky for that).

## Tech stack

Playwright, Chrome DevTools Protocol WebAuthn, Next.js static export, Postgres service container, Stellar testnet

## Verify before opening the PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Paste the real output in the PR. Read `CONTRIBUTING.md` first.

## Complexity

`tier/high`. Claim it by commenting “I'll take this”. A claim with no activity for 7 days goes back to the pool.
BODY
issue "test(web): browser end-to-end suite with a virtual WebAuthn authenticator" "wave,tier/high,area/web,testing" "$tmp/6.md"

cat > "$tmp/7.md" <<'BODY'
## Summary

If the API is down longer than RPC event retention (about 7 days on testnet), the indexer skips ahead and loses events (`poller.ts` logs a warning). Add a backfill path so the activity feed and approval states stay complete.

## Context

- `apps/api/src/indexer/poller.ts:45-48` clamps the start ledger to `latest - 120_000`.
- Contract state is still on chain. Pending intents can be rebuilt with `get_intent` and `pending_count`, and payments from history.

## Acceptance criteria

- [ ] When the cursor is older than retention, the API reconciles intents by reading `get_intent` for ids up to the contract's next id, and marks gaps in payment history explicitly.
- [ ] A design note in the PR compares the options (Horizon effects, a Galexie data lake, contract reads) and picks one.
- [ ] Tests on PGlite simulate a long outage.

## Out of scope

- A full historical index of all Stellar events.

## Tech stack

Hono, drizzle, Stellar RPC, Horizon or Galexie / history archives

## Verify before opening the PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Paste the real output in the PR. Read `CONTRIBUTING.md` first.

## Complexity

`tier/high`. Claim it by commenting “I'll take this”. A claim with no activity for 7 days goes back to the pool.
BODY
issue "feat(api): backfill the indexer when it falls behind RPC event retention" "wave,tier/high,area/api,enhancement" "$tmp/7.md"

cat > "$tmp/8.md" <<'BODY'
## Summary

Expose `/metrics` with indexer lag, relayer submissions and failures by error code, keeper extensions and fees, and push deliveries, so a host can alert on them.

## Context

- Logging is structured JSON (`apps/api/src/log.ts`). Relayer: `relayer/route.ts`. Keeper: `keeper/index.ts`. Indexer: `indexer/poller.ts`.

## Acceptance criteria

- [ ] `GET /metrics` serves Prometheus text format, optionally protected by a `METRICS_TOKEN` bearer token.
- [ ] Metrics: `fosay_indexer_ledger`, `fosay_indexer_lag_ledgers`, `fosay_relay_total{result}`, `fosay_relay_fee_stroops`, `fosay_keeper_extended_total`, `fosay_push_sent_total{result}`.
- [ ] Tests assert the counters move.

## Out of scope

- Dashboards.

## Tech stack

Hono, prom-client (or a hand-written text exposition)

## Verify before opening the PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Paste the real output in the PR. Read `CONTRIBUTING.md` first.

## Complexity

`tier/medium`. Claim it by commenting “I'll take this”. A claim with no activity for 7 days goes back to the pool.
BODY
issue "feat(api): Prometheus metrics endpoint" "wave,tier/medium,area/api,enhancement" "$tmp/8.md"

cat > "$tmp/9.md" <<'BODY'
## Summary

The relayer and keeper pay fees from testnet XLM. When one runs dry, wallet creation, approvals and TTL renewals fail with unclear errors. Check balances and log a warning, and report them in `/health`.

## Context

- Keys: `RELAYER_SECRET`, `KEEPER_SECRET` (`apps/api/src/env.ts`). Health: `apps/api/src/app.ts` (`/health`).

## Acceptance criteria

- [ ] Every keeper pass reads both balances. Below `LOW_BALANCE_XLM` (default 50) it logs `warn` with the account and balance.
- [ ] `/health` includes `relayerXlm` and `keeperXlm` (numbers, no secrets).
- [ ] A test covers the warning.

## Out of scope

- Auto top-up.

## Tech stack

Hono, @stellar/stellar-sdk

## Verify before opening the PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Paste the real output in the PR. Read `CONTRIBUTING.md` first.

## Complexity

`tier/trivial`. Claim it by commenting “I'll take this”. A claim with no activity for 7 days goes back to the pool.
BODY
issue "feat(api): warn when the relayer or keeper balance runs low" "wave,tier/trivial,area/api,enhancement,good first issue" "$tmp/9.md"

cat > "$tmp/10.md" <<'BODY'
## Summary

The review screen says “Expires at ledger 5712345”, which means nothing to an owner. Show “expires in about 3 h 20 min” from the current ledger and a 5-second ledger time.

## Context

- `apps/web/src/app/approvals/view/page.tsx:124`. `LEDGERS_PER_DAY` is in `apps/web/src/lib/config.ts`. Current ledger: `getReader()` / RPC `getLatestLedger`.

## Acceptance criteria

- [ ] Shows time remaining (or “expired”), with the ledger number still visible in smaller text.
- [ ] A helper in `lib/format.ts` with unit tests (minutes, hours, days, expired).

## Out of scope

- Changing the expiry rules.

## Tech stack

Next.js 16, React 19

## Verify before opening the PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Paste the real output in the PR. Read `CONTRIBUTING.md` first.

## Complexity

`tier/trivial`. Claim it by commenting “I'll take this”. A claim with no activity for 7 days goes back to the pool.
BODY
issue "feat(web): show approval expiry as time remaining" "wave,tier/trivial,area/web,enhancement,good first issue" "$tmp/10.md"

cat > "$tmp/11.md" <<'BODY'
## Summary

Agents ask “how much can I still spend?” before planning paid calls. Add a tool that returns the remaining budget, the per-payment cap, the window length and an estimate of when budget frees up.

## Context

- Tools: `packages/mcp/src/tools.ts` (five tools). Data: `FosayClient.getMandate` and `remainingBudget` in `packages/sdk/src/clients.ts`.

## Acceptance criteria

- [ ] `fosay_budget` returns `{remaining, budget, maxPerTx, periodHours}` in USDC and base units.
- [ ] Never returns key material (same check as the existing status test).
- [ ] Test in `packages/mcp/src/__tests__/tools.test.ts`.

## Out of scope

- Changing existing tool names.

## Tech stack

TypeScript, @modelcontextprotocol/sdk, zod

## Verify before opening the PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Paste the real output in the PR. Read `CONTRIBUTING.md` first.

## Complexity

`tier/trivial`. Claim it by commenting “I'll take this”. A claim with no activity for 7 days goes back to the pool.
BODY
issue "feat(mcp): add a fosay_budget tool" "wave,tier/trivial,area/mcp,enhancement,good first issue" "$tmp/11.md"

cat > "$tmp/12.md" <<'BODY'
## Summary

Check and fix keyboard navigation, focus, labels, contrast and screen-reader text across onboarding, connect agent, dashboard and review screens. Approving payments has to work without a mouse.

## Context

- Pages: `apps/web/src/app/**/page.tsx`. Styles: `apps/web/src/app/globals.css`.

## Acceptance criteria

- [ ] axe reports no serious or critical violations on each page (with a script in the PR).
- [ ] Every form control has a label. Busy states are announced (`aria-live`). Focus moves to the result after approve or reject.
- [ ] Contrast meets WCAG AA in the dark theme.

## Out of scope

- A redesign.

## Tech stack

Next.js 16, React 19, axe-core / @axe-core/playwright

## Verify before opening the PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Paste the real output in the PR. Read `CONTRIBUTING.md` first.

## Complexity

`tier/medium`. Claim it by commenting “I'll take this”. A claim with no activity for 7 days goes back to the pool.
BODY
issue "feat(web): accessibility pass on the owner app" "wave,tier/medium,area/web,enhancement,accessibility" "$tmp/12.md"

cat > "$tmp/13.md" <<'BODY'
## Summary

Write a short guide for using `fosayFetch` directly from a Node agent (for example, a tool function in any agent framework), with a runnable example.

## Context

- `packages/agent/src/fetch.ts` (`fosayFetch`) and `runtime.ts`. CLI usage in the README.

## Acceptance criteria

- [ ] `docs/AGENT_INTEGRATION.md` covers pairing, `fosayFetch`, handling `approval_requested` results and polling status.
- [ ] `examples/node-agent/` runs against testnet with a paired key.
- [ ] Linked from the README.

## Out of scope

- Framework-specific packages.

## Tech stack

TypeScript, @fosay/agent

## Verify before opening the PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Paste the real output in the PR. Read `CONTRIBUTING.md` first.

## Complexity

`tier/trivial`. Claim it by commenting “I'll take this”. A claim with no activity for 7 days goes back to the pool.
BODY
issue "docs: integrate FOSAY into an agent without MCP" "wave,tier/trivial,area/docs,documentation,good first issue" "$tmp/13.md"

cat > "$tmp/14.md" <<'BODY'
## Summary

Relayer rate limits are in memory, so they reset when the instance restarts and don't work across instances. Move them to Postgres with a fixed-window counter.

## Context

- `apps/api/src/relayer/ratelimit.ts` (`RateLimiter`), used in `relayer/route.ts`.

## Acceptance criteria

- [ ] A `rate_limits` table (key, window_start, count) with an upsert-increment, plus a migration.
- [ ] Same limits and behaviour as today, covered by the existing relayer tests on PGlite.
- [ ] Old windows are pruned by the keeper pass.

## Out of scope

- Redis.

## Tech stack

Hono, drizzle, Postgres

## Verify before opening the PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Paste the real output in the PR. Read `CONTRIBUTING.md` first.

## Complexity

`tier/medium`. Claim it by commenting “I'll take this”. A claim with no activity for 7 days goes back to the pool.
BODY
issue "feat(api): keep relayer rate limits across restarts and instances" "wave,tier/medium,area/api,enhancement" "$tmp/14.md"

cat > "$tmp/15.md" <<'BODY'
## Summary

Make the API portable beyond Render: a multi-stage Dockerfile that builds only `@fosay/api` and its workspace deps, and a `docker-compose.yml` with Postgres for local runs.

## Context

- The Render build and start commands in `render.yaml` are the reference.
- The API runs TypeScript through `tsx` and needs `apps/api/src/db/migrations` at runtime.

## Acceptance criteria

- [ ] `docker build -f apps/api/Dockerfile .` produces an image under 300 MB that runs as non-root.
- [ ] `docker compose up` starts Postgres and the API, and `/health` answers.
- [ ] Documented in `docs/HOSTING.md`.

## Out of scope

- Kubernetes manifests.

## Tech stack

Docker, pnpm workspaces, Postgres 16

## Verify before opening the PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Paste the real output in the PR. Read `CONTRIBUTING.md` first.

## Complexity

`tier/medium`. Claim it by commenting “I'll take this”. A claim with no activity for 7 days goes back to the pool.
BODY
issue "chore(api): Dockerfile and compose file for the API" "wave,tier/medium,area/deploy,enhancement" "$tmp/15.md"

cat > "$tmp/16.md" <<'BODY'
## Summary

GitHub Pages can't send response headers, so the static site ships without the headers `next start` sets. Add a CSP `<meta>` tag that allows only the app's own scripts, the API, Stellar RPC and the service worker.

> **Security-sensitive.** Post your approach on this issue and get a maintainer's OK before writing code.

## Context

- `apps/web/next.config.ts` (headers only outside static export). `docs/HOSTING.md` → “No response headers on Pages”.
- `frame-ancestors` can't be set by meta. Note that in the PR.

## Acceptance criteria

- [ ] A strict CSP meta tag (`default-src 'self'`, `connect-src` limited to the API and RPC origins from env) with no `unsafe-eval`.
- [ ] Passkey creation, signing, push and every page work with it (e2e walkthrough or a manual run with notes).
- [ ] HOSTING.md updated.

## Out of scope

- Moving off GitHub Pages.

## Tech stack

Next.js 16 static export, CSP

## Verify before opening the PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Paste the real output in the PR. Read `CONTRIBUTING.md` first.

## Complexity

`tier/medium`. Claim it by commenting “I'll take this”. A claim with no activity for 7 days goes back to the pool.
BODY
issue "feat(web): add a Content-Security-Policy to the static export" "wave,tier/medium,area/web,enhancement,security-sensitive" "$tmp/16.md"

cat > "$tmp/17.md" <<'BODY'
## Summary

The docs explain the three core flows in text and ASCII. Add sequence diagrams (owner, web app, API, wallet contract, policy, approvals, agent, facilitator) so a reviewer can see the whole flow at a glance.

## Context

- Pages: `apps/docs/guide/how-it-works.md`, `apps/docs/protocol/approvals.md`, `apps/docs/users/owner.md`.
- Flows are implemented in `apps/web/src/app/agents/new/page.tsx` (connect), `packages/agent/src/fetch.ts` (pay or ask) and `apps/web/src/app/approvals/view/page.tsx` (approve).

## Acceptance criteria

- [ ] Three diagrams: connect agent (2 passkey prompts and pairing), agent payment via x402, and request → push → approve.
- [ ] Diagrams render in light and dark mode and at phone width.
- [ ] Every arrow matches a real call in the code (name the function in the label).
- [ ] `pnpm --filter @fosay/docs build` passes.

## Out of scope

- Rewriting page text.

## Tech stack

VitePress 1.6, vitepress-plugin-mermaid (or inline SVG)

## Verify before opening the PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Paste the real output in the PR. Read `CONTRIBUTING.md` first.

## Complexity

`tier/trivial`. Claim it by commenting “I'll take this”. A claim with no activity for 7 days goes back to the pool.
BODY
issue "docs: sequence diagrams for connecting an agent, paying and approving" "wave,tier/trivial,area/docs,documentation,good first issue" "$tmp/17.md"

cat > "$tmp/18.md" <<'BODY'
## Summary

Generate an OpenAPI 3.1 document from the API's zod schemas, serve it at `/openapi.json`, and render it in the docs, so client authors get exact shapes.

## Context

- Schemas: `apps/api/src/routes/*.ts` (`pairingBody`, `mandateDocSchema`, `subscribeBody`, query schemas).
- Hand-written reference: `apps/docs/developers/api.md`.

## Acceptance criteria

- [ ] `GET /openapi.json` serves a valid OpenAPI 3.1 document covering every route, including `/relay` error codes.
- [ ] A test validates the document and checks that every registered route appears in it.
- [ ] The docs API page links to it (or embeds it), and the hand-written examples stay.
- [ ] No route behaviour changes.

## Out of scope

- Changing request or response shapes.

## Tech stack

Hono, zod 4, @hono/zod-openapi or zod-to-openapi, VitePress

## Verify before opening the PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Paste the real output in the PR. Read `CONTRIBUTING.md` first.

## Complexity

`tier/medium`. Claim it by commenting “I'll take this”. A claim with no activity for 7 days goes back to the pool.
BODY
issue "docs(api): publish an OpenAPI description of the HTTP API" "wave,tier/medium,area/api,documentation" "$tmp/18.md"

cat > "$tmp/19.md" <<'BODY'
## Summary

The SDK and agent runtime are only usable from the workspace, and they export TypeScript sources. Build them to ESM with type declarations and publish them with npm provenance, so agent developers can `npm install @fosay/agent`.

## Context

- `packages/sdk/package.json` exports `./src/index.ts` and `./src/x402/index.ts`. `packages/agent` depends on it through `workspace:*`.
- The web app consumes the SDK through `transpilePackages` (`apps/web/next.config.ts`), which must keep working.

## Acceptance criteria

- [ ] Both packages build to `dist/` (ESM + `.d.ts`) with `exports` maps; the workspace still uses sources in development.
- [ ] A release workflow publishes on a tag with `npm publish --provenance` (maintainers add the npm token).
- [ ] A smoke test installs the packed tarballs in a clean directory and runs a script that imports them.
- [ ] READMEs show `npm install` usage.

## Out of scope

- Publishing the API or web app.

## Tech stack

TypeScript, tsup or tsc, npm provenance, GitHub Actions

## Verify before opening the PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Paste the real output in the PR. Read `CONTRIBUTING.md` first.

## Complexity

`tier/medium`. Claim it by commenting “I'll take this”. A claim with no activity for 7 days goes back to the pool.
BODY
issue "chore(sdk): publish @fosay/sdk and @fosay/agent to npm" "wave,tier/medium,area/sdk,enhancement" "$tmp/19.md"

cat > "$tmp/20.md" <<'BODY'
## Summary

A wallet has one owner passkey. If it lives only on a lost security key, the wallet is gone. Let the owner add a second passkey (another device) as a signer on rule 0, list the owner's passkeys, and remove one.

> **Security-sensitive.** Post your approach on this issue and get a maintainer's OK before writing code.

## Context

- Owner rule 0 is `Default` with one WebAuthn External signer, created in onboarding (`apps/web/src/app/onboard/page.tsx`, `lib/kit.ts`).
- OZ accounts support multiple signers per rule. Check the account's add/remove signer entry points and how smart-account-kit exposes them.
- Owner guide: `apps/docs/users/owner.md` → “If you lose your passkey”.

## Acceptance criteria

- [ ] A **Passkeys** section lists the owner rule's signers, with names from the app's storage.
- [ ] **Add a backup passkey** registers a new credential (it can be on another device via cross-device WebAuthn) and adds it to rule 0, authorized by an existing passkey.
- [ ] Removing a passkey is refused when it is the last signer.
- [ ] Approvals work with either passkey (manual testnet run documented in the PR).
- [ ] The owner guide is updated.

## Out of scope

- Social recovery or guardians (separate design).

## Tech stack

Next.js 16, smart-account-kit 0.10, OpenZeppelin stellar-accounts 0.8 (rules, External signers, WebAuthn verifier)

## Verify before opening the PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Paste the real output in the PR. Read `CONTRIBUTING.md` first.

## Complexity

`tier/high`. Claim it by commenting “I'll take this”. A claim with no activity for 7 days goes back to the pool.
BODY
issue "feat(web): add a backup passkey to the wallet" "wave,tier/high,area/web,enhancement,security-sensitive" "$tmp/20.md"

cat > "$tmp/21.md" <<'BODY'
## Summary

The agent page shows limits and remaining budget, but not the mandate document the owner approved (purpose, recipients, expiry) or what the agent has spent. Add both.

## Context

- Agent page: `apps/web/src/app/agents/view/page.tsx`. Mandate documents: `GET /mandate-docs/:hash`. Activity: `GET /wallets/:address/activity` (`via: "agent"`).

## Acceptance criteria

- [ ] The page shows the mandate document fields and checks that its hash matches the on-chain `mandate_hash` (a mismatch shows a warning).
- [ ] A list of the agent's payments (amount, recipient, time, transaction link) with simple paging.
- [ ] Unit tests for the hash check and the filtering.

## Out of scope

- Charts (separate issue if wanted).

## Tech stack

Next.js 16, React 19, @fosay/sdk

## Verify before opening the PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Paste the real output in the PR. Read `CONTRIBUTING.md` first.

## Complexity

`tier/medium`. Claim it by commenting “I'll take this”. A claim with no activity for 7 days goes back to the pool.
BODY
issue "feat(web): show the agent's mandate document and spending history" "wave,tier/medium,area/web,enhancement" "$tmp/21.md"

cat > "$tmp/22.md" <<'BODY'
## Summary

Owners who track agent spending want a file. Add an **Export CSV** button to the dashboard activity list.

## Context

- Dashboard: `apps/web/src/app/dashboard/page.tsx`. Data: `api.activity(address, limit)` in `apps/web/src/lib/api.ts`. Amounts are base units, so format with `fromBaseUnits`.

## Acceptance criteria

- [ ] The CSV has the columns `date, kind, via, to, amount_usdc, status, request_id, tx_hash`.
- [ ] Values are escaped correctly (memo text can contain commas and quotes).
- [ ] A unit test covers the CSV builder.

## Out of scope

- Server-side exports.

## Tech stack

Next.js 16, React 19

## Verify before opening the PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Paste the real output in the PR. Read `CONTRIBUTING.md` first.

## Complexity

`tier/trivial`. Claim it by commenting “I'll take this”. A claim with no activity for 7 days goes back to the pool.
BODY
issue "feat(web): export wallet activity as CSV" "wave,tier/trivial,area/web,enhancement,good first issue" "$tmp/22.md"

cat > "$tmp/23.md" <<'BODY'
## Summary

Keeper and indexer tests use recorded fixtures. Add an integration job that starts a local Stellar network, deploys the FOSAY contracts and an OZ wallet, and checks that the keeper renews TTLs and the indexer records events.

## Context

- Keeper: `apps/api/src/keeper/`. Indexer: `apps/api/src/indexer/poller.ts`. Contract deploy script: `fosay-contract/scripts/deploy.mjs`.

## Acceptance criteria

- [ ] A workflow job runs `stellar/quickstart` (local, with Soroban RPC), deploys the contracts and a wallet with an agent rule, and runs the API against it.
- [ ] It asserts that after one keeper pass every footprint entry has more than 29 days of TTL, and that an agent payment and a `propose` show up via the API.
- [ ] The job is required on pull requests that touch `apps/api/**` and takes under 10 minutes.

## Out of scope

- Testnet in CI.

## Tech stack

stellar/quickstart Docker image, GitHub Actions service containers, PGlite or Postgres

## Verify before opening the PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Paste the real output in the PR. Read `CONTRIBUTING.md` first.

## Complexity

`tier/medium`. Claim it by commenting “I'll take this”. A claim with no activity for 7 days goes back to the pool.
BODY
issue "test(api): run the keeper and indexer against a local Stellar network in CI" "wave,tier/medium,area/api,testing" "$tmp/23.md"

cat > "$tmp/24.md" <<'BODY'
## Summary

The MCP server only speaks stdio, so it must run on the same machine as the client. Add an opt-in Streamable HTTP transport bound to localhost by default, with a bearer token, for agents running in containers.

> **Security-sensitive.** Post your approach on this issue and get a maintainer's OK before writing code.

## Context

- Server: `packages/mcp/src/index.ts` (stdio) and `tools.ts`. The tools must keep never returning key material.

## Acceptance criteria

- [ ] `fosay-mcp --http --port 7420` serves Streamable HTTP on 127.0.0.1 and refuses requests without `Authorization: Bearer $FOSAY_MCP_TOKEN`.
- [ ] Binding to a non-loopback address needs an explicit `--host` flag and prints a warning.
- [ ] Tests cover auth refusal and one tool call over HTTP.
- [ ] The docs MCP page documents it.

## Out of scope

- Remote multi-user hosting.

## Tech stack

@modelcontextprotocol/sdk 1.32, Node http

## Verify before opening the PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Paste the real output in the PR. Read `CONTRIBUTING.md` first.

## Complexity

`tier/medium`. Claim it by commenting “I'll take this”. A claim with no activity for 7 days goes back to the pool.
BODY
issue "feat(mcp): optional Streamable HTTP transport" "wave,tier/medium,area/mcp,enhancement,security-sensitive" "$tmp/24.md"

cat > "$tmp/25.md" <<'BODY'
## Summary

Collect the errors people actually hit and how to fix them: proxy and fetch errors, relayer refusals, `BudgetExceeded` vs `Paused`, archived entries, passkeys not offered on a new domain, push notifications on iPhone.

## Context

- Error codes: `apps/docs/contracts/errors.md`. Relayer errors: `apps/docs/developers/api.md`. Hosting pitfalls: `docs/HOSTING.md`.

## Acceptance criteria

- [ ] `apps/docs/guide/troubleshooting.md` with at least 10 entries, each with the exact message, the cause and the fix.
- [ ] Linked from the sidebar and from the owner and operator guides.

## Out of scope

- Code changes.

## Tech stack

VitePress 1.6

## Verify before opening the PR

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Paste the real output in the PR. Read `CONTRIBUTING.md` first.

## Complexity

`tier/trivial`. Claim it by commenting “I'll take this”. A claim with no activity for 7 days goes back to the pool.
BODY
issue "docs: troubleshooting page for common errors" "wave,tier/trivial,area/docs,documentation,good first issue" "$tmp/25.md"

