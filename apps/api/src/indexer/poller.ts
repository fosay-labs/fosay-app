import type { FosayConfig } from '@fosay/sdk';
import type { rpc } from '@stellar/stellar-sdk';
import { and, eq, sql } from 'drizzle-orm';

import type { Db } from '../db/client';
import { agents, cursors, intents, mandates, payments, wallets } from '../db/schema';
import type { Logger } from '../log';
import { errorText } from '../log';
import { walletRuleIds } from './attribution';
import { decodeEvent } from './decode';
import type { FosayEvent, RawEvent } from './decode';

const CURSOR = 'events';
const PAGE = 100;

export interface IndexerDeps {
  db: Db;
  cfg: FosayConfig;
  server: rpc.Server;
  log: Logger;
  startLedger: number;
  /** Called after a new approval request is stored (push notification). */
  onProposed?: (e: Extract<FosayEvent, { kind: 'intent_proposed' }>) => Promise<void>;
}

export interface Indexer {
  /** Fetches and applies one page of events; returns how many were applied. */
  tick(): Promise<number>;
  start(intervalMs: number): () => void;
}

export function createIndexer(deps: IndexerDeps): Indexer {
  const { db, cfg, server, log } = deps;
  const filters = [
    { type: 'contract' as const, contractIds: [cfg.approvalsId, cfg.mandatePolicyId, cfg.usdcId] },
  ];

  async function tick(): Promise<number> {
    const [cur] = await db.select().from(cursors).where(eq(cursors.name, CURSOR));
    let res: rpc.Api.GetEventsResponse;
    if (cur?.cursor) {
      res = await server.getEvents({ cursor: cur.cursor, filters, limit: PAGE });
    } else {
      const probe = await server.getLatestLedger();
      const oldest = Math.max(deps.startLedger, probe.sequence - 120_000); // RPC keeps ~7 days
      if (oldest > deps.startLedger)
        log('warn', 'start ledger is older than RPC retention; starting later', { oldest });
      res = await server.getEvents({ startLedger: oldest, filters, limit: PAGE });
    }
    const raw: RawEvent[] = res.events.map((e) => ({
      id: e.id,
      ledger: e.ledger,
      ledgerClosedAt: e.ledgerClosedAt,
      txHash: e.txHash,
      contractId: e.contractId?.contractId() ?? '',
      topic: e.topic,
      value: e.value,
      ...(e.inSuccessfulContractCall === undefined
        ? {}
        : { inSuccessfulContractCall: e.inSuccessfulContractCall }),
    }));
    const decoded = raw
      .map((e) => decodeEvent(cfg, cfg.usdcId, e))
      .filter((e): e is FosayEvent => e !== null);
    const approvalTxs = new Set(decoded.filter((e) => e.kind === 'intent_executed').map((e) => e.txHash));
    for (const e of decoded) await apply(e, approvalTxs);
    const lastLedger = raw.at(-1)?.ledger ?? cur?.ledger ?? deps.startLedger;
    await db
      .insert(cursors)
      .values({ name: CURSOR, ledger: lastLedger, cursor: res.cursor })
      .onConflictDoUpdate({
        target: cursors.name,
        set: { ledger: lastLedger, cursor: res.cursor, updatedAt: sql`now()` },
      });
    if (decoded.length) log('info', 'indexed events', { count: decoded.length, ledger: lastLedger });
    return decoded.length;
  }

  async function knownWallet(address: string): Promise<boolean> {
    const [w] = await db.select().from(wallets).where(eq(wallets.address, address));
    return w !== undefined;
  }

  async function apply(e: FosayEvent, approvalTxs: Set<string>): Promise<void> {
    switch (e.kind) {
      case 'intent_proposed': {
        await db.insert(wallets).values({ address: e.account }).onConflictDoNothing();
        const inserted = await db
          .insert(intents)
          .values({
            id: e.id.toString(),
            account: e.account,
            token: e.token,
            to: e.to,
            amount: e.amount.toString(),
            mandateHash: e.mandateHash,
            memo: e.memo,
            expiresLedger: e.expiresLedger,
            status: 'Pending',
            proposedLedger: e.ledger,
            proposedTx: e.txHash,
          })
          .onConflictDoNothing()
          .returning({ id: intents.id });
        if (inserted.length && deps.onProposed) {
          await deps
            .onProposed(e)
            .catch((err: unknown) => log('warn', 'push failed', { error: String(err) }));
        }
        return;
      }
      case 'intent_executed':
      case 'intent_cancelled':
      case 'intent_expired': {
        const status =
          e.kind === 'intent_executed' ? 'Executed' : e.kind === 'intent_cancelled' ? 'Cancelled' : 'Expired';
        await db
          .update(intents)
          .set({ status, closedLedger: e.ledger, closedTx: e.txHash })
          .where(eq(intents.id, e.id.toString()));
        if (e.kind === 'intent_executed') {
          // the payout transfer is in the same tx but may have been indexed on an earlier page
          await db
            .update(payments)
            .set({ via: 'approval' })
            .where(and(eq(payments.txHash, e.txHash), eq(payments.wallet, e.account)));
        }
        return;
      }
      case 'mandate_installed': {
        await db.insert(wallets).values({ address: e.wallet }).onConflictDoNothing();
        const row = {
          token: e.token,
          budget: e.budget.toString(),
          periodLedgers: e.periodLedgers,
          maxPerTx: e.maxPerTx.toString(),
          recipients: e.recipients,
          mandateHash: e.mandateHash,
          paused: false,
          uninstalled: false,
          updatedLedger: e.ledger,
        };
        await db
          .insert(mandates)
          .values({ wallet: e.wallet, ruleId: e.ruleId, ...row })
          .onConflictDoUpdate({ target: [mandates.wallet, mandates.ruleId], set: row });
        return;
      }
      case 'mandate_updated':
        await db
          .update(mandates)
          .set({
            budget: e.budget.toString(),
            maxPerTx: e.maxPerTx.toString(),
            recipients: e.recipients,
            mandateHash: e.mandateHash,
            updatedLedger: e.ledger,
          })
          .where(and(eq(mandates.wallet, e.wallet), eq(mandates.ruleId, e.ruleId)));
        return;
      case 'mandate_paused':
        await db
          .update(mandates)
          .set({ paused: e.paused, updatedLedger: e.ledger })
          .where(and(eq(mandates.wallet, e.wallet), eq(mandates.ruleId, e.ruleId)));
        return;
      case 'mandate_uninstalled':
        await db
          .update(mandates)
          .set({ uninstalled: true, updatedLedger: e.ledger })
          .where(and(eq(mandates.wallet, e.wallet), eq(mandates.ruleId, e.ruleId)));
        await db
          .update(agents)
          .set({ revoked: true })
          .where(and(eq(agents.wallet, e.wallet), eq(agents.payRule, e.ruleId)));
        return;
      case 'transfer': {
        if (!(await knownWallet(e.from))) return;
        let via: 'agent' | 'owner' | 'approval' | 'unknown' = 'unknown';
        let ruleIds: number[] | null = null;
        if (approvalTxs.has(e.txHash)) {
          via = 'approval';
        } else {
          ruleIds = await walletRuleIds(server, e.txHash, e.from);
          if (ruleIds?.length) {
            const payRules = await db
              .select({ r: mandates.ruleId })
              .from(mandates)
              .where(eq(mandates.wallet, e.from));
            via = ruleIds.every((id) => id === 0)
              ? 'owner'
              : ruleIds.some((id) => payRules.some((p) => p.r === id))
                ? 'agent'
                : 'unknown';
          }
        }
        await db
          .insert(payments)
          .values({
            eventId: e.eventId,
            txHash: e.txHash,
            wallet: e.from,
            to: e.to,
            token: e.token,
            amount: e.amount.toString(),
            ledger: e.ledger,
            closedAt: new Date(e.closedAt),
            ruleIds,
            via,
          })
          .onConflictDoNothing();
        return;
      }
    }
  }

  function start(intervalMs: number): () => void {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => {
      if (stopped) return;
      let applied = 0;
      try {
        applied = await tick();
      } catch (err) {
        log('error', 'indexer tick failed', { error: errorText(err) });
      }
      // drain quickly while there is backlog
      timer = setTimeout(() => void loop(), applied >= PAGE ? 200 : intervalMs);
    };
    void loop();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }

  return { tick, start };
}
