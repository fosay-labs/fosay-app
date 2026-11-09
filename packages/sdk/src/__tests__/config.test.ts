import { describe, expect, it } from 'vitest';

import { TESTNET, fosayConfigSchema, loadConfigFromEnv } from '../config';

const env = {
  STELLAR_NETWORK: 'testnet',
  STELLAR_RPC_URL: TESTNET.rpcUrl,
  STELLAR_NETWORK_PASSPHRASE: TESTNET.networkPassphrase,
  FOSAY_MANDATE_POLICY_ID: TESTNET.mandatePolicyId,
  FOSAY_APPROVALS_ID: TESTNET.approvalsId,
  USDC_SAC_ID: TESTNET.usdcId,
  OZ_ACCOUNT_WASM_HASH: TESTNET.accountWasmHash,
  OZ_WEBAUTHN_VERIFIER_ID: TESTNET.webauthnVerifierId,
  OZ_ED25519_VERIFIER_ID: TESTNET.ed25519VerifierId,
};

describe('config', () => {
  it('TESTNET preset is valid', () => {
    expect(fosayConfigSchema.parse(TESTNET)).toEqual(TESTNET);
  });

  it('loads from env, with and without a prefix', () => {
    expect(loadConfigFromEnv(env)).toEqual(TESTNET);
    const pub = Object.fromEntries(Object.entries(env).map(([k, v]) => [`NEXT_PUBLIC_${k}`, v]));
    expect(loadConfigFromEnv(pub, 'NEXT_PUBLIC_')).toEqual(TESTNET);
  });

  it('names every invalid variable', () => {
    expect(() =>
      loadConfigFromEnv({ ...env, FOSAY_APPROVALS_ID: 'nope', OZ_ACCOUNT_WASM_HASH: 'xyz' }),
    ).toThrow(/FOSAY_APPROVALS_ID[\s\S]*OZ_ACCOUNT_WASM_HASH|OZ_ACCOUNT_WASM_HASH[\s\S]*FOSAY_APPROVALS_ID/);
  });
});
