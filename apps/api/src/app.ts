import { FosayClient } from '@fosay/sdk';
import type { FosayConfig } from '@fosay/sdk';
import type { rpc } from '@stellar/stellar-sdk';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import type { Db } from './db/client';
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
}

/** Builds the HTTP app. Routes are added per feature; all dependencies are injected. */
export function createApp(ctx: AppContext): Hono {
  const app = new Hono();
  app.use('*', cors({ origin: ctx.env.CORS_ORIGIN === '*' ? '*' : ctx.env.CORS_ORIGIN.split(',') }));
  app.get('/health', (c) => c.json({ ok: true, network: ctx.cfg.network }));
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
        log: ctx.log,
        ...(ctx.wasmHashOf ? { wasmHashOf: ctx.wasmHashOf } : {}),
      }),
    );
  }
  app.route('/', pairingRoutes(ctx.db, ctx.cfg, ctx.client ?? new FosayClient(ctx.cfg, ctx.server)));
  app.onError((err, c) => {
    ctx.log('error', 'unhandled error', { path: c.req.path, error: err.message });
    return c.json({ error: 'internal_error' }, 500);
  });
  return app;
}
