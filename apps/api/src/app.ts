import { FosayClient } from '@fosay/sdk';
import type { FosayConfig } from '@fosay/sdk';
import type { rpc } from '@stellar/stellar-sdk';
import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import type { Db } from './db/client';
import { cursors } from './db/schema';
import type { ApiEnv } from './env';
import type { Logger } from './log';
import { intentRoutes } from './routes/intents';
import { pairingRoutes } from './routes/pairing';
import { pushRoutes } from './routes/push';
import type { Pusher } from './push/notify';
import { relayerRoutes } from './relayer/route';
import { walletRoutes } from './routes/wallets';

export interface AppContext {
  env: ApiEnv;
  cfg: FosayConfig;
  server: rpc.Server;
  log: Logger;
  db: Db;
  /** Contract reads (defaults to a client on `server`). */
  client?: FosayClient;
  pusher?: Pusher;
  /** Override the relayer's contract WASM lookup (tests). */
  wasmHashOf?: (contractId: string) => Promise<string | null>;
  /** Called after an agent is paired (e.g. warm its storage TTLs). */
  onPaired?: (wallet: string, payRule: number) => void;
}

/** Builds the HTTP app. Routes are added per feature; all dependencies are injected. */
export function createApp(ctx: AppContext): Hono {
  const app = new Hono();
  app.use('*', cors({ origin: ctx.env.CORS_ORIGIN === '*' ? '*' : ctx.env.CORS_ORIGIN.split(',') }));
  // Liveness for the host's health check: the database answers; reports how far the indexer got.
  app.get('/health', async (c) => {
    try {
      await ctx.db.execute(sql`select 1`);
      const [cur] = await ctx.db.select().from(cursors).where(eq(cursors.name, 'events'));
      return c.json({ ok: true, network: ctx.cfg.network, indexedLedger: cur?.ledger ?? null });
    } catch (e) {
      ctx.log('error', 'health check failed', { error: e instanceof Error ? e.message : String(e) });
      return c.json({ ok: false, network: ctx.cfg.network }, 503);
    }
  });
  app.route('/wallets', walletRoutes(ctx.db));
  app.route('/intents', intentRoutes(ctx.db));
  if (ctx.pusher) app.route('/push', pushRoutes(ctx.db, ctx.pusher));
  if (ctx.env.RELAYER_SECRET) {
    app.route(
      '/relay',
      relayerRoutes({
        cfg: ctx.cfg,
        server: ctx.server,
        secret: ctx.env.RELAYER_SECRET,
        maxFeeStroops: ctx.env.RELAYER_MAX_FEE_STROOPS,
        proxy: {
          hops: ctx.env.TRUSTED_PROXY_HOPS,
          ...(ctx.env.CLIENT_IP_HEADER ? { header: ctx.env.CLIENT_IP_HEADER.toLowerCase() } : {}),
        },
        log: ctx.log,
        ...(ctx.wasmHashOf ? { wasmHashOf: ctx.wasmHashOf } : {}),
      }),
    );
  }
  app.route(
    '/',
    pairingRoutes(ctx.db, ctx.cfg, ctx.client ?? new FosayClient(ctx.cfg, ctx.server), ctx.onPaired),
  );
  app.onError((err, c) => {
    ctx.log('error', 'unhandled error', { path: c.req.path, error: err.message });
    return c.json({ error: 'internal_error' }, 500);
  });
  return app;
}
