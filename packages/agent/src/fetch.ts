import { FosayError } from '@fosay/sdk';
import { FosayExactStellarScheme, createFosayX402Client } from '@fosay/sdk/x402';
import type { PaymentPreflight } from '@fosay/sdk/x402';
import { decodePaymentResponseHeader, wrapFetchWithPayment } from '@x402/fetch';

import type { FosayAgent } from './agent';

export type FosayFetchResult =
  | { kind: 'response'; response: Response; paid: boolean; transaction?: string }
  | {
      kind: 'approval_requested';
      intentId: bigint;
      hash: string;
      amount: bigint;
      payTo: string;
      reason: PaymentPreflight['reason'];
    };

export interface FosayFetchOptions {
  /** Refuse (and ask instead) for any single payment above this, in base units. */
  maxAmount?: bigint;
  /** Memo for the approval request; defaults to the method and URL. */
  memo?: string;
  ttlLedgers?: number;
  /** Underlying fetch (default: globalThis.fetch). */
  fetchImpl?: typeof globalThis.fetch;
}

/** Walks `cause` chains: x402 may wrap errors thrown by the scheme. */
export function findFosayError(e: unknown): FosayError | undefined {
  let cur: unknown = e;
  for (let i = 0; i < 8 && cur; i++) {
    if (cur instanceof FosayError) return cur;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * `fetch` that pays HTTP 402 (x402 `exact` on Stellar) from the FOSAY wallet when the
 * payment fits the mandate, and otherwise opens an approval request for the owner.
 */
export async function fosayFetch(
  agent: FosayAgent,
  input: string | URL,
  init: RequestInit = {},
  opts: FosayFetchOptions = {},
): Promise<FosayFetchResult> {
  const scheme = new FosayExactStellarScheme(
    agent.client,
    agent.signer,
    opts.maxAmount === undefined ? {} : { maxAmountPerCall: opts.maxAmount },
  );
  const paidFetch = wrapFetchWithPayment(opts.fetchImpl ?? globalThis.fetch, createFosayX402Client(scheme));
  try {
    const response = await paidFetch(input, init);
    const header = response.headers.get('PAYMENT-RESPONSE') ?? response.headers.get('X-PAYMENT-RESPONSE');
    if (!header) return { kind: 'response', response, paid: false };
    const settlement = decodePaymentResponseHeader(header);
    return { kind: 'response', response, paid: true, transaction: settlement.transaction };
  } catch (e) {
    const fe = findFosayError(e) ?? scheme.lastError;
    if (!fe || fe.code !== 'NEEDS_APPROVAL') throw fe ?? e;
    const d = fe.details as unknown as PaymentPreflight;
    const method = (init.method ?? 'GET').toUpperCase();
    const memo = opts.memo ?? `x402 ${method} ${String(input)}`;
    const { intentId, hash } = await agent.propose({
      to: d.payTo,
      amount: d.amount,
      memo,
      ...(opts.ttlLedgers === undefined ? {} : { ttlLedgers: opts.ttlLedgers }),
    });
    return { kind: 'approval_requested', intentId, hash, amount: d.amount, payTo: d.payTo, reason: d.reason };
  }
}
