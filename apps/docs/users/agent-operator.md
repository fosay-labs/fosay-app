# Guide for agent operators

You run an AI agent and want it to pay for things from a FOSAY wallet. The agent can use the
`fosay-agent` command line, the MCP server (Claude Desktop, Claude Code or any MCP client),
or the SDK from code.

## Requirements

- Node.js 22.12 or later and pnpm 10
- A FOSAY wallet owner who will connect your agent (often you, on your phone)

```bash
git clone https://github.com/fosay-labs/fosay-app && cd fosay-app
pnpm install
```

## 1. Create the agent's key

```bash
node packages/agent/bin/fosay-agent.mjs keygen
```

This writes an Ed25519 key to `~/.fosay/agent.key` (mode 0600, in a 0700 directory) and
prints the **public key**. Give the public key to the wallet owner. The secret never leaves
this machine, and FOSAY never asks for it.

## 2. Pair with the wallet

The owner connects your agent in the app and gets a pairing code. Save it:

```bash
node packages/agent/bin/fosay-agent.mjs pair <code>
```

The code holds the wallet address, the two rule ids and the agent public key. It's stored in
`~/.fosay/wallet.json`. Pairing fails if the code was made for a different key.

## 3. Point it at the FOSAY API

The agent submits approval requests through the FOSAY relayer, which pays the fee:

```bash
export FOSAY_API_URL=https://<the FOSAY API host>
```

For local development that's `http://localhost:8787`.

## 4. Check it works

```bash
node packages/agent/bin/fosay-agent.mjs status
```

```text
wallet        CD54YFMYTNYHCJ3QQZTZ4VAV3WQRZFBOLCZVLORO52DWNRIGRIPQZ6NP
balance       96 USDC
budget left   4 USDC of 5 USDC per 17280 ledgers
max per tx    2 USDC
paused        no
pending asks  0
```

## 5. Pay for things

```bash
node packages/agent/bin/fosay-agent.mjs fetch https://paid-api.example/report --max 1
```

- If the server answers `402 Payment Required` (x402, `exact` scheme on Stellar) and the price
  fits the mandate, the agent pays and prints the response with the settlement transaction.
- If the price is over the cap, the budget or `--max`, nothing is paid. The agent opens an
  approval request and prints its id. The owner gets a notification.

```bash
node packages/agent/bin/fosay-agent.mjs request-status 8
```

## Use it from an MCP client

Add this to your MCP client's server list (Claude Desktop `claude_desktop_config.json`, or
Claude Code `.mcp.json`):

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

The agent then has five tools: `fosay_wallet_status`, `fosay_fetch_paid`,
`fosay_request_approval`, `fosay_approval_status` and `fosay_cancel_request`. See
[MCP server](../developers/mcp) for their inputs and outputs. No tool returns the key.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `FOSAY_API_URL` | none | FOSAY API base URL; the relayer is at `<url>/relay` |
| `FOSAY_RELAYER_URL` | `<FOSAY_API_URL>/relay` | Override the relayer URL |
| `FOSAY_AGENT_KEY_FILE` | `~/.fosay/agent.key` | Key file location |
| `FOSAY_AGENT_SECRET` | none | Key as an environment variable instead of a file (for containers) |
| `FOSAY_WALLET_FILE` | `~/.fosay/wallet.json` | Where `pair` saves the pairing |
| `FOSAY_WALLET`, `FOSAY_PAY_RULE_ID`, `FOSAY_ASK_RULE_ID` | none | Set the pairing directly instead of a file |
| `STELLAR_NETWORK`, `STELLAR_RPC_URL`, contract IDs | FOSAY testnet deployment | Only needed for your own deployment |

## Keep the key safe

- A key file readable by group or others is refused.
- If the key leaks, tell the owner to **Revoke** the agent. That removes the key from the
  wallet. Then run `keygen --force` and pair again.
- A leaked key can only spend within the mandate. Keep budgets small.
