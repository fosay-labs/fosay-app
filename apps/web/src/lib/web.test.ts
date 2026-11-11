import { TESTNET } from '@fosay/sdk';
import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { period, short, usdc } from './format';
import { PERIODS, buildMandate, ruleSlug } from './mandate-form';
import type { AgentForm } from './mandate-form';
import { urlBase64ToUint8Array } from './push';
import { agentKeyOf, rulesToRevoke } from './revoke';

describe('format', () => {
  it('formats USDC from base units without float drift', () => {
    expect(usdc('25000000')).toBe('2.5 USDC');
    expect(usdc(1n)).toBe('0.0000001 USDC');
    expect(usdc('170141183460469231731687303715884105727')).toBe(
      '17014118346046923173168730371588.4105727 USDC',
    );
  });
  it('shortens addresses and describes periods', () => {
    expect(short('GABCDEFGHIJKLMNOP')).toBe('GABC…MNOP');
    expect(period(17_280)).toBe('1 day');
    expect(period(120_960)).toBe('7 days');
    expect(period(720)).toBe('1.0 hours');
  });
});

describe('mandate form', () => {
  const form: AgentForm = {
    name: 'Research Bot #1 (prod)',
    purpose: 'Paid APIs',
    agentPublicKey: Keypair.random().rawPublicKey().toString('hex'),
    budget: '25',
    periodLedgers: PERIODS[0].ledgers,
    maxPerTx: '2.5',
    recipients: '',
    validDays: 30,
  };

  it('builds the doc, on-chain params and ≤20-byte rule names', () => {
    const m = buildMandate(form, TESTNET, 1_000_000, new Date('2026-11-09T00:00:00Z'));
    expect(m.budget).toBe(250_000_000n);
    expect(m.maxPerTx).toBe(25_000_000n);
    expect(m.validUntilLedger).toBe(1_000_000 + 30 * 17_280);
    expect(m.doc).toMatchObject({
      v: 1,
      token: TESTNET.usdcId,
      budget: '250000000',
      maxPerTx: '25000000',
      recipients: [],
    });
    expect(m.ruleNames.pay).toBe('research-bot-1:pay');
    expect(Buffer.byteLength(m.ruleNames.pay)).toBeLessThanOrEqual(20);
    expect(m.agentKey).toHaveLength(32);
  });

  it('rejects bad input with readable messages', () => {
    const bad: [Partial<AgentForm>, RegExp][] = [
      [{ name: ' ' }, /name/],
      [{ agentPublicKey: 'xyz' }, /64 hex/],
      [{ budget: 'ten' }, /USDC numbers/],
      [{ maxPerTx: '30' }, /maxPerTx/],
      [{ recipients: 'not-an-address' }, /Not a Stellar address/],
      [{ validDays: 0 }, /1–365/],
    ];
    for (const [patch, msg] of bad)
      expect(() => buildMandate({ ...form, ...patch }, TESTNET, 1, new Date())).toThrow(msg);
  });

  it('slugs names safely', () => {
    expect(ruleSlug('!!!')).toBe('agent');
    expect(ruleSlug('A very long agent name indeed')).toBe('a-very-long-age');
  });
});

describe('push', () => {
  it('decodes url-safe base64 VAPID keys', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID_-8'))).toEqual([1, 2, 3, 255, 239]);
  });
});

describe('revoke', () => {
  const V = TESTNET.ed25519VerifierId;
  const W = TESTNET.webauthnVerifierId;
  const ext = (verifier: string, byte: number) =>
    ({ tag: 'External', values: [verifier, Buffer.alloc(32, byte)] }) as const;
  const rules = [
    { id: 0, name: 'owner', signers: [ext(W, 9)] },
    { id: 1, name: 'bot:pay', signers: [ext(V, 1)] },
    { id: 2, name: 'bot:ask', signers: [ext(V, 1)] },
    { id: 3, name: 'other:pay', signers: [ext(V, 2)] },
    { id: 4, name: 'other:ask', signers: [ext(V, 2)] },
    { id: 5, name: 'bot2:ask', signers: [ext(V, 1)] }, // same key, another agent's rule
  ];

  it('finds the agent key on its Ed25519 signer', () => {
    expect(agentKeyOf(rules[1]!, V)).toBe('01'.repeat(32));
    expect(agentKeyOf(rules[0]!, V)).toBeNull();
  });

  it('removes the ask rule first, then the payment rule, without the API', () => {
    expect(rulesToRevoke(rules, 1, V)).toEqual([2, 1]);
    expect(rulesToRevoke(rules, 3, V, 4)).toEqual([4, 3]);
  });

  it('retries cleanly after a cancelled prompt and never touches the owner', () => {
    const afterAsk = rules.filter((r) => r.id !== 2);
    expect(rulesToRevoke(afterAsk, 1, V)).toEqual([1]);
    expect(
      rulesToRevoke(
        rules.filter((r) => r.id > 2),
        1,
        V,
        2,
      ),
    ).toEqual([]);
    expect(rulesToRevoke(rules, 1, V, 0)).not.toContain(0);
  });
});
