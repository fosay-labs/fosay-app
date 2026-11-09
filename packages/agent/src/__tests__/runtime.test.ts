import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { decodePairing, encodePairing, loadIdentity, savePairing } from '../runtime';

const kp = Keypair.random();
const pairing = {
  v: 1 as const,
  network: 'testnet' as const,
  wallet: StrKey.encodeContract(Buffer.alloc(32, 4)),
  payRule: 1,
  askRule: 2,
  agentPublicKey: kp.rawPublicKey().toString('hex'),
};

describe('pairing', () => {
  it('round-trips and saves a pairing for this key only', () => {
    const code = encodePairing(pairing);
    expect(decodePairing(code)).toEqual(pairing);
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fosay-pair-')), 'wallet.json');
    const env = { FOSAY_WALLET_FILE: file };
    savePairing(env, pairing, kp.secret());
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(loadIdentity(env)).toEqual({ wallet: pairing.wallet, payRule: 1, askRule: 2 });
    expect(() => savePairing(env, pairing, Keypair.random().secret())).toThrow(/different agent key/);
    expect(() => decodePairing('garbage')).toThrow(/pairing code/);
  });

  it('prefers env identity and validates rule ids', () => {
    expect(
      loadIdentity({ FOSAY_WALLET: pairing.wallet, FOSAY_PAY_RULE_ID: '3', FOSAY_ASK_RULE_ID: '4' }),
    ).toEqual({
      wallet: pairing.wallet,
      payRule: 3,
      askRule: 4,
    });
    expect(() => loadIdentity({ FOSAY_WALLET: pairing.wallet, FOSAY_PAY_RULE_ID: 'x' })).toThrow(/integers/);
  });
});
