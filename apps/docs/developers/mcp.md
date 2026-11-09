# MCP server

`@fosay/mcp` exposes the agent's FOSAY wallet to any MCP client over stdio. It reads the same
configuration as the CLI (key file, pairing, `FOSAY_API_URL`), so pair with `fosay-agent`
first.

```json
{
  "mcpServers": {
    "fosay": {
      "command": "node",
      "args": ["/absolute/path/to/fosay-app/packages/mcp/bin/fosay-mcp.mjs"],
      "env": { "FOSAY_API_URL": "https://<the FOSAY API host>" }
    }
  }
}
```

Amounts going in are USDC decimal strings (`"1.5"`). Amounts coming out include both USDC and
base units. No tool returns key material.

## Tools

### `fosay_wallet_status`

No input. Returns the wallet address, rule ids, balance, budget, remaining budget, cap,
period, pause state and pending request count. Use it before planning paid work.

### `fosay_fetch_paid`

| Input | Type | Notes |
|---|---|---|
| `url` | URL | Required |
| `method` | `GET` · `POST` · `PUT` · `PATCH` · `DELETE` | Default `GET` |
| `body` | string, ≤ 100,000 chars | Sent as-is |
| `maxAmount` | USDC string | Never pay more than this in one payment |

Fetches the URL. On `HTTP 402` it pays within the mandate and returns the response with the
settlement transaction. If the price doesn't fit, it opens an approval request and returns its id.

### `fosay_request_approval`

| Input | Type | Notes |
|---|---|---|
| `to` | Stellar address (`G…` or `C…`) | Recipient |
| `amount` | USDC string | |
| `memo` | 1–140 chars | Shown to the owner |
| `ttlHours` | integer 1–168 | Default 24 |

Opens a request for a payment the agent can't make alone. Returns the request id and transaction hash.

### `fosay_approval_status`

Input `requestId` (decimal string). Returns `Pending`, `Executed` (approved and paid),
`Cancelled` (rejected or withdrawn) or `Expired`, with the amount, recipient and memo.

### `fosay_cancel_request`

Input `requestId`. Withdraws one of this wallet's pending requests.

## Errors

Tool errors carry the FOSAY error code (for example `BudgetExceeded`, `Paused`,
`TooManyPending`) and a readable message, so the model can decide what to do next.
