import { TESTNET } from '@fosay/sdk';
import {
  Account,
  Address,
  Keypair,
  SorobanDataBuilder,
  StrKey,
  nativeToScVal,
  xdr,
} from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';
import { describe, expect, it, vi } from 'vitest';

import { clientIp } from '../relayer/ratelimit';
import { relayerRoutes } from '../relayer/route';
import { silentLogger } from '../log';

const relayer = Keypair.random();
const wallet = StrKey.encodeContract(Buffer.alloc(32, 1));

function fakeServer(opts: { simError?: string; fee?: string } = {}) {
  let seq = 100n;
  return {
    getAccount: vi.fn(async () => new Account(relayer.publicKey(), (seq++).toString())),
    simulateTransaction: vi.fn(async () =>
      opts.simError
        ? { id: '1', latestLedger: 1, events: [], error: opts.simError, _parsed: true }
        : {
            id: '1',
            latestLedger: 1,
            events: [],
            _parsed: true,
            minResourceFee: opts.fee ?? '15000',
            transactionData: new SorobanDataBuilder(),
            result: { auth: [], retval: xdr.ScVal.scvVoid() },
          },
    ),
    sendTransaction: vi.fn(async () => ({ status: 'PENDING', hash: 'h'.repeat(64) })),
    pollTransaction: vi.fn(async () => ({ status: 'SUCCESS' })),
  };
}

function routes(
  server: ReturnType<typeof fakeServer>,
  limits = { perIpPerMinute: 100, perWalletPerMinute: 100 },
) {
  return relayerRoutes({
    cfg: TESTNET,
    server: server as unknown as rpc.Server,
    secret: relayer.secret(),
    maxFeeStroops: 2_000_000,
    log: silentLogger,
    wasmHashOf: async (id) => (id === wallet ? TESTNET.accountWasmHash : null),
    limits,
  });
}

const executeFunc = xdr.HostFunction.hostFunctionTypeInvokeContract(
  new xdr.InvokeContractArgs({
    contractAddress: new Address(TESTNET.approvalsId).toScAddress(),
    functionName: 'execute',
    args: [nativeToScVal(1n, { type: 'u64' })],
  }),
).toXDR('base64');
const uploadFunc = xdr.HostFunction.hostFunctionTypeUploadContractWasm(Buffer.alloc(8)).toXDR('base64');
const post = (r: ReturnType<typeof routes>, body: unknown) =>
  r.request('/', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

describe('relayer route', () => {
  it('relays a FOSAY call and answers in smart-account-kit format', async () => {
    const s = fakeServer();
    const res = await post(routes(s), { func: executeFunc, auth: [] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { hash: 'h'.repeat(64), status: 'SUCCESS' } });
    expect(s.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it('refuses non-FOSAY calls, bad bodies and fee bumps', async () => {
    const r = routes(fakeServer());
    expect((await post(r, { func: uploadFunc, auth: [] })).status).toBe(403);
    expect((await post(r, { func: 'garbage', auth: [] })).status).toBe(400);
    expect((await post(r, { func: executeFunc })).status).toBe(400);
    const bump = await post(r, { xdr: 'AAAA' });
    expect(bump.status).toBe(400);
    expect(await bump.json()).toMatchObject({ success: false, errorCode: 'UNSUPPORTED' });
  });

  it('reports decoded simulation errors and the fee cap', async () => {
    const failing = await post(routes(fakeServer({ simError: 'HostError: Error(Contract, #4201)' })), {
      func: executeFunc,
      auth: [],
    });
    expect(failing.status).toBe(400);
    expect(await failing.json()).toMatchObject({
      errorCode: 'SIMULATION_FAILED',
      message: expect.stringMatching(/NotPending/),
    });
    const pricey = await post(routes(fakeServer({ fee: '5000000' })), { func: executeFunc, auth: [] });
    expect(await pricey.json()).toMatchObject({ errorCode: 'FEE_TOO_HIGH' });
  });

  it('rate-limits per IP and serializes submissions', async () => {
    const s = fakeServer();
    const r = routes(s, { perIpPerMinute: 2, perWalletPerMinute: 100 });
    const results = await Promise.all([
      post(r, { func: executeFunc, auth: [] }),
      post(r, { func: executeFunc, auth: [] }),
    ]);
    expect(results.map((x) => x.status)).toEqual([200, 200]);
    const seqs = s.getAccount.mock.results.length;
    expect(seqs).toBe(2);
    expect((await post(r, { func: executeFunc, auth: [] })).status).toBe(429);
  });

  it('reads the client address from the trusted end of X-Forwarded-For', () => {
    const h = (xff?: string, extra: Record<string, string> = {}) => (n: string) =>
      n === 'x-forwarded-for' ? xff : extra[n];
    expect(clientIp(h('6.6.6.6, 1.2.3.4'), 1)).toBe('1.2.3.4'); // forged left entry ignored
    expect(clientIp(h('1.2.3.4, 10.0.0.1'), 2)).toBe('1.2.3.4');
    expect(clientIp(h('1.2.3.4'), 3)).toBe('1.2.3.4');
    expect(clientIp(h(undefined), 1)).toBe('local');
    expect(clientIp(h('6.6.6.6', { 'cf-connecting-ip': '9.9.9.9' }), 1, 'cf-connecting-ip')).toBe('9.9.9.9');
  });
});
