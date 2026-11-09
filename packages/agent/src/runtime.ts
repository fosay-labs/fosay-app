import fs from 'node:fs';
import path from 'node:path';

import { FosayError, decodePairing, encodePairing, loadConfigFromEnv, pairingSchema } from '@fosay/sdk';
import type { AgentIdentity, FosayConfig, Pairing } from '@fosay/sdk';

import { FosayAgent } from './agent';
import { expandHome, keyInfo, loadAgentSecret } from './keys';

export { decodePairing, encodePairing, pairingSchema };
export type { Pairing };

type Env = Record<string, string | undefined>;

export function walletFile(env: Env): string {
  return expandHome(env['FOSAY_WALLET_FILE'] ?? '~/.fosay/wallet.json');
}

/** Saves a pairing after checking it was made for this agent's key. */
export function savePairing(env: Env, p: Pairing, secret: string): string {
  if (keyInfo(secret).publicKeyHex !== p.agentPublicKey) {
    throw new FosayError('INVALID_INPUT', 'pairing code is for a different agent key');
  }
  const file = walletFile(env);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${JSON.stringify(p, null, 2)}\n`, { mode: 0o600 });
  return file;
}

/** Wallet + rules from env (`FOSAY_WALLET`, `FOSAY_PAY_RULE_ID`, `FOSAY_ASK_RULE_ID`) or the pairing file. */
export function loadIdentity(env: Env): AgentIdentity {
  if (env['FOSAY_WALLET']) {
    const payRule = Number(env['FOSAY_PAY_RULE_ID']);
    const askRule = Number(env['FOSAY_ASK_RULE_ID']);
    if (!Number.isInteger(payRule) || !Number.isInteger(askRule)) {
      throw new FosayError('INVALID_INPUT', 'FOSAY_PAY_RULE_ID and FOSAY_ASK_RULE_ID must be integers');
    }
    return { wallet: env['FOSAY_WALLET'], payRule, askRule };
  }
  const file = walletFile(env);
  if (!fs.existsSync(file)) {
    throw new FosayError(
      'INVALID_INPUT',
      'agent is not paired: run `fosay-agent pair <code>` or set FOSAY_WALLET',
    );
  }
  const p = pairingSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
  return { wallet: p.wallet, payRule: p.payRule, askRule: p.askRule };
}

export interface AgentRuntime {
  cfg: FosayConfig;
  agent: FosayAgent;
}

/** Builds a ready `FosayAgent` from the environment (config, key, pairing, relayer). */
export function loadAgentRuntime(env: Env): AgentRuntime {
  const cfg = loadConfigFromEnv(env);
  const secret = loadAgentSecret(env);
  const identity = loadIdentity(env);
  const api = env['FOSAY_API_URL'];
  const relayerUrl = env['FOSAY_RELAYER_URL'] ?? (api ? `${api.replace(/\/$/, '')}/relay` : undefined);
  const agent = new FosayAgent({ cfg, identity, secret, ...(relayerUrl ? { relayerUrl } : {}) });
  return { cfg, agent };
}
