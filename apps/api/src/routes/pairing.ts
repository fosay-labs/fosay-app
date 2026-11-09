import { FosayError, encodePairing, mandateHash, toHex } from '@fosay/sdk';
import type { FosayClient, FosayConfig, MandateDoc } from '@fosay/sdk';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import type { Db } from '../db/client';
import { agents, mandateDocs, wallets } from '../db/schema';
import { badRequest, contractAddress, stellarAddress } from './validate';

const decimal = z.string().regex(/^\d+$/, 'base units as a decimal string');

export const mandateDocSchema = z.object({
  v: z.literal(1),
  agentName: z.string().min(1).max(64),
  purpose: z.string().min(1).max(500),
  token: contractAddress,
  budget: decimal,
  periodLedgers: z.number().int().positive(),
  maxPerTx: decimal,
  recipients: z.array(stellarAddress).max(20),
  validUntilLedger: z.number().int().positive().nullable(),
  createdAt: z.iso.datetime(),
});

const pairingBody = z.object({
  wallet: contractAddress,
  payRule: z.number().int().nonnegative(),
  askRule: z.number().int().nonnegative(),
  agentPublicKey: z.string().regex(/^[0-9a-f]{64}$/),
  name: z.string().min(1).max(64),
  mandateHash: z.string().regex(/^[0-9a-f]{64}$/),
});

export function pairingRoutes(db: Db, cfg: FosayConfig, client: FosayClient): Hono {
  const r = new Hono();

  /** Stores the human-readable mandate; returns the hash the owner puts on-chain. */
  r.post('/mandate-docs', async (c) => {
    const parsed = mandateDocSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(badRequest(parsed.error), 400);
    const doc = parsed.data as MandateDoc;
    const hash = toHex(mandateHash(doc));
    await db.insert(mandateDocs).values({ hash, doc }).onConflictDoNothing();
    return c.json({ hash });
  });

  r.get('/mandate-docs/:hash', async (c) => {
    const hash = c.req.param('hash');
    if (!/^[0-9a-f]{64}$/.test(hash)) return c.json({ error: 'bad_request' }, 400);
    const [row] = await db.select().from(mandateDocs).where(eq(mandateDocs.hash, hash));
    return row ? c.json({ hash, doc: row.doc }) : c.json({ error: 'not_found' }, 404);
  });

  /**
   * Registers a connected agent after checking on-chain that its `:pay` rule carries a
   * mandate with this hash, and returns the pairing code for `fosay-agent pair`.
   */
  r.post('/pairing', async (c) => {
    const parsed = pairingBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(badRequest(parsed.error), 400);
    const b = parsed.data;
    try {
      const onChain = await client.getMandate(b.wallet, b.payRule);
      if (onChain.mandateHash !== b.mandateHash) {
        return c.json({ error: 'mandate_mismatch', message: 'on-chain mandate hash differs' }, 409);
      }
    } catch (e) {
      if (e instanceof FosayError && e.code === 'NotInstalled') {
        return c.json({ error: 'mandate_not_found', message: 'no mandate on that rule yet' }, 409);
      }
      throw e;
    }
    await db.insert(wallets).values({ address: b.wallet }).onConflictDoNothing();
    const row = {
      askRule: b.askRule,
      agentPublicKey: b.agentPublicKey,
      name: b.name,
      mandateHash: b.mandateHash,
      revoked: false,
    };
    await db
      .insert(agents)
      .values({ wallet: b.wallet, payRule: b.payRule, ...row })
      .onConflictDoUpdate({ target: [agents.wallet, agents.payRule], set: row });
    const code = encodePairing({
      v: 1,
      network: cfg.network,
      wallet: b.wallet,
      payRule: b.payRule,
      askRule: b.askRule,
      agentPublicKey: b.agentPublicKey,
    });
    return c.json({ code });
  });

  return r;
}
