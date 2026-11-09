import { FosayError, TESTNET, decodePairing, mandateHash, toHex } from '@fosay/sdk';
import type { MandateDoc, FosayClient } from '@fosay/sdk';
import { Contract } from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../app';
import type { Db } from '../db/client';
import { pushSubscriptions } from '../db/schema';
import { loadEnv } from '../env';
import type { FosayEvent } from '../indexer/decode';
import { createIndexer } from '../indexer/poller';
import { silentLogger } from '../log';
import { createPusher } from '../push/notify';
import { baseEnv } from './app.test';
import { fixtureEvents } from './decode.test';
import { testDb } from './testdb';

const { token, events } = fixtureEvents();
const cfg = { ...TESTNET, usdcId: token };

async function seeded(): Promise<Db> {
  const db = await testDb();
  let served = false;
  const server = {
    getLatestLedger: async () => ({ sequence: 5_644_300 }),
    getEvents: async () => {
      const page = served ? [] : events;
      served = true;
      return {
        cursor: 'c',
        latestLedger: 1,
        oldestLedger: 1,
        latestLedgerCloseTime: '0',
        events: page.map((e) => ({ ...e, contractId: new Contract(e.contractId) })),
      };
    },
    getTransaction: async () => ({ status: 'NOT_FOUND' }),
  } as unknown as rpc.Server;
  await createIndexer({ db, cfg, server, log: silentLogger, startLedger: 1 }).tick();
  return db;
}

function app(db: Db, client?: Partial<FosayClient>, envPatch: Record<string, string> = {}) {
  const { env } = loadEnv({ ...baseEnv, ...envPatch });
  const pusher = createPusher(env, db, silentLogger, async () => ({ statusCode: 201 }));
  return createApp({
    env,
    cfg,
    server: {} as rpc.Server,
    log: silentLogger,
    db,
    pusher,
    ...(client ? { client: client as FosayClient } : {}),
  });
}

describe('read routes', () => {
  it('wallet summary, activity and intents', async () => {
    const db = await seeded();
    const a = app(db);
    const list = (await (await a.request(`/intents?account=${'C'.repeat(56)}`)).json()) as { error?: string };
    expect(list.error).toBe('bad_request');

    const proposals = events.filter((e) => e.contractId === TESTNET.approvalsId);
    expect(proposals.length).toBeGreaterThan(0);
    // a wallet that has both a mandate (current policy) and approval requests
    const allIntents = await db.query.intents.findMany();
    const withMandate = new Set((await db.query.mandates.findMany()).map((m) => m.wallet));
    const account = allIntents.find((i) => withMandate.has(i.account))?.account ?? '';
    expect(account).not.toBe('');

    const w = (await (await a.request(`/wallets/${account}`)).json()) as {
      mandates: unknown[];
      pendingRequests: number;
    };
    expect(w.mandates).toHaveLength(1);
    expect(w.pendingRequests).toBe(0);

    const act = (await (await a.request(`/wallets/${account}/activity?limit=10`)).json()) as {
      items: { kind: string; via?: string }[];
    };
    expect(act.items.some((i) => i.kind === 'request')).toBe(true);
    expect(act.items.some((i) => i.kind === 'payment' && i.via === 'approval')).toBe(true);

    const is = (await (await a.request(`/intents?account=${account}&status=Executed`)).json()) as {
      items: { id: string }[];
    };
    expect(is.items.length).toBeGreaterThan(0);
    const one = (await (await a.request(`/intents/${is.items[0]?.id ?? ''}`)).json()) as {
      status: string;
      mandateDoc: unknown;
    };
    expect(one.status).toBe('Executed');
    expect((await a.request('/intents/999999')).status).toBe(404);
  });
});

describe('pairing and mandate docs', () => {
  const doc: MandateDoc = {
    v: 1,
    agentName: 'bot',
    purpose: 'research',
    token: TESTNET.usdcId,
    budget: '50000000',
    periodLedgers: 17280,
    maxPerTx: '20000000',
    recipients: [],
    validUntilLedger: null,
    createdAt: '2026-11-09T12:00:00.000Z',
  };
  const wallet = events.find((e) => e.contractId === TESTNET.mandatePolicyId)?.topic[1];

  it('stores mandate docs under the SDK hash', async () => {
    const a = app(await testDb());
    const r = (await (
      await a.request('/mandate-docs', { method: 'POST', body: JSON.stringify(doc) })
    ).json()) as { hash: string };
    expect(r.hash).toBe(toHex(mandateHash(doc)));
    const g = (await (await a.request(`/mandate-docs/${r.hash}`)).json()) as { doc: MandateDoc };
    expect(g.doc).toEqual(doc);
    expect((await a.request('/mandate-docs', { method: 'POST', body: '{"v":2}' })).status).toBe(400);
  });

  it('registers an agent only when the on-chain mandate matches', async () => {
    expect(wallet).toBeDefined();
    const w = 'CAXJ2MCGMKDJLRYWQAYKTM5SP6AS7MAMIK42JXCGD3R6HXGXT6NVYEAH';
    const hash = toHex(mandateHash(doc));
    const body = {
      wallet: w,
      payRule: 1,
      askRule: 2,
      agentPublicKey: 'ab'.repeat(32),
      name: 'bot',
      mandateHash: hash,
    };
    const ok = app(await testDb(), {
      getMandate: vi.fn(async () => ({ mandateHash: hash })) as unknown as FosayClient['getMandate'],
    });
    const r = (await (
      await ok.request('/pairing', { method: 'POST', body: JSON.stringify(body) })
    ).json()) as { code: string };
    expect(decodePairing(r.code)).toEqual({
      v: 1,
      network: 'testnet',
      wallet: w,
      payRule: 1,
      askRule: 2,
      agentPublicKey: 'ab'.repeat(32),
    });

    const mismatch = app(await testDb(), {
      getMandate: vi.fn(async () => ({
        mandateHash: '00'.repeat(32),
      })) as unknown as FosayClient['getMandate'],
    });
    expect((await mismatch.request('/pairing', { method: 'POST', body: JSON.stringify(body) })).status).toBe(
      409,
    );
    const missing = app(await testDb(), {
      getMandate: vi.fn(async () => {
        throw new FosayError('NotInstalled', 'x');
      }) as unknown as FosayClient['getMandate'],
    });
    expect((await missing.request('/pairing', { method: 'POST', body: JSON.stringify(body) })).status).toBe(
      409,
    );
  });
});

describe('push', () => {
  const vapid = { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:a@b.c' };
  const w = 'CAXJ2MCGMKDJLRYWQAYKTM5SP6AS7MAMIK42JXCGD3R6HXGXT6NVYEAH';
  const sub = (n: number) => ({
    wallet: w,
    subscription: { endpoint: `https://push.example.com/${n}`, keys: { p256dh: 'k', auth: 'a' } },
  });

  it('subscribes, notifies and prunes gone subscriptions', async () => {
    const db = await testDb();
    const a = app(db, undefined, vapid);
    expect(
      ((await (await a.request('/push/vapid-public-key')).json()) as { publicKey: string }).publicKey,
    ).toBe('pub');
    for (const n of [1, 2])
      expect(
        (await a.request('/push/subscribe', { method: 'POST', body: JSON.stringify(sub(n)) })).status,
      ).toBe(200);
    expect(
      (
        await a.request('/push/subscribe', {
          method: 'POST',
          body: JSON.stringify({ ...sub(3), wallet: 'G' }),
        })
      ).status,
    ).toBe(400);

    const { env } = loadEnv({ ...baseEnv, ...vapid });
    const send = vi.fn(async (s: { endpoint: string }, _payload: string) => {
      if (s.endpoint.endsWith('/2')) throw Object.assign(new Error('gone'), { statusCode: 410 });
      return { statusCode: 201 };
    });
    const pusher = createPusher(env, db, silentLogger, send);
    const e = {
      kind: 'intent_proposed',
      account: w,
      id: 5n,
      amount: 25_000_000n,
      memo: 'need data',
    } as Extract<FosayEvent, { kind: 'intent_proposed' }>;
    expect(await pusher.notifyIntent(e)).toBe(1);
    const payload = JSON.parse(send.mock.calls[0]?.[1] ?? '{}') as {
      title: string;
      data: { url: string };
    };
    expect(payload.title).toBe('Your agent asks for 2.5 USDC');
    expect(payload.data.url).toBe('/approvals/5');
    expect(await db.select().from(pushSubscriptions)).toHaveLength(1);
  });
});
