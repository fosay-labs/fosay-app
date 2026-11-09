import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TESTNET } from '@fosay/sdk';
import { xdr } from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { ruleIdsFromEnvelope } from '../indexer/attribution';
import {
  EXTEND_TO_LEDGERS,
  RENEW_BELOW_LEDGERS,
  codeKey,
  codeKeysOf,
  extendOp,
  instanceKey,
  mandateKey,
  needsRenewal,
  ozKeys,
} from '../keeper/ttl';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/testnet-envelopes.json'), 'utf8')) as {
  wallet: string;
  agentX402Payment: string;
  ownerApproval: string;
};

describe('payment attribution from real testnet envelopes', () => {
  it('reads the agent rule from an x402 payment settled by the facilitator', () => {
    const e = xdr.TransactionEnvelope.fromXDR(env.agentX402Payment, 'base64');
    expect(ruleIdsFromEnvelope(e, env.wallet)).toEqual([1]);
  });
  it('reads [0, 0] from an owner-approved execute', () => {
    const e = xdr.TransactionEnvelope.fromXDR(env.ownerApproval, 'base64');
    expect(ruleIdsFromEnvelope(e, env.wallet)).toEqual([0, 0]);
  });
  it('returns null for other wallets', () => {
    const e = xdr.TransactionEnvelope.fromXDR(env.ownerApproval, 'base64');
    expect(ruleIdsFromEnvelope(e, TESTNET.approvalsId)).toBeNull();
  });
});

describe('keeper decisions', () => {
  const wallet = env.wallet;
  const entry = (key: xdr.LedgerKey, liveUntil: number, val?: xdr.LedgerEntryData) =>
    ({
      key,
      liveUntilLedgerSeq: liveUntil,
      val: val ?? (undefined as unknown as xdr.LedgerEntryData),
    }) as rpc.Api.LedgerEntryResult;

  it('renews only entries under the threshold, once each', () => {
    const latest = 1_000_000;
    const low = ozKeys.rule(wallet, 1);
    const high = ozKeys.signer(wallet, 1);
    const r = needsRenewal(
      [
        entry(low, latest + RENEW_BELOW_LEDGERS - 1),
        entry(high, latest + RENEW_BELOW_LEDGERS + 10),
        entry(low, latest + 5),
      ],
      latest,
    );
    expect(r.map((k) => k.toXDR('base64'))).toEqual([low.toXDR('base64')]);
  });

  it('finds code entries behind contract instances', () => {
    const inst = new xdr.ScContractInstance({
      executable: xdr.ContractExecutable.contractExecutableWasm(Buffer.from(TESTNET.accountWasmHash, 'hex')),
      storage: null,
    });
    const data = xdr.LedgerEntryData.contractData(
      new xdr.ContractDataEntry({
        ext: new xdr.ExtensionPoint(0),
        contract: instanceKey(wallet).contractData().contract(),
        key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent(),
        val: xdr.ScVal.scvContractInstance(inst),
      }),
    );
    expect(codeKeysOf([entry(instanceKey(wallet), 1, data)]).map((k) => k.toXDR('base64'))).toEqual([
      codeKey(TESTNET.accountWasmHash).toXDR('base64'),
    ]);
  });

  it('builds one read-only ExtendFootprintTTL to 31 days', () => {
    const keys = [ozKeys.rule(wallet, 0), mandateKey(TESTNET.mandatePolicyId, wallet, 1)];
    const { op, sorobanData } = extendOp(keys);
    expect(op.body().switch().name).toBe('extendFootprintTtl');
    expect(op.body().extendFootprintTtlOp().extendTo()).toBe(EXTEND_TO_LEDGERS);
    expect(sorobanData.resources().footprint().readOnly()).toHaveLength(2);
    expect(sorobanData.resources().footprint().readWrite()).toHaveLength(0);
  });
});
