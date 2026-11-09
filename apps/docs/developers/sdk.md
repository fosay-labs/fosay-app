# SDK and agent runtime

Two packages in the `fosay-app` workspace:

- `@fosay/sdk`: contract clients, mandate hashing, error decoding, agent signing and the
  x402 payer scheme. Runs in Node and the browser.
- `@fosay/agent`: Node runtime for agents. Key file, pairing, `FosayAgent` and `fosayFetch`.

They aren't published to npm yet. Use them from the workspace, or depend on the repository
path. `@stellar/stellar-sdk` is pinned to `16.4.1`.

## Read a wallet's mandate

```ts
import { FosayClient, TESTNET, fromBaseUnits } from '@fosay/sdk';

const client = new FosayClient(TESTNET); // uses TESTNET.rpcUrl
const wallet = 'CD54YFMYTNYHCJ3QQZTZ4VAV3WQRZFBOLCZVLORO52DWNRIGRIPQZ6NP';

const m = await client.getMandate(wallet, 1);
// { token, budget: 50000000n, periodLedgers: 17280, maxPerTx: 20000000n,
//   recipients: [], mandateHash: '…64 hex…', paused: false }
const left = await client.remainingBudget(wallet, 1);
console.log(`${fromBaseUnits(left)} of ${fromBaseUnits(m.budget)} USDC left`); // "4 of 5 USDC left"
```

Other reads: `getIntent(id)`, `pendingCount(wallet)`, `tokenBalance(wallet)`.
`toBaseUnits('2.5')` returns `25000000n` (7 decimals).

## Pay or ask from an agent

```ts
import { fosayFetch, loadAgentRuntime } from '@fosay/agent';

// Reads the key file, the pairing and FOSAY_API_URL from the environment
const { agent } = loadAgentRuntime(process.env);

const r = await fosayFetch(agent, 'https://paid-api.example/report', {}, {
  maxAmount: 10_000_000n,            // never pay more than 1 USDC per call
  memo: 'Quarterly report for the user',
});

if (r.kind === 'response') {
  // paid === true when an x402 payment was made; transaction is its hash
  console.log(r.response.status, r.paid, r.transaction);
} else {
  // r.kind === 'approval_requested': over the cap, the budget or maxAmount
  console.log(`asked the owner: request #${r.intentId} for ${r.amount} to ${r.payTo} (${r.reason})`);
}
```

`fosayFetch` wraps `@x402/fetch` with FOSAY's payer scheme. Before signing, the scheme checks
the mandate (paused, cap, recipients, remaining budget). If the payment wouldn't pass, it opens
an approval request instead of failing.

## FosayAgent

```ts
import { FosayAgent } from '@fosay/agent';
import { TESTNET } from '@fosay/sdk';

const agent = new FosayAgent({
  cfg: TESTNET,
  identity: { wallet, payRule: 1, askRule: 2 },
  secret: process.env.FOSAY_AGENT_SECRET!,
  relayerUrl: 'https://<api>/relay',
});

await agent.status();
// { wallet, payRule, askRule, agentPublicKey, balance, budget, remaining,
//   maxPerTx, periodLedgers, paused, pendingRequests }

const { intentId, hash } = await agent.propose({
  to: 'GBP5XZH6CZ7DGFGI3AXMCITT5AIRYQGS6SQXE7OKEV3YNPO77XTZXZ77',
  amount: 30_000_000n,
  memo: 'buy the full dataset (3 USDC)',
  ttlLedgers: 17_280,                 // default; at most 120,960 on testnet
});

await agent.requestStatus(intentId);  // the on-chain Intent
await agent.cancel(intentId);         // withdraw
```

## Agent signing allowlist

`AgentSigner` signs Soroban authorization entries with the agent's key. `classifyAgentEntry`
maps each entry to a rule, and anything not on the list is refused before signing:

| Call | Rule |
|---|---|
| `USDC.transfer(wallet, to, amount)` | `payRule` |
| `approvals.propose(wallet, …)` | `askRule` |
| `approvals.cancel(id)` | `askRule` |

## Errors

```ts
import { decodeError } from '@fosay/sdk';

try {
  await agent.propose({ to, amount: 0n, memo: 'x' });
} catch (e) {
  const err = decodeError(e); // FosayError
  err.code;    // 'InvalidAmount'
  err.message; // readable explanation; secrets are redacted
}
```

`decodeSimulationError(sim)` extracts contract error codes from a failed simulation's
diagnostics, which is the only place a policy failure inside `__check_auth` is visible.
Codes: [Error codes](../contracts/errors).

## Mandate documents

```ts
import { mandateHash, toHex, type MandateDoc } from '@fosay/sdk';

const doc: MandateDoc = {
  v: 1,
  agentName: 'research bot',
  purpose: 'Paid data APIs',
  token: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
  budget: '50000000',
  periodLedgers: 17280,
  maxPerTx: '20000000',
  recipients: [],
  validUntilLedger: null,
  createdAt: '2026-11-09T19:03:00.000Z',
};
toHex(mandateHash(doc)); // sha256 over canonical JSON (sorted keys), stored on-chain
```

## Pairing codes

`encodePairing` / `decodePairing` convert
`{ v: 1, network, wallet, payRule, askRule, agentPublicKey }` to and from the string the web
app shows.
