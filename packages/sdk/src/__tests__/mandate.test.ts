import { describe, expect, it } from 'vitest';

import { canonicalJson, mandateHash, toHex } from '../mandate';
import type { MandateDoc } from '../mandate';

const doc: MandateDoc = {
  v: 1,
  agentName: 'research-bot',
  purpose: 'Buy API calls for market research',
  token: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
  budget: '50000000',
  periodLedgers: 17280,
  maxPerTx: '20000000',
  recipients: [],
  validUntilLedger: null,
  createdAt: '2026-11-09T12:00:00.000Z',
};

describe('mandate hash', () => {
  it('canonical JSON sorts keys and drops whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, 1], c: 10n } })).toBe('{"a":{"c":"10","d":[2,1]},"b":1}');
  });

  it('is stable and independent of key order', () => {
    const reordered = Object.fromEntries(Object.entries(doc).reverse()) as unknown as MandateDoc;
    expect(toHex(mandateHash(reordered))).toBe(toHex(mandateHash(doc)));
    expect(mandateHash(doc)).toHaveLength(32);
    expect(toHex(mandateHash({ ...doc, budget: '50000001' }))).not.toBe(toHex(mandateHash(doc)));
  });

  it('rejects values JSON cannot represent faithfully', () => {
    expect(() => canonicalJson({ x: Number.NaN })).toThrow(TypeError);
    expect(() => canonicalJson({ f: () => 1 })).toThrow(TypeError);
  });
});
