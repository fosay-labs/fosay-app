import { rpcServer } from '@fosay/sdk';
import { serve } from '@hono/node-server';

import { createApp } from './app';
import { connectDb } from './db/client';
import { createIndexer } from './indexer/poller';
import { keepWallet, startKeeper } from './keeper';
import { createPusher } from './push/notify';
import { loadEnv } from './env';
import { errorText, jsonLogger } from './log';

const { env, cfg } = loadEnv(process.env as Record<string, string | undefined>);
const server = rpcServer(cfg);
const { db, close: closeDb } = await connectDb(env.DATABASE_URL);
const pusher = createPusher(env, db, jsonLogger);
const keeperSecret = env.KEEPER_SECRET;
const onPaired = keeperSecret
  ? (wallet: string, payRule: number) => {
      // warm a newly connected agent's storage so its first payment is cheap
      keepWallet({ db, cfg, server, secret: keeperSecret, log: jsonLogger }, wallet, payRule).catch(
        (e: unknown) => jsonLogger('warn', 'post-pairing keeper failed', { wallet, error: errorText(e) }),
      );
    }
  : undefined;
const app = createApp({ env, cfg, server, log: jsonLogger, db, pusher, ...(onPaired ? { onPaired } : {}) });

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
const stopIndexer = indexer.start(env.INDEXER_POLL_SECONDS * 1000);

const http = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  jsonLogger('info', 'fosay api listening', { port: info.port, network: cfg.network });
});

let stopKeeper = (): void => undefined;
if (env.KEEPER_SECRET) {
  stopKeeper = startKeeper(
    { db, cfg, server, secret: env.KEEPER_SECRET, log: jsonLogger },
    env.KEEPER_INTERVAL_SECONDS * 1000,
  );
} else {
  jsonLogger('warn', 'KEEPER_SECRET not set: TTL keeper disabled (agent payments will get expensive)');
}

// Hosts (Render, Fly, Docker) send SIGTERM before replacing the instance: stop polling,
// finish in-flight requests, close the pool. Forced exit after 10 s.
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  jsonLogger('info', 'shutting down', { signal });
  stopIndexer();
  stopKeeper();
  setTimeout(() => process.exit(1), 10_000).unref();
  http.close(() => {
    closeDb()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
