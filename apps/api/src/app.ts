import type { FosayConfig } from '@fosay/sdk';
import type { rpc } from '@stellar/stellar-sdk';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import type { ApiEnv } from './env';
import type { Logger } from './log';

export interface AppContext {
  env: ApiEnv;
  cfg: FosayConfig;
  server: rpc.Server;
  log: Logger;
}

/** Builds the HTTP app. Routes are added per feature; all dependencies are injected. */
export function createApp(ctx: AppContext): Hono {
  const app = new Hono();
  app.use('*', cors({ origin: ctx.env.CORS_ORIGIN === '*' ? '*' : ctx.env.CORS_ORIGIN.split(',') }));
  app.get('/health', (c) => c.json({ ok: true, network: ctx.cfg.network }));
  app.onError((err, c) => {
    ctx.log('error', 'unhandled error', { path: c.req.path, error: err.message });
    return c.json({ error: 'internal_error' }, 500);
  });
  return app;
}
