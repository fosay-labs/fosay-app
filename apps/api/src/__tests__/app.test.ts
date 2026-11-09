import { TESTNET } from '@fosay/sdk';
import type { rpc } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { createApp } from '../app';
import { loadEnv } from '../env';
import { silentLogger } from '../log';

export const baseEnv = {
  DATABASE_URL: 'postgres://x',
  INDEXER_START_LEDGER: '5643488',
  STELLAR_RPC_URL: TESTNET.rpcUrl,
  STELLAR_NETWORK_PASSPHRASE: TESTNET.networkPassphrase,
  FOSAY_MANDATE_POLICY_ID: TESTNET.mandatePolicyId,
  FOSAY_APPROVALS_ID: TESTNET.approvalsId,
  USDC_SAC_ID: TESTNET.usdcId,
  OZ_ACCOUNT_WASM_HASH: TESTNET.accountWasmHash,
  OZ_WEBAUTHN_VERIFIER_ID: TESTNET.webauthnVerifierId,
  OZ_ED25519_VERIFIER_ID: TESTNET.ed25519VerifierId,
};

describe('api scaffold', () => {
  it('validates env with defaults and rejects bad secrets', () => {
    const { env, cfg } = loadEnv(baseEnv);
    expect(env.PORT).toBe(8787);
    expect(env.RELAYER_MAX_FEE_STROOPS).toBe(2_000_000);
    expect(cfg).toEqual(TESTNET);
    expect(() => loadEnv({ ...baseEnv, RELAYER_SECRET: 'nope' })).toThrow(/RELAYER_SECRET/);
    expect(() => loadEnv({ ...baseEnv, INDEXER_START_LEDGER: undefined })).toThrow(/INDEXER_START_LEDGER/);
  });

  it('serves /health', async () => {
    const { env, cfg } = loadEnv(baseEnv);
    const app = createApp({ env, cfg, server: {} as rpc.Server, log: silentLogger });
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, network: 'testnet' });
  });
});
