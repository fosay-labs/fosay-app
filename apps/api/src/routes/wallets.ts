import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import type { Db } from '../db/client';
import { agents, intents, mandates, payments } from '../db/schema';
import { badRequest, contractAddress } from './validate';

export function walletRoutes(db: Db): Hono {
  const r = new Hono();

  r.get('/:address', async (c) => {
    const parsed = contractAddress.safeParse(c.req.param('address'));
    if (!parsed.success) return c.json(badRequest(parsed.error), 400);
    const address = parsed.data;
    const [as, ms, pending] = await Promise.all([
      db.select().from(agents).where(eq(agents.wallet, address)),
      db.select().from(mandates).where(eq(mandates.wallet, address)),
      db
        .select({ id: intents.id })
        .from(intents)
        .where(and(eq(intents.account, address), eq(intents.status, 'Pending'))),
    ]);
    return c.json({
      address,
      agents: as.map((a) => ({
        name: a.name,
        payRule: a.payRule,
        askRule: a.askRule,
        agentPublicKey: a.agentPublicKey,
        mandateHash: a.mandateHash,
        revoked: a.revoked,
      })),
      mandates: ms.map((m) => ({
        ruleId: m.ruleId,
        token: m.token,
        budget: m.budget,
        periodLedgers: m.periodLedgers,
        maxPerTx: m.maxPerTx,
        recipients: m.recipients,
        mandateHash: m.mandateHash,
        paused: m.paused,
        uninstalled: m.uninstalled,
      })),
      pendingRequests: pending.length,
    });
  });

  r.get('/:address/activity', async (c) => {
    const parsed = z
      .object({ address: contractAddress, limit: z.coerce.number().int().min(1).max(200).default(50) })
      .safeParse({ address: c.req.param('address'), limit: c.req.query('limit') });
    if (!parsed.success) return c.json(badRequest(parsed.error), 400);
    const { address, limit } = parsed.data;
    const [ps, is] = await Promise.all([
      db
        .select()
        .from(payments)
        .where(eq(payments.wallet, address))
        .orderBy(desc(payments.ledger))
        .limit(limit),
      db
        .select()
        .from(intents)
        .where(eq(intents.account, address))
        .orderBy(desc(intents.proposedLedger))
        .limit(limit),
    ]);
    const items = [
      ...ps.map((p) => ({
        kind: 'payment' as const,
        ledger: p.ledger,
        at: p.closedAt.toISOString(),
        txHash: p.txHash,
        to: p.to,
        amount: p.amount,
        via: p.via,
      })),
      ...is.map((i) => ({
        kind: 'request' as const,
        ledger: i.proposedLedger,
        txHash: i.proposedTx,
        id: i.id,
        to: i.to,
        amount: i.amount,
        memo: i.memo,
        status: i.status,
      })),
    ]
      .sort((a, b) => b.ledger - a.ledger)
      .slice(0, limit);
    return c.json({ address, items });
  });

  return r;
}
