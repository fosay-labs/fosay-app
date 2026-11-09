import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { FosayError } from '@fosay/sdk';
import { Keypair } from '@stellar/stellar-sdk';

export interface AgentKeyInfo {
  /** Raw Ed25519 public key, hex: what the owner registers on the `:pay`/`:ask` rules. */
  publicKeyHex: string;
  /** Same key in G… form (for display only; the agent needs no funded account). */
  address: string;
}

export function expandHome(p: string): string {
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
}

export function keyInfo(secret: string): AgentKeyInfo {
  const kp = Keypair.fromSecret(secret);
  return { publicKeyHex: kp.rawPublicKey().toString('hex'), address: kp.publicKey() };
}

/**
 * Creates a new agent key file (mode 0600, parent directory 0700). Refuses to overwrite
 * an existing key unless `force` is set.
 */
export function generateAgentKey(file: string, { force = false } = {}): AgentKeyInfo {
  const target = expandHome(file);
  if (fs.existsSync(target) && !force) {
    throw new FosayError('INVALID_INPUT', `${file} already exists (use --force to replace it)`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const kp = Keypair.random();
  fs.writeFileSync(target, `${kp.secret()}\n`, { mode: 0o600 });
  fs.chmodSync(target, 0o600);
  return keyInfo(kp.secret());
}

/**
 * Loads the agent secret from `FOSAY_AGENT_SECRET` or the key file at
 * `FOSAY_AGENT_KEY_FILE` (default `~/.fosay/agent.key`). A key file readable by group or
 * others is rejected.
 */
export function loadAgentSecret(env: Record<string, string | undefined>): string {
  const fromEnv = env['FOSAY_AGENT_SECRET'];
  if (fromEnv) return validate(fromEnv.trim());
  const file = expandHome(env['FOSAY_AGENT_KEY_FILE'] ?? '~/.fosay/agent.key');
  if (!fs.existsSync(file)) {
    throw new FosayError(
      'INVALID_INPUT',
      `no agent key: set FOSAY_AGENT_SECRET or create ${file} (fosay-agent keygen)`,
    );
  }
  const mode = fs.statSync(file).mode & 0o777;
  if ((mode & 0o077) !== 0) {
    throw new FosayError(
      'INVALID_INPUT',
      `${file} is readable by others (mode ${mode.toString(8)}); run chmod 600`,
    );
  }
  return validate(fs.readFileSync(file, 'utf8').trim());
}

function validate(secret: string): string {
  try {
    Keypair.fromSecret(secret);
  } catch {
    throw new FosayError('INVALID_INPUT', 'agent key is not a valid Stellar secret key');
  }
  return secret;
}
