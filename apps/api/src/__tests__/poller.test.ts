import { TESTNET } from '@fosay/sdk';
import type { rpc } from '@stellar/stellar-sdk';
import { Contract } from '@stellar/stellar-sdk';
import { describe, expect, it, vi } from 'vitest';

import { cursors, intents, mandates, payments, wallets } from '../db/schema';
import { createIndexer } from '../indexer/poller';
import { silentLogger } from '../log';
import { fixtureEvents } from './decode.test';
import { testDb } from './testdb';

function fakeServer(pages: ReturnType<typeof fixtureEvents>['events'][]) {
  let i = 0;
  return {
    getLatestLedger: vi.fn(async () => ({ sequence: 5_644_300 })),
    getEvents: vi.fn(async () => {
      const page = pages[i++] ?? [];
      return {
        latestLedger: 5_644_300,
        oldestLedger: 5_523_000,
        latestLedgerCloseTime: '0',
        cursor: `c${i}`,
        events: page.map((e) => ({ ...e, contractId: new Contract(e.contractId) })),
      };
    }),
    getTransaction: vi.fn(async () => ({ status: 'NOT_FOUND' })),
  } as unknown as rpc.Server;
}

describe('indexer poller on real testnet events', () => {
  it('mirrors intents, mandates and payments, with cursor and push hook', async () => {
    const { token, events } = fixtureEvents();
    const cfg = { ...TESTNET, usdcId: token };
    const db = await testDb();
    const onProposed = vi.fn(async () => undefined);
    const server = fakeServer([events.slice(0, 10), events.slice(10)]);
    const indexer = createIndexer({ db, cfg, server, log: silentLogger, startLedger: 5_643_488, onProposed });

    expect(await indexer.tick()).toBeGreaterThan(0);
    await indexer.tick();
    expect(await indexer.tick()).toBe(0); // no more events

    const ws = await db.select().from(wallets);
    expect(ws.length).toBeGreaterThanOrEqual(3); // three smoke-test wallets
    const ms = await db.select().from(mandates);
    expect(ms.map((m) => m.budget)).toContain('50000000');
    const is = await db.select().from(intents);
    expect(is.length).toBeGreaterThan(0);
    expect(is.every((i) => i.status === 'Executed')).toBe(true);
    expect(onProposed).toHaveBeenCalledTimes(is.length);
    const ps = await db.select().from(payments);
    expect(ps.length).toBeGreaterThan(0);
    expect(ps.filter((p) => p.via === 'approval').length).toBe(is.length); // owner-approved payouts
    const [c] = await db.select().from(cursors);
    expect(c?.cursor).toBe('c3');
  });

  it('is idempotent when a page is replayed', async () => {
    const { token, events } = fixtureEvents();
    const db = await testDb();
    const server = fakeServer([events, events]);
    const indexer = createIndexer({
      db,
      cfg: { ...TESTNET, usdcId: token },
      server,
      log: silentLogger,
      startLedger: 1,
    });
    await indexer.tick();
    const before = (await db.select().from(payments)).length;
    await indexer.tick();
    expect((await db.select().from(payments)).length).toBe(before);
  });
});
