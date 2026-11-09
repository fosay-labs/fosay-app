import fs from 'node:fs';
import path from 'node:path';

import { FosayError, loadConfigFromEnv } from '@fosay/sdk';
import type { AgentIdentity, FosayConfig } from '@fosay/sdk';
import { z } from 'zod';

import { FosayAgent } from './agent';
import { expandHome, keyInfo, loadAgentSecret } from './keys';

/** What the owner's web app hands the agent after connecting it (base64url JSON). */
export const pairingSchema = z.object({
  v: z.literal(1),
  network: z.enum(['testnet', 'mainnet']),
  wallet: z.string(),
  payRule: z.number().int().nonnegative(),
  askRule: z.number().int().nonnegative(),
  agentPublicKey: z.string().regex(/^[0-9a-f]{64}$/),
});
export type Pairing = z.infer<typeof pairingSchema>;

export function encodePairing(p: Pairing): string {
  return Buffer.from(JSON.stringify(p), 'utf8').toString('base64url');
}

export function decodePairing(code: string): Pairing {
  try {
    return pairingSchema.parse(JSON.parse(Buffer.from(code.trim(), 'base64url').toString('utf8')));
  } catch {
    throw new FosayError('INVALID_INPUT', 'not a valid FOSAY pairing code');
  }
}

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
