import { and, desc, eq } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import type { Db } from '../db/client';
import { intents, mandateDocs } from '../db/schema';
import { badRequest, contractAddress, intentStatus } from './validate';

type IntentRow = typeof intents.$inferSelect;

export function intentView(i: IntentRow) {
  return {
    id: i.id,
    account: i.account,
    token: i.token,
    to: i.to,
    amount: i.amount,
    memo: i.memo,
    mandateHash: i.mandateHash,
    status: i.status,
    expiresLedger: i.expiresLedger,
    proposedLedger: i.proposedLedger,
    proposedTx: i.proposedTx,
    closedLedger: i.closedLedger,
    closedTx: i.closedTx,
  };
}

export function intentRoutes(db: Db): Hono {
  const r = new Hono();

  r.get('/', async (c) => {
    const parsed = z
      .object({
        account: contractAddress,
        status: intentStatus.optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .safeParse({
        account: c.req.query('account'),
        status: c.req.query('status'),
        limit: c.req.query('limit'),
      });
    if (!parsed.success) return c.json(badRequest(parsed.error), 400);
    const { account, status, limit } = parsed.data;
    const where: SQL[] = [eq(intents.account, account)];
    if (status) where.push(eq(intents.status, status));
    const rows = await db
      .select()
      .from(intents)
      .where(and(...where))
      .orderBy(desc(intents.proposedLedger))
      .limit(limit);
    return c.json({ items: rows.map(intentView) });
  });

  r.get('/:id', async (c) => {
    const id = c.req.param('id');
    if (!/^\d+$/.test(id)) return c.json({ error: 'bad_request' }, 400);
    const [row] = await db.select().from(intents).where(eq(intents.id, id));
    if (!row) return c.json({ error: 'not_found' }, 404);
    const [doc] = await db.select().from(mandateDocs).where(eq(mandateDocs.hash, row.mandateHash));
    return c.json({ ...intentView(row), mandateDoc: doc?.doc ?? null });
  });

  return r;
}
