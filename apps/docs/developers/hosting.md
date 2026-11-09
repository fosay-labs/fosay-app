# Hosting

The testnet deployment runs on free tiers.

| Piece | Host | Why |
|---|---|---|
| Owner app (`apps/web`) and these docs | GitHub Pages, static | The app runs entirely in the browser; always on, free |
| API (`apps/api`) | Render free web service (`render.yaml`) | Long-running indexer, keeper and relayer |
| Postgres | Supabase free | No compute-hour cap; Render's free database is deleted after 30 days |
| Keep-alive | GitHub Actions, every 10 minutes | Render stops free services after 15 idle minutes |

```
owner's browser ──▶ GitHub Pages (static app)
       │  reads + simulates ──────────────────────────▶ Stellar RPC
       └─ pairing, push, relayed calls ──▶ Render: FOSAY API ──▶ Stellar RPC
                                              │
                                              └──▶ Supabase Postgres
agent ──propose/cancel──▶ FOSAY API relayer      agent ──x402──▶ facilitator ──▶ Stellar
```

The full guide, with every setup step, the free-tier limits and the pitfalls (passkeys are
bound to the domain, the API URL is fixed at build time, client IPs behind proxies), is
[`docs/HOSTING.md`](https://github.com/fosay-labs/fosay-app/blob/main/docs/HOSTING.md).

## Production layout, locally

```bash
FOSAY_STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/fosay-app NEXT_PUBLIC_API_URL=http://127.0.0.1:8787 \
  pnpm --filter @fosay/web build
```

Serve `apps/web/out` under `/fosay-app/` on a different origin than the API and set the API's
`CORS_ORIGIN` to that origin. This layout passed the full testnet walkthrough on 9 November 2026.
