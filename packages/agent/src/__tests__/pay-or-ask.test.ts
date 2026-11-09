import { FosayClient, TESTNET } from '@fosay/sdk';
import type { Mandate } from '@fosay/sdk';
import { Address, Keypair, SorobanDataBuilder, StrKey, xdr } from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';
import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http';
import { describe, expect, it, vi } from 'vitest';

import { FosayAgent, clampMemo } from '../agent';
import { fosayFetch } from '../fetch';

const wallet = StrKey.encodeContract(Buffer.alloc(32, 3));
const payTo = Keypair.random().publicKey();
const identity = { wallet, payRule: 1, askRule: 2 };
const URL_ = 'https://api.example.com/report';

const mandate = (patch: Partial<Mandate> = {}): Mandate => ({
  token: TESTNET.usdcId,
  budget: 50_000_000n,
  periodLedgers: 17_280,
  maxPerTx: 20_000_000n,
  recipients: [],
  mandateHash: 'ab'.repeat(32),
  paused: false,
  ...patch,
});

function makeAgent(m: Mandate, remaining: bigint) {
  const real = new FosayClient(TESTNET, {} as rpc.Server);
  const entryFor = (amount: bigint) => {
    const spec = real.transferInvoke(wallet, payTo, amount);
    return new xdr.SorobanAuthorizationEntry({
      credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
        new xdr.SorobanAddressCredentials({
          address: new Address(wallet).toScAddress(),
          nonce: xdr.Int64.fromString('1'),
          signatureExpirationLedger: 0,
          signature: xdr.ScVal.scvVoid(),
        }),
      ),
      rootInvocation: new xdr.SorobanAuthorizedInvocation({
        function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
          new xdr.InvokeContractArgs({
            contractAddress: new Address(spec.contract).toScAddress(),
            functionName: spec.fn,
            args: spec.args,
          }),
        ),
        subInvocations: [],
      }),
    });
  };
  const server = {
    simulateTransaction: vi.fn(async () => ({
      _parsed: true,
      id: '1',
      latestLedger: 100,
      events: [],
      minResourceFee: '18959',
      transactionData: new SorobanDataBuilder(),
      result: { auth: [entryFor(10_000_000n)], retval: xdr.ScVal.scvVoid() },
    })),
    getLatestLedger: async () => ({ sequence: 100 }),
  } as unknown as rpc.Server;
  const client = Object.assign(new FosayClient(TESTNET, server), {
    getMandate: vi.fn(async () => m),
    remainingBudget: vi.fn(async () => remaining),
  });
  const agent = new FosayAgent({ cfg: TESTNET, identity, secret: Keypair.random().secret(), client });
  const propose = vi.spyOn(agent, 'propose').mockResolvedValue({ intentId: 9n, hash: 'ab12' });
  return { agent, propose, server };
}

function paywall(amount: bigint) {
  const required = encodePaymentRequiredHeader({
    x402Version: 2,
    resource: { url: URL_, description: 'report', mimeType: 'application/json' },
    accepts: [
      {
        scheme: 'exact',
        network: 'stellar:testnet',
        asset: TESTNET.usdcId,
        amount: amount.toString(),
        payTo,
        maxTimeoutSeconds: 120,
        extra: { areFeesSponsored: true },
      },
    ],
  });
  const settlement = encodePaymentResponseHeader({
    success: true,
    transaction: 'f00d',
    network: 'stellar:testnet',
    payer: wallet,
  });
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    // the x402 wrapper retries with a Request object that carries the payment header
    const headers = input instanceof Request ? input.headers : new Headers(init?.headers);
    if (headers.get('PAYMENT-SIGNATURE')) {
      return new Response('{"ok":true}', { status: 200, headers: { 'PAYMENT-RESPONSE': settlement } });
    }
    return new Response('{}', { status: 402, headers: { 'PAYMENT-REQUIRED': required } });
  });
}

describe('fosayFetch pay-or-ask', () => {
  it('pays when the 402 fits the mandate', async () => {
    const { agent, propose } = makeAgent(mandate(), 50_000_000n);
    const fetchImpl = paywall(10_000_000n);
    const r = await fosayFetch(agent, URL_, {}, { fetchImpl });
    expect(r.kind).toBe('response');
    if (r.kind !== 'response') return;
    expect(r.paid).toBe(true);
    expect(r.transaction).toBe('f00d');
    expect(await r.response.json()).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(propose).not.toHaveBeenCalled();
  });

  it('asks the owner when over the per-tx cap, the budget or the call cap', async () => {
    for (const [m, remaining, amount, opts, reason] of [
      [mandate(), 50_000_000n, 30_000_000n, {}, 'over_per_tx_cap'],
      [mandate(), 5_000_000n, 10_000_000n, {}, 'over_budget'],
      [mandate(), 50_000_000n, 10_000_000n, { maxAmount: 1_000_000n }, 'over_call_cap'],
    ] as const) {
      const { agent, propose } = makeAgent(m, remaining);
      const fetchImpl = paywall(amount);
      const r = await fosayFetch(agent, URL_, { method: 'post' }, { ...opts, fetchImpl });
      expect(r).toMatchObject({ kind: 'approval_requested', intentId: 9n, amount, payTo, reason });
      expect(propose).toHaveBeenCalledWith({ to: payTo, amount, memo: `x402 POST ${URL_}` });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it('surfaces paused mandates instead of asking', async () => {
    const { agent, propose } = makeAgent(mandate({ paused: true }), 50_000_000n);
    await expect(fosayFetch(agent, URL_, {}, { fetchImpl: paywall(1n) })).rejects.toMatchObject({
      code: 'Paused',
    });
    expect(propose).not.toHaveBeenCalled();
  });

  it('passes through responses that need no payment', async () => {
    const { agent } = makeAgent(mandate(), 50_000_000n);
    const fetchImpl = vi.fn(async () => new Response('free', { status: 200 }));
    const r = await fosayFetch(agent, URL_, {}, { fetchImpl });
    expect(r).toMatchObject({ kind: 'response', paid: false });
  });
});

describe('clampMemo', () => {
  it('keeps memos within 140 UTF-8 bytes without splitting characters', () => {
    expect(clampMemo('short')).toBe('short');
    const long = 'é'.repeat(100); // 200 bytes
    const c = clampMemo(long);
    expect(Buffer.byteLength(c, 'utf8')).toBeLessThanOrEqual(140);
    expect(c).toBe('é'.repeat(70));
  });
});
