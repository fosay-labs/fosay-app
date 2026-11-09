# HTTP API

`@fosay/api` serves the owner app and agents. It indexes FOSAY events, sends push
notifications, pays fees through the relayer, and keeps storage TTLs alive. All bodies are
JSON. Amounts are base-unit decimal strings (USDC has 7 decimals). Validation errors return
`400 {"error":"bad_request","issues":[{"path":"…","message":"…"}]}`.

The API holds no key that can move wallet funds. Treat everything it returns as a convenience
view: the owner app re-reads anything it asks a passkey to sign from the contract.

## Health

`GET /health`

```json
{ "ok": true, "network": "testnet", "indexedLedger": 5712344 }
```

`503 {"ok":false}` when the database doesn't answer.

## Wallets

`GET /wallets/:address`

```json
{
  "address": "CD54YFMYTNYHCJ3QQZTZ4VAV3WQRZFBOLCZVLORO52DWNRIGRIPQZ6NP",
  "agents": [
    { "name": "e2e research bot", "payRule": 1, "askRule": 2,
      "agentPublicKey": "9f1c…64 hex", "mandateHash": "a3b0…64 hex", "revoked": false }
  ],
  "mandates": [
    { "ruleId": 1, "token": "CBIELTK6…DAMA", "budget": "50000000", "periodLedgers": 17280,
      "maxPerTx": "20000000", "recipients": [], "mandateHash": "a3b0…", "paused": false,
      "uninstalled": false }
  ],
  "pendingRequests": 0
}
```

`GET /wallets/:address/activity?limit=50` (1–200)

```json
{
  "address": "CD54…Z6NP",
  "items": [
    { "kind": "payment", "ledger": 5712301, "at": "2026-11-09T19:08:02.000Z",
      "txHash": "5b4b31ab…", "to": "GBP5…XZ77", "amount": "30000000", "via": "approval" },
    { "kind": "request", "ledger": 5712280, "txHash": "1ab859ba…", "id": "8",
      "to": "GBP5…XZ77", "amount": "30000000",
      "memo": "e2e: buy the full dataset (3 FUSD)", "status": "Executed" },
    { "kind": "payment", "ledger": 5712270, "at": "2026-11-09T19:06:40.000Z",
      "txHash": "688f23ca…", "to": "GBP5…XZ77", "amount": "10000000", "via": "agent" }
  ]
}
```

`via` is `agent` (under the agent's `:pay` rule), `owner`, `approval` (an executed request) or `unknown`.

## Requests

`GET /intents?account=<wallet>&status=Pending&limit=50` returns `{"items":[Intent…]}`.

`GET /intents/:id`

```json
{
  "id": "8", "account": "CD54…Z6NP", "token": "CBIELTK6…DAMA", "to": "GBP5…XZ77",
  "amount": "30000000", "memo": "e2e: buy the full dataset (3 FUSD)",
  "mandateHash": "a3b0…", "status": "Pending", "expiresLedger": 5715560,
  "proposedLedger": 5712280, "proposedTx": "1ab859ba…",
  "closedLedger": null, "closedTx": null,
  "mandateDoc": { "v": 1, "agentName": "e2e research bot", "purpose": "Paid APIs for the e2e test", "…": "…" }
}
```

## Mandate documents and pairing

`POST /mandate-docs` with a [mandate document](./sdk#mandate-documents) returns
`{"hash":"<64 hex>"}`. `GET /mandate-docs/:hash` returns `{"hash","doc"}`.

`POST /pairing`

```json
{ "wallet": "CD54…Z6NP", "payRule": 1, "askRule": 2,
  "agentPublicKey": "<64 hex>", "name": "e2e research bot", "mandateHash": "<64 hex>" }
```

Checks on-chain that rule `payRule` has a mandate with this hash, records the agent, renews the
wallet's TTLs, and returns `{"code":"eyJ2Ijox…"}`. Errors: `409 mandate_mismatch`,
`409 mandate_not_found`.

## Push notifications

| Request | Body | Response |
|---|---|---|
| `GET /push/vapid-public-key` | — | `{"publicKey":"B…"}` or `503 push_disabled` |
| `POST /push/subscribe` | `{"wallet":"C…","subscription":{"endpoint":"https://…","keys":{"p256dh":"…","auth":"…"}}}` | `{"ok":true}` |
| `POST /push/unsubscribe` | `{"endpoint":"https://…"}` | `{"ok":true}` |

A notification looks like
`{"title":"Your agent asks for 3 USDC","body":"<memo>","data":{"intentId":"8","url":"approvals/view/?id=8"}}`.
The URL is relative to the app's scope.

## Relayer

`POST /relay` implements smart-account-kit's relayer protocol:

```json
{ "func": "<base64 HostFunction XDR>", "auth": ["<base64 SorobanAuthorizationEntry XDR>"] }
```

```json
{ "success": true, "data": { "hash": "1f4dd92f…", "status": "SUCCESS" } }
```

The relayer builds the transaction with its own account as source, simulates it, and submits it
if the guard and the fee cap allow it. Failures return
`{"success":false,"errorCode":"…","message":"…"}`:

| `errorCode` | Status | Meaning |
|---|---|---|
| `BAD_REQUEST` | 400 | Body isn't `{func, auth}` |
| `UNSUPPORTED` | 400 | Signed-transaction fee bumps (`{xdr}`) aren't supported |
| `FORBIDDEN` | 403 | Not a FOSAY call, source-account auth, or auth for the relayer's own account |
| `RATE_LIMITED` | 429 | 30 per minute per IP, 20 per minute per wallet |
| `FEE_TOO_HIGH` | 400 | Over `RELAYER_MAX_FEE_STROOPS` |
| `SIMULATION_FAILED` | 400 | The message includes the decoded contract error |
| `SUBMIT_FAILED` | 502 | The network rejected the transaction |
