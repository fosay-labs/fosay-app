import { parseArgs } from 'node:util';

import { decodeError, fromBaseUnits, toBaseUnits } from '@fosay/sdk';

import { fosayFetch } from './fetch';
import { generateAgentKey, keyInfo, loadAgentSecret } from './keys';
import { decodePairing, loadAgentRuntime, savePairing } from './runtime';

const HELP = `fosay-agent — FOSAY agent wallet CLI

  keygen [--file <path>] [--force]   create the agent's Ed25519 key (default ~/.fosay/agent.key)
  pubkey                             print the agent public key to give the wallet owner
  pair <code>                        save the pairing code from the FOSAY web app
  status                             wallet balance, budget left, pending requests
  fetch <url> [--max <usdc>] [--method <m>] [--body <s>]
                                     fetch a URL, paying x402 within the mandate or asking the owner
  request-status <id>                status of an approval request

Config comes from env (.env.example); the agent key never leaves this machine.`;

const env = process.env as Record<string, string | undefined>;
const usdc = (n: bigint) => `${fromBaseUnits(n)} USDC`;

async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case 'keygen': {
      const { values } = parseArgs({
        args: rest,
        options: { file: { type: 'string' }, force: { type: 'boolean' } },
      });
      const file = values.file ?? env['FOSAY_AGENT_KEY_FILE'] ?? '~/.fosay/agent.key';
      const info = generateAgentKey(file, { force: values.force ?? false });
      console.info(`created ${file} (mode 600)\nagent public key: ${info.publicKeyHex}\n`);
      console.info(
        'Paste the public key into "Connect agent" in the FOSAY web app, then run `fosay-agent pair <code>`.',
      );
      return;
    }
    case 'pubkey': {
      console.info(keyInfo(loadAgentSecret(env)).publicKeyHex);
      return;
    }
    case 'pair': {
      const code = rest[0];
      if (!code) throw new Error('usage: fosay-agent pair <code>');
      const pairing = decodePairing(code);
      const file = savePairing(env, pairing, loadAgentSecret(env));
      console.info(
        `paired with wallet ${pairing.wallet} (pay rule ${pairing.payRule}, ask rule ${pairing.askRule}); saved ${file}`,
      );
      return;
    }
    case 'status': {
      const s = await loadAgentRuntime(env).agent.status();
      console.info(
        [
          `wallet        ${s.wallet}`,
          `balance       ${usdc(s.balance)}`,
          `budget left   ${usdc(s.remaining)} of ${usdc(s.budget)} per ${s.periodLedgers} ledgers`,
          `max per tx    ${usdc(s.maxPerTx)}`,
          `paused        ${s.paused ? 'yes' : 'no'}`,
          `pending asks  ${s.pendingRequests}`,
        ].join('\n'),
      );
      return;
    }
    case 'fetch': {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: { max: { type: 'string' }, method: { type: 'string' }, body: { type: 'string' } },
      });
      const url = positionals[0];
      if (!url) throw new Error('usage: fosay-agent fetch <url> [--max <usdc>]');
      const { agent } = loadAgentRuntime(env);
      const r = await fosayFetch(
        agent,
        url,
        { method: values.method ?? 'GET', ...(values.body ? { body: values.body } : {}) },
        values.max ? { maxAmount: toBaseUnits(values.max) } : {},
      );
      if (r.kind === 'approval_requested') {
        console.info(
          `needs approval (${r.reason}): asked the owner for ${usdc(r.amount)} to ${r.payTo}; request #${r.intentId}`,
        );
        return;
      }
      console.info(`HTTP ${r.response.status}${r.paid ? ` (paid, tx ${r.transaction})` : ''}`);
      console.info(await r.response.text());
      return;
    }
    case 'request-status': {
      const id = rest[0];
      if (!id || !/^\d+$/.test(id)) throw new Error('usage: fosay-agent request-status <id>');
      const i = await loadAgentRuntime(env).agent.requestStatus(BigInt(id));
      console.info(
        `#${i.id} ${i.status}: ${usdc(i.amount)} to ${i.to} — "${i.memo}" (expires ledger ${i.expiresLedger})`,
      );
      return;
    }
    default:
      console.info(HELP);
  }
}

main(process.argv.slice(2)).catch((e: unknown) => {
  const fe = decodeError(e);
  console.error(`error (${fe.code}): ${fe.message}`);
  process.exitCode = 1;
});
