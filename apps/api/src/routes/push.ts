import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import type { Db } from '../db/client';
import { pushSubscriptions } from '../db/schema';
import type { Pusher } from '../push/notify';
import { badRequest, contractAddress } from './validate';

const subscribeBody = z.object({
  wallet: contractAddress,
  subscription: z.object({
    endpoint: z.url().startsWith('https://'),
    keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  }),
});

export function pushRoutes(db: Db, pusher: Pusher): Hono {
  const r = new Hono();

  r.get('/vapid-public-key', (c) =>
    pusher.enabled ? c.json({ publicKey: pusher.publicKey }) : c.json({ error: 'push_disabled' }, 503),
  );

  r.post('/subscribe', async (c) => {
    const parsed = subscribeBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(badRequest(parsed.error), 400);
    const { wallet, subscription } = parsed.data;
    const row = { wallet, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth };
    await db
      .insert(pushSubscriptions)
      .values({ endpoint: subscription.endpoint, ...row })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: row });
    return c.json({ ok: true });
  });

  r.post('/unsubscribe', async (c) => {
    const parsed = z.object({ endpoint: z.url() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(badRequest(parsed.error), 400);
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, parsed.data.endpoint));
    return c.json({ ok: true });
  });

  return r;
}
