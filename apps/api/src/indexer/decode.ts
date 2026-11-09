import type { FosayConfig } from '@fosay/sdk';
import { scValToNative } from '@stellar/stellar-sdk';
import type { xdr } from '@stellar/stellar-sdk';

/** What the indexer needs from an RPC event (parsed `getEvents` shape). */
export interface RawEvent {
  id: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
  contractId: string;
  topic: xdr.ScVal[];
  value: xdr.ScVal;
  inSuccessfulContractCall?: boolean;
}

interface Meta {
  eventId: string;
  ledger: number;
  closedAt: string;
  txHash: string;
}

export type FosayEvent = Meta &
  (
    | {
        kind: 'intent_proposed';
        account: string;
        id: bigint;
        token: string;
        to: string;
        amount: bigint;
        mandateHash: string;
        memo: string;
        expiresLedger: number;
      }
    | { kind: 'intent_executed'; account: string; id: bigint; to: string; amount: bigint }
    | { kind: 'intent_cancelled' | 'intent_expired'; account: string; id: bigint }
    | {
        kind: 'mandate_installed';
        wallet: string;
        ruleId: number;
        token: string;
        budget: bigint;
        periodLedgers: number;
        maxPerTx: bigint;
        recipients: string[];
        mandateHash: string;
      }
    | {
        kind: 'mandate_updated';
        wallet: string;
        ruleId: number;
        budget: bigint;
        maxPerTx: bigint;
        recipients: string[];
        mandateHash: string;
      }
    | { kind: 'mandate_paused'; wallet: string; ruleId: number; paused: boolean }
    | { kind: 'mandate_uninstalled'; wallet: string; ruleId: number }
    | { kind: 'transfer'; token: string; from: string; to: string; amount: bigint }
  );

const hex = (v: unknown) => Buffer.from(v as Uint8Array).toString('hex');
const native = (v: xdr.ScVal | undefined): unknown => (v === undefined ? undefined : scValToNative(v));

function topicName(e: RawEvent): string | undefined {
  const t = e.topic[0];
  return t && t.switch().name === 'scvSymbol' ? t.sym().toString() : undefined;
}

function dataMap(e: RawEvent): Record<string, unknown> {
  const v = native(e.value);
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * Decodes events of the FOSAY contracts and the token. Returns `null` for events the
 * indexer doesn't track (other contracts, mint/burn/approve, failed calls).
 */
export function decodeEvent(
  cfg: Pick<FosayConfig, 'approvalsId' | 'mandatePolicyId'>,
  token: string,
  e: RawEvent,
): FosayEvent | null {
  if (e.inSuccessfulContractCall === false) return null;
  const name = topicName(e);
  const meta: Meta = { eventId: e.id, ledger: e.ledger, closedAt: e.ledgerClosedAt, txHash: e.txHash };
  const t1 = native(e.topic[1]);
  const t2 = native(e.topic[2]);

  if (e.contractId === cfg.approvalsId) {
    const account = String(t1);
    const id = BigInt(t2 as bigint);
    const d = dataMap(e);
    switch (name) {
      case 'intent_proposed':
        return {
          ...meta,
          kind: name,
          account,
          id,
          token: String(d['token']),
          to: String(d['to']),
          amount: BigInt(d['amount'] as bigint),
          mandateHash: hex(d['mandate_hash']),
          memo: String(d['memo']),
          expiresLedger: Number(d['expires_ledger']),
        };
      case 'intent_executed':
        return {
          ...meta,
          kind: name,
          account,
          id,
          to: String(d['to']),
          amount: BigInt(d['amount'] as bigint),
        };
      case 'intent_cancelled':
      case 'intent_expired':
        return { ...meta, kind: name, account, id };
      default:
        return null;
    }
  }

  if (e.contractId === cfg.mandatePolicyId) {
    const wallet = String(t1);
    const ruleId = Number(t2);
    const d = dataMap(e);
    const recipients = () => ((d['recipients'] as unknown[] | undefined) ?? []).map(String);
    switch (name) {
      case 'mandate_installed':
        return {
          ...meta,
          kind: name,
          wallet,
          ruleId,
          token: String(d['token']),
          budget: BigInt(d['budget'] as bigint),
          periodLedgers: Number(d['period_ledgers']),
          maxPerTx: BigInt(d['max_per_tx'] as bigint),
          recipients: recipients(),
          mandateHash: hex(d['mandate_hash']),
        };
      case 'mandate_updated':
        return {
          ...meta,
          kind: name,
          wallet,
          ruleId,
          budget: BigInt(d['budget'] as bigint),
          maxPerTx: BigInt(d['max_per_tx'] as bigint),
          recipients: recipients(),
          mandateHash: hex(d['mandate_hash']),
        };
      case 'mandate_paused':
        return { ...meta, kind: name, wallet, ruleId, paused: Boolean(d['paused']) };
      case 'mandate_uninstalled':
        return { ...meta, kind: name, wallet, ruleId };
      default:
        return null;
    }
  }

  if (e.contractId === token && name === 'transfer') {
    // CAP-67: data is the i128 amount, or { amount, to_muxed_id } for muxed recipients
    const v = native(e.value);
    const amount =
      typeof v === 'bigint'
        ? v
        : BigInt(((v as Record<string, unknown> | undefined)?.['amount'] ?? 0n) as bigint);
    return { ...meta, kind: 'transfer', token, from: String(t1), to: String(t2), amount };
  }
  return null;
}
