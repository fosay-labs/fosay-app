# Local setup

Run the API and the owner app on your machine against Stellar testnet.

## Requirements

| Tool | Version |
|---|---|
| Node.js | 22.12 or later |
| pnpm | 10 (`corepack enable`) |
| Postgres | 16 (only for the API; tests use in-process PGlite) |

```bash
git clone https://github.com/fosay-labs/fosay-app && cd fosay-app
pnpm install
cp .env.example .env
```

## Secrets for the API

```bash
pnpm --filter @fosay/api secrets
```

This creates two testnet accounts (relayer and keeper), funds them with Friendbot and creates
push notification (VAPID) keys. It prints four lines, which go into `.env`:

```text
RELAYER_SECRET=S…
KEEPER_SECRET=S…
VAPID_PUBLIC_KEY=B…
VAPID_PRIVATE_KEY=…
```

The relayer and keeper must be different accounts. They submit transactions at the same time,
and one account's sequence numbers would collide. The API refuses to start if they're equal.

## Run

```bash
pnpm --filter @fosay/api dev     # http://localhost:8787, runs database migrations on start
```

```bash
pnpm --filter @fosay/web dev     # http://localhost:3000
```

```bash
pnpm --filter @fosay/docs dev    # this site, http://localhost:5173/fosay-app/docs/
```

## Environment variables

Contract IDs and network settings default to the FOSAY testnet deployment, so a local setup only
needs the API values.

### API (`apps/api`)

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `DATABASE_URL` | yes | — | Postgres URL; add `?sslmode=require` for hosted databases |
| `INDEXER_START_LEDGER` | yes | — | First ledger to index on an empty database (testnet: `5643488`) |
| `PORT` | | `8787` | HTTP port |
| `CORS_ORIGIN` | | `http://localhost:3000` | Allowed web origin(s), comma-separated, or `*` |
| `RELAYER_SECRET` | for relaying | — | Pays fees for wallet calls; `/relay` is off without it |
| `RELAYER_MAX_FEE_STROOPS` | | `2000000` | Relayer refuses anything costlier |
| `KEEPER_SECRET` | strongly advised | — | Pays TTL renewals; without it agent payments get expensive |
| `KEEPER_INTERVAL_SECONDS` | | `3600` | Keeper pass interval |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | for push | — | Web Push keys |
| `INDEXER_POLL_SECONDS` | | `5` | Event polling interval |
| `TRUSTED_PROXY_HOPS` | | `1` | Which `X-Forwarded-For` entry is the client, counted from the right |
| `CLIENT_IP_HEADER` | | — | Use this header for the client IP instead (for example `cf-connecting-ip`) |

### Web (`apps/web`, build time)

| Variable | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8787` | FOSAY API |
| `NEXT_PUBLIC_RELAYER_URL` | `<API>/relay` | Relayer |
| `NEXT_PUBLIC_BASE_PATH` | empty | Sub-path the site is served under (`/fosay-app` on Pages) |
| `FOSAY_STATIC_EXPORT` | unset | `1` builds a static site into `apps/web/out` |
| `NEXT_PUBLIC_STELLAR_*`, `NEXT_PUBLIC_FOSAY_*`, `NEXT_PUBLIC_OZ_*`, `NEXT_PUBLIC_USDC_SAC_ID` | testnet | Network and contract IDs |

`NEXT_PUBLIC_*` values are compiled into the site. Never put a secret in them.

### Shared network settings

`STELLAR_NETWORK`, `STELLAR_RPC_URL`, `STELLAR_NETWORK_PASSPHRASE`, `FOSAY_MANDATE_POLICY_ID`,
`FOSAY_APPROVALS_ID`, `USDC_SAC_ID`, `OZ_ACCOUNT_WASM_HASH`, `OZ_WEBAUTHN_VERIFIER_ID`,
`OZ_ED25519_VERIFIER_ID`. See `.env.example` for the testnet values.

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

102 tests. API tests run on PGlite with real testnet events and transaction envelopes as fixtures.
