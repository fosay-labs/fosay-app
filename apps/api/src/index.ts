import { rpcServer } from '@fosay/sdk';
import { serve } from '@hono/node-server';

import { createApp } from './app';
import { connectDb } from './db/client';
import { loadEnv } from './env';
import { jsonLogger } from './log';

const { env, cfg } = loadEnv(process.env as Record<string, string | undefined>);
const server = rpcServer(cfg);
const { db } = await connectDb(env.DATABASE_URL);
const app = createApp({ env, cfg, server, log: jsonLogger, db });

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  jsonLogger('info', 'fosay api listening', { port: info.port, network: cfg.network });
});
