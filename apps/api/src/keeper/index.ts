import type { FosayConfig } from '@fosay/sdk';
import { scv } from '@fosay/sdk';
import { Keypair, Operation } from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';
import { and, eq, lt } from 'drizzle-orm';

import type { Db } from '../db/client';
import { agents, intents, mandates } from '../db/schema';
import type { Logger } from '../log';
import { errorText } from '../log';
import { submitAsKeeper } from './submit';
import { codeKeysOf, dedupeKeys, extendOp, needsRenewal, walletFootprintKeys } from './ttl';

export interface KeeperDeps {
  db: Db;
  cfg: FosayConfig;
  server: rpc.Server;
  secret: string;
  log: Logger;
}

export interface KeeperReport {
  wallets: number;
  extended: number;
  expired: number;
  errors: number;
}

/**
 * Renews every footprint entry of one wallet's agent that is under the renewal threshold.
 * Returns the number of entries extended. Called on each pass and right after pairing, so
 * a freshly connected agent's first payment is already cheap (Phase 8: cold ≈ 250–345k
 * stroops, over the x402 facilitator's 50k ceiling).
 */
export async function keepWallet(
  deps: KeeperDeps,
  wallet: string,
  payRule: number,
  latest?: number,
): Promise<number> {
  const { db, cfg, server, log } = deps;
  const ledger = latest ?? (await server.getLatestLedger()).sequence;
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.wallet, wallet), eq(agents.payRule, payRule)));
  const rules = [0, payRule, ...(agent ? [agent.askRule] : [])];
  const keys = await walletFootprintKeys(server, cfg, wallet, rules);
  const first = await server.getLedgerEntries(...keys);
  // code entries not already requested (the account code is in `keys`), each once
  const requested = new Set(keys.map((k) => k.toXDR('base64')));
  const codes = dedupeKeys(codeKeysOf(first.entries)).filter((c) => !requested.has(c.toXDR('base64')));
  const all = codes.length
    ? [...first.entries, ...(await server.getLedgerEntries(...codes)).entries]
    : first.entries;
  const renew = needsRenewal(all, ledger);
  if (renew.length === 0) return 0;
  const { op, sorobanData } = extendOp(renew);
  const r = await submitAsKeeper(server, cfg, Keypair.fromSecret(deps.secret), op, sorobanData);
  log('info', 'keeper extended ttl', { wallet, entries: renew.length, hash: r.hash, fee: r.fee });
  return renew.length;
}

/** One keeper pass: renew TTLs of every active wallet's footprint, expire stale requests. */
export async function runKeeper(deps: KeeperDeps): Promise<KeeperReport> {
  const { db, cfg, server, log } = deps;
  const keypair = Keypair.fromSecret(deps.secret);
  const report: KeeperReport = { wallets: 0, extended: 0, expired: 0, errors: 0 };
  const latest = (await server.getLatestLedger()).sequence;

  const active = await db.select().from(mandates).where(eq(mandates.uninstalled, false));
  for (const m of active) {
    report.wallets++;
    try {
      report.extended += await keepWallet(deps, m.wallet, m.ruleId, latest);
    } catch (e) {
      report.errors++;
      log('error', 'keeper ttl failed', { wallet: m.wallet, error: errorText(e) });
    }
  }

  const stale = await db
    .select()
    .from(intents)
    .where(and(eq(intents.status, 'Pending'), lt(intents.expiresLedger, latest)));
  for (const i of stale) {
    try {
      const op = Operation.invokeContractFunction({
        contract: cfg.approvalsId,
        function: 'expire',
        args: [scv.u64(BigInt(i.id))],
      });
      const r = await submitAsKeeper(server, cfg, keypair, op);
      report.expired++;
      log('info', 'keeper expired intent', { intentId: i.id, hash: r.hash, fee: r.fee });
    } catch (e) {
      report.errors++;
      log('error', 'keeper expire failed', { intentId: i.id, error: errorText(e) });
    }
  }
  log('info', 'keeper pass done', { ...report });
  return report;
}

export function startKeeper(deps: KeeperDeps, intervalMs: number): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runKeeper(deps);
    } catch (e) {
      deps.log('error', 'keeper pass failed', { error: errorText(e) });
    } finally {
      running = false;
    }
  };
  void tick();
  const t = setInterval(() => void tick(), intervalMs);
  return () => clearInterval(t);
}
