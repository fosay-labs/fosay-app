import { StrKey } from '@stellar/stellar-sdk';
import { z } from 'zod';

import { FosayError } from './errors';

/**
 * What the owner's web app hands the agent after connecting it: which wallet and rules
 * the agent acts through. Encoded as base64url JSON; contains no secrets.
 */
export const pairingSchema = z.object({
  v: z.literal(1),
  network: z.enum(['testnet', 'mainnet']),
  wallet: z.string().refine((v) => StrKey.isValidContract(v), 'wallet must be a C… address'),
  payRule: z.number().int().nonnegative(),
  askRule: z.number().int().nonnegative(),
  agentPublicKey: z.string().regex(/^[0-9a-f]{64}$/, '32-byte hex Ed25519 public key'),
});
export type Pairing = z.infer<typeof pairingSchema>;

function toBase64Url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

export function encodePairing(p: Pairing): string {
  return toBase64Url(JSON.stringify(pairingSchema.parse(p)));
}

export function decodePairing(code: string): Pairing {
  try {
    return pairingSchema.parse(JSON.parse(fromBase64Url(code.trim())));
  } catch {
    throw new FosayError('INVALID_INPUT', 'not a valid FOSAY pairing code');
  }
}
