import {
  Address,
  Keypair,
  SorobanDataBuilder,
  StrKey,
  Transaction,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';
import { describe, expect, it, vi } from 'vitest';

import { AgentSigner } from '../auth';
import type { FosayClient, Mandate } from '../clients';
import { FosayClient as RealClient } from '../clients';
import { TESTNET } from '../config';
import { FosayError } from '../errors';
import { FosayExactStellarScheme } from '../x402/scheme';

const wallet = StrKey.encodeContract(Buffer.alloc(32, 5));
const payTo = Keypair.random().publicKey();
const agent = Keypair.random();
const id = { wallet, payRule: 1, askRule: 2 };
const LATEST = 1_000_000;

const mandate = (patch: Partial<Mandate> = {}): Mandate => ({
  token: TESTNET.usdcId,
  budget: 50_000_000n,
  periodLedgers: 17_280,
  maxPerTx: 20_000_000n,
  recipients: [],
  mandateHash: '00'.repeat(32),
  paused: false,
  ...patch,
});

function unsignedTransferEntry(amount: bigint): xdr.SorobanAuthorizationEntry {
  const real = new RealClient(TESTNET, {} as rpc.Server);
  const spec = real.transferInvoke(wallet, payTo, amount);
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: new Address(wallet).toScAddress(),
        nonce: xdr.Int64.fromString('777'),
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
}

function fakeSim(auth: xdr.SorobanAuthorizationEntry[]) {
  return {
    _parsed: true,
    id: '1',
    latestLedger: LATEST,
    events: [],
    minResourceFee: '18959',
    transactionData: new SorobanDataBuilder(),
    result: { auth, retval: xdr.ScVal.scvVoid() },
  };
}

function setup(m: Mandate = mandate(), remaining = 50_000_000n, amount = 10_000_000n) {
  const simulateTransaction = vi.fn(async () => fakeSim([unsignedTransferEntry(amount)]));
  const server = {
    simulateTransaction,
    getLatestLedger: async () => ({ sequence: LATEST }),
  } as unknown as rpc.Server;
  const real = new RealClient(TESTNET, server);
  const client = {
    cfg: TESTNET,
    server,
    getMandate: vi.fn(async () => m),
    remainingBudget: vi.fn(async () => remaining),
    transferInvoke: real.transferInvoke.bind(real),
  } as unknown as FosayClient;
  const scheme = new FosayExactStellarScheme(client, new AgentSigner(TESTNET, id, agent.secret()));
  return { scheme, simulateTransaction };
}

const req = (amount: bigint, patch: Record<string, unknown> = {}) => ({
  scheme: 'exact',
  network: 'stellar:testnet' as const,
  asset: TESTNET.usdcId,
  amount: amount.toString(),
  payTo,
  maxTimeoutSeconds: 120,
  extra: { areFeesSponsored: true },
  ...patch,
});

describe('FosayExactStellarScheme', () => {
  it('builds a facilitator-shaped payload signed by the agent under the pay rule', async () => {
    const { scheme, simulateTransaction } = setup();
    const out = await scheme.createPaymentPayload(2, req(10_000_000n));
    expect(out.x402Version).toBe(2);
    expect(simulateTransaction).toHaveBeenCalledTimes(2); // record, then enforce with signed auth

    const tx = new Transaction(
      (out.payload as { transaction: string }).transaction,
      TESTNET.networkPassphrase,
    );
    expect(tx.operations).toHaveLength(1);
    const op = tx.toEnvelope().v1().tx().operations()[0]!.body().invokeHostFunctionOp();
    const fn = op.hostFunction().invokeContract();
    expect(Address.fromScAddress(fn.contractAddress()).toString()).toBe(TESTNET.usdcId);
    expect(fn.functionName().toString()).toBe('transfer');
    expect(scValToNative(fn.args()[0]!)).toBe(wallet);

    const auth = op.auth();
    expect(auth).toHaveLength(1);
    const entry = auth[0]!;
    expect(entry.rootInvocation().subInvocations()).toHaveLength(0);
    const creds = entry.credentials().address();
    expect(Address.fromScAddress(creds.address()).toString()).toBe(wallet);
    expect(creds.signatureExpirationLedger()).toBe(LATEST + Math.ceil(120 / 5));
    const payload = scValToNative(creds.signature()) as { context_rule_ids: number[]; signers: unknown };
    expect(payload.context_rule_ids).toEqual([1]);
  });

  it('asks for approval instead of paying over the per-tx cap or budget', async () => {
    for (const [m, remaining, amount, reason] of [
      [mandate(), 50_000_000n, 30_000_000n, 'over_per_tx_cap'],
      [mandate(), 5_000_000n, 10_000_000n, 'over_budget'],
    ] as const) {
      const { scheme, simulateTransaction } = setup(m, remaining, amount);
      const err = await scheme.createPaymentPayload(2, req(amount)).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(FosayError);
      expect((err as FosayError).code).toBe('NEEDS_APPROVAL');
      expect((err as FosayError).details['reason']).toBe(reason);
      expect(scheme.lastError).toBe(err);
      expect(simulateTransaction).not.toHaveBeenCalled();
    }
  });

  it('refuses paused mandates, non-allowlisted recipients and bad requirements', async () => {
    const paused = setup(mandate({ paused: true }));
    await expect(paused.scheme.createPaymentPayload(2, req(1n))).rejects.toMatchObject({ code: 'Paused' });
    const allow = setup(mandate({ recipients: [Keypair.random().publicKey()] }));
    await expect(allow.scheme.createPaymentPayload(2, req(1n))).rejects.toMatchObject({
      code: 'RecipientNotAllowed',
    });
    const { scheme } = setup();
    for (const patch of [
      { asset: StrKey.encodeContract(Buffer.alloc(32, 8)) },
      { extra: {} },
      { network: 'stellar:pubnet' },
      { amount: '-1' },
      { payTo: 'nope' },
    ]) {
      await expect(scheme.createPaymentPayload(2, req(1n, patch))).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
    }
  });
});
