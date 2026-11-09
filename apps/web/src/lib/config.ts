import { TESTNET, fosayConfigSchema } from '@fosay/sdk';
import type { FosayConfig } from '@fosay/sdk';

// Next.js inlines NEXT_PUBLIC_* only when referenced literally, so each one is spelled out.
// Missing values fall back to the FOSAY testnet deployment.
export const publicConfig: FosayConfig = fosayConfigSchema.parse({
  network: process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? TESTNET.network,
  rpcUrl: process.env.NEXT_PUBLIC_STELLAR_RPC_URL ?? TESTNET.rpcUrl,
  networkPassphrase: process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE ?? TESTNET.networkPassphrase,
  mandatePolicyId: process.env.NEXT_PUBLIC_FOSAY_MANDATE_POLICY_ID ?? TESTNET.mandatePolicyId,
  approvalsId: process.env.NEXT_PUBLIC_FOSAY_APPROVALS_ID ?? TESTNET.approvalsId,
  usdcId: process.env.NEXT_PUBLIC_USDC_SAC_ID ?? TESTNET.usdcId,
  accountWasmHash: process.env.NEXT_PUBLIC_OZ_ACCOUNT_WASM_HASH ?? TESTNET.accountWasmHash,
  webauthnVerifierId: process.env.NEXT_PUBLIC_OZ_WEBAUTHN_VERIFIER_ID ?? TESTNET.webauthnVerifierId,
  ed25519VerifierId: process.env.NEXT_PUBLIC_OZ_ED25519_VERIFIER_ID ?? TESTNET.ed25519VerifierId,
});

/** Path the app is served under (`/fosay-app` on GitHub Pages, empty locally). */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '');

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787').replace(/\/$/, '');
export const RELAYER_URL = process.env.NEXT_PUBLIC_RELAYER_URL ?? `${API_URL}/relay`;
/** Ledgers per day at ~5 s per ledger. */
export const LEDGERS_PER_DAY = 17_280;
