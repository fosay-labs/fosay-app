import { rpcServer } from '@fosay/sdk';
import { serve } from '@hono/node-server';

import { createApp } from './app';
import { connectDb } from './db/client';
import { createIndexer } from './indexer/poller';
import { startKeeper } from './keeper';
import { createPusher } from './push/notify';
import { loadEnv } from './env';
import { jsonLogger } from './log';

const { env, cfg } = loadEnv(process.env as Record<string, string | undefined>);
const server = rpcServer(cfg);
const { db } = await connectDb(env.DATABASE_URL);
const pusher = createPusher(env, db, jsonLogger);
const app = createApp({ env, cfg, server, log: jsonLogger, db, pusher });

const indexer = createIndexer({
  db,
  cfg,
  server,
  log: jsonLogger,
  startLedger: env.INDEXER_START_LEDGER,
  onProposed: async (e) => {
    await pusher.notifyIntent(e);
  },
});
indexer.start(env.INDEXER_POLL_SECONDS * 1000);

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  jsonLogger('info', 'fosay api listening', { port: info.port, network: cfg.network });
});

if (env.KEEPER_SECRET) {
  startKeeper(
    { db, cfg, server, secret: env.KEEPER_SECRET, log: jsonLogger },
    env.KEEPER_INTERVAL_SECONDS * 1000,
  );
} else {
  jsonLogger('warn', 'KEEPER_SECRET not set: TTL keeper disabled (agent payments will get expensive)');
}
