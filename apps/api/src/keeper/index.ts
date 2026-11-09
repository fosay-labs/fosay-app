import type { FosayConfig } from '@fosay/sdk';
import { scv } from '@fosay/sdk';
import { Keypair, Operation } from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';
import { and, eq, lt } from 'drizzle-orm';

import type { Db } from '../db/client';
import { agents, intents, mandates } from '../db/schema';
import type { Logger } from '../log';
import { submitAsKeeper } from './submit';
import { codeKeysOf, extendOp, needsRenewal, walletFootprintKeys } from './ttl';

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
      const [agent] = await db
        .select()
        .from(agents)
        .where(and(eq(agents.wallet, m.wallet), eq(agents.payRule, m.ruleId)));
      const rules = [0, m.ruleId, ...(agent ? [agent.askRule] : [])];
      const keys = await walletFootprintKeys(server, cfg, m.wallet, rules);
      const first = await server.getLedgerEntries(...keys);
      const codes = codeKeysOf(first.entries);
      const all = codes.length
        ? [...first.entries, ...(await server.getLedgerEntries(...codes)).entries]
        : first.entries;
      const renew = needsRenewal(all, latest);
      if (renew.length === 0) continue;
      const { op, sorobanData } = extendOp(renew);
      const r = await submitAsKeeper(server, cfg, keypair, op, sorobanData);
      report.extended += renew.length;
      log('info', 'keeper extended ttl', {
        wallet: m.wallet,
        entries: renew.length,
        hash: r.hash,
        fee: r.fee,
      });
    } catch (e) {
      report.errors++;
      log('error', 'keeper ttl failed', { wallet: m.wallet, error: String(e) });
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
      log('error', 'keeper expire failed', { intentId: i.id, error: String(e) });
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
      deps.log('error', 'keeper pass failed', { error: String(e) });
    } finally {
      running = false;
    }
  };
  void tick();
  const t = setInterval(() => void tick(), intervalMs);
  return () => clearInterval(t);
}
