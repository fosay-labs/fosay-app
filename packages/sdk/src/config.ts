import { StrKey } from '@stellar/stellar-sdk';
import { z } from 'zod';

const contractId = z.string().refine((v) => StrKey.isValidContract(v), 'must be a C… contract address');
const hex32 = z.string().regex(/^[0-9a-f]{64}$/, 'must be a 64-char lowercase hex hash');

/** Network + contract configuration shared by every FOSAY component. */
export const fosayConfigSchema = z.object({
  network: z.enum(['testnet', 'mainnet']),
  rpcUrl: z.url(),
  networkPassphrase: z.string().min(1),
  mandatePolicyId: contractId,
  approvalsId: contractId,
  usdcId: contractId,
  accountWasmHash: hex32,
  webauthnVerifierId: contractId,
  ed25519VerifierId: contractId,
});

export type FosayConfig = z.infer<typeof fosayConfigSchema>;

/** Testnet deployment (fosay-contract `deployments/testnet.json`, 2026-11-09). */
export const TESTNET: FosayConfig = {
  network: 'testnet',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  mandatePolicyId: 'CABMDEJEXOIBR4F6TDIYQ7CA5GFENXAYDRA4WH7V4QR7PAMTFIEQWWQ5',
  approvalsId: 'CAZDF7XQSKLZK5JG4FPCG6ZSGK3C4ZGNBKHU3VYDPQSZWLX2HPRXJCIU',
  usdcId: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
  accountWasmHash: 'c514d35ea67eaea9bfc1fb3327854c0c06111bc1ddebd4fe217c504c1004b9e1',
  webauthnVerifierId: 'CC7EKIHQP3TN4CARQDND6CEOY2UXLWWC2X5GHTD5NLAT7BG5GPZIOM3F',
  ed25519VerifierId: 'CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4',
};

type Env = Record<string, string | undefined>;

/**
 * Reads config from environment variables (names in `.env.example`), with an optional
 * prefix such as `NEXT_PUBLIC_`. Throws a readable error listing every bad variable.
 */
export function loadConfigFromEnv(env: Env, prefix = ''): FosayConfig {
  const get = (name: string) => env[`${prefix}${name}`];
  const raw = {
    network: get('STELLAR_NETWORK') ?? 'testnet',
    rpcUrl: get('STELLAR_RPC_URL'),
    networkPassphrase: get('STELLAR_NETWORK_PASSPHRASE'),
    mandatePolicyId: get('FOSAY_MANDATE_POLICY_ID'),
    approvalsId: get('FOSAY_APPROVALS_ID'),
    usdcId: get('USDC_SAC_ID'),
    accountWasmHash: get('OZ_ACCOUNT_WASM_HASH'),
    webauthnVerifierId: get('OZ_WEBAUTHN_VERIFIER_ID'),
    ed25519VerifierId: get('OZ_ED25519_VERIFIER_ID'),
  };
  const parsed = fosayConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const names: Record<string, string> = {
      network: 'STELLAR_NETWORK',
      rpcUrl: 'STELLAR_RPC_URL',
      networkPassphrase: 'STELLAR_NETWORK_PASSPHRASE',
      mandatePolicyId: 'FOSAY_MANDATE_POLICY_ID',
      approvalsId: 'FOSAY_APPROVALS_ID',
      usdcId: 'USDC_SAC_ID',
      accountWasmHash: 'OZ_ACCOUNT_WASM_HASH',
      webauthnVerifierId: 'OZ_WEBAUTHN_VERIFIER_ID',
      ed25519VerifierId: 'OZ_ED25519_VERIFIER_ID',
    };
    const lines = parsed.error.issues.map((i) => {
      const key = String(i.path[0] ?? '');
      return `  ${prefix}${names[key] ?? key}: ${i.message}`;
    });
    throw new Error(`Invalid FOSAY configuration:\n${lines.join('\n')}`);
  }
  return parsed.data;
}
