import { Keypair, StrKey, scValToNative } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { fromBaseUnits, mandateParamsToScVal, toBaseUnits, validateMandateParams } from '../scval';

const recipient = StrKey.encodeContract(Buffer.alloc(32, 9));
const base = {
  budget: 50_000_000n,
  periodLedgers: 17_280,
  maxPerTx: 20_000_000n,
  recipients: [recipient, Keypair.random().publicKey()],
  mandateHash: new Uint8Array(32).fill(7),
};

describe('mandateParamsToScVal', () => {
  it('encodes a struct with sorted symbol keys that round-trips', () => {
    const v = mandateParamsToScVal(base);
    const keys = v.map()?.map((e) => e.key().sym().toString());
    expect(keys).toEqual(['budget', 'mandate_hash', 'max_per_tx', 'period_ledgers', 'recipients']);
    const n = scValToNative(v) as Record<string, unknown>;
    expect(n['budget']).toBe(50_000_000n);
    expect(n['max_per_tx']).toBe(20_000_000n);
    expect(n['period_ledgers']).toBe(17_280);
    expect(n['recipients']).toEqual(base.recipients);
    expect(Buffer.from(n['mandate_hash'] as Uint8Array)).toEqual(Buffer.alloc(32, 7));
  });

  it('rejects params the contract would reject', () => {
    const bad = [
      { budget: 0n },
      { maxPerTx: 0n },
      { maxPerTx: 60_000_000n },
      { periodLedgers: 7 },
      { periodLedgers: 535_681 },
      { recipients: Array.from({ length: 21 }, () => recipient) },
      { mandateHash: new Uint8Array(31) },
    ];
    for (const patch of bad) expect(() => validateMandateParams({ ...base, ...patch })).toThrow(RangeError);
    expect(() => validateMandateParams({ ...base, periodLedgers: 8, maxPerTx: base.budget })).not.toThrow();
  });
});

describe('units', () => {
  it('converts both ways at 7 decimals', () => {
    expect(toBaseUnits('12.5')).toBe(125_000_000n);
    expect(toBaseUnits('0.0000001')).toBe(1n);
    expect(toBaseUnits('3')).toBe(30_000_000n);
    expect(fromBaseUnits(125_000_000n)).toBe('12.5');
    expect(fromBaseUnits(1n)).toBe('0.0000001');
    expect(fromBaseUnits(30_000_000n)).toBe('3');
    expect(fromBaseUnits(-5n)).toBe('-0.0000005');
  });
  it('rejects bad input', () => {
    expect(() => toBaseUnits('1.00000001')).toThrow(RangeError);
    expect(() => toBaseUnits('-1')).toThrow(RangeError);
    expect(() => toBaseUnits('abc')).toThrow(RangeError);
  });
});
