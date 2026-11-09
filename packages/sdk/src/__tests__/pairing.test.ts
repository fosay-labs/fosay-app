import { StrKey } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { decodePairing, encodePairing } from '../pairing';

const p = {
  v: 1 as const,
  network: 'testnet' as const,
  wallet: StrKey.encodeContract(Buffer.alloc(32, 4)),
  payRule: 1,
  askRule: 2,
  agentPublicKey: 'ab'.repeat(32),
};

describe('pairing code', () => {
  it('round-trips as url-safe base64', () => {
    const code = encodePairing(p);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodePairing(code)).toEqual(p);
  });
  it('rejects malformed codes and bad fields', () => {
    expect(() => decodePairing('%%%')).toThrow(/pairing code/);
    expect(() => encodePairing({ ...p, wallet: 'GABC' })).toThrow();
    expect(() => encodePairing({ ...p, agentPublicKey: 'xyz' })).toThrow();
  });
});
