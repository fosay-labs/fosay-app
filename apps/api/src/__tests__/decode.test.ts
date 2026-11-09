import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TESTNET } from '@fosay/sdk';
import { xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { decodeEvent } from '../indexer/decode';
import type { FosayEvent, RawEvent } from '../indexer/decode';

interface RawFixture {
  token: string;
  events: {
    id: string;
    ledger: number;
    ledgerClosedAt: string;
    txHash: string;
    contractId: string;
    topic: string[];
    value: string;
  }[];
}

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  fs.readFileSync(path.join(here, 'fixtures/testnet-events.json'), 'utf8'),
) as RawFixture;

/** Real FOSAY events captured from testnet (Phase 8 smoke test activity). */
export function fixtureEvents(): { token: string; events: RawEvent[] } {
  return {
    token: fixture.token,
    events: fixture.events.map((e) => ({
      ...e,
      topic: e.topic.map((t) => xdr.ScVal.fromXDR(t, 'base64')),
      value: xdr.ScVal.fromXDR(e.value, 'base64'),
    })),
  };
}

describe('decodeEvent on real testnet events', () => {
  const { token, events } = fixtureEvents();
  const decoded = events
    .map((e) => decodeEvent(TESTNET, token, e))
    .filter((e): e is FosayEvent => e !== null);

  it('decodes every tracked kind and skips mint events', () => {
    const kinds = new Set(decoded.map((d) => d.kind));
    expect(kinds).toEqual(new Set(['intent_proposed', 'intent_executed', 'mandate_installed', 'transfer']));
    expect(decoded.length).toBeLessThan(events.length); // mints skipped
  });

  it('decodes an approval request with its fields', () => {
    const p = decoded.find((d) => d.kind === 'intent_proposed');
    expect(p).toMatchObject({ kind: 'intent_proposed', memo: 'over budget: please approve', token });
    if (p?.kind !== 'intent_proposed') return;
    expect(p.account).toMatch(/^C[A-Z2-7]{55}$/);
    expect(p.amount).toBeGreaterThan(0n);
    expect(p.mandateHash).toMatch(/^[0-9a-f]{64}$/);
    expect(p.expiresLedger).toBeGreaterThan(p.ledger);
    const executed = decoded.find((d) => d.kind === 'intent_executed' && d.id === p.id);
    expect(executed).toBeDefined();
  });

  it('decodes mandates and transfers', () => {
    const m = decoded.find((d) => d.kind === 'mandate_installed');
    expect(m).toMatchObject({
      budget: 50_000_000n,
      maxPerTx: 20_000_000n,
      periodLedgers: 17_280,
      recipients: [],
      token,
    });
    const t = decoded.find((d) => d.kind === 'transfer');
    expect(t).toMatchObject({ kind: 'transfer', token });
    if (t?.kind === 'transfer') expect(t.amount).toBeGreaterThan(0n);
  });

  it('ignores other contracts and failed calls', () => {
    const e = events[0];
    if (!e) throw new Error('empty fixture');
    expect(decodeEvent(TESTNET, token, { ...e, contractId: 'COTHER' })).toBeNull();
    expect(decodeEvent(TESTNET, token, { ...e, inSuccessfulContractCall: false })).toBeNull();
  });
});
