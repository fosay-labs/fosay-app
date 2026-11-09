import { fromBaseUnits } from '@fosay/sdk';
import { eq } from 'drizzle-orm';
import webpush from 'web-push';

import type { Db } from '../db/client';
import { pushSubscriptions } from '../db/schema';
import type { ApiEnv } from '../env';
import type { FosayEvent } from '../indexer/decode';
import type { Logger } from '../log';

export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export type SendFn = (sub: PushSubscriptionJson, payload: string) => Promise<{ statusCode: number }>;

export interface Pusher {
  enabled: boolean;
  publicKey: string | undefined;
  notifyIntent(e: Extract<FosayEvent, { kind: 'intent_proposed' }>): Promise<number>;
}

/** Notification text for a new approval request (shown on the owner's phone). */
export function intentNotification(e: Extract<FosayEvent, { kind: 'intent_proposed' }>) {
  return {
    title: `Your agent asks for ${fromBaseUnits(e.amount)} USDC`,
    body: e.memo,
    data: { intentId: e.id.toString(), url: `approvals/view/?id=${e.id.toString()}` },
  };
}

/** Web Push via VAPID. Disabled (no-op) unless all three VAPID variables are set. */
export function createPusher(env: ApiEnv, db: Db, log: Logger, send?: SendFn): Pusher {
  const enabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
  if (enabled && !send) {
    webpush.setVapidDetails(env.VAPID_SUBJECT ?? '', env.VAPID_PUBLIC_KEY ?? '', env.VAPID_PRIVATE_KEY ?? '');
  }
  const deliver: SendFn =
    send ?? ((sub, payload) => webpush.sendNotification(sub, payload, { TTL: 3600, urgency: 'high' }));

  return {
    enabled,
    publicKey: env.VAPID_PUBLIC_KEY,
    async notifyIntent(e) {
      if (!enabled) return 0;
      const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.wallet, e.account));
      const payload = JSON.stringify(intentNotification(e));
      let sent = 0;
      for (const s of subs) {
        try {
          await deliver({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
          sent++;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, s.endpoint));
            log('info', 'removed expired push subscription', { wallet: e.account });
          } else {
            log('warn', 'push delivery failed', { wallet: e.account, status });
          }
        }
      }
      log('info', 'push sent', { wallet: e.account, intentId: e.id, sent });
      return sent;
    },
  };
}
