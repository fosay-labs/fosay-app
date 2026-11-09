import { FosayClient, FosayError } from '@fosay/sdk';
import type { contract } from '@stellar/stellar-sdk';
import { SmartAccountKit } from 'smart-account-kit';

import { RELAYER_URL, publicConfig } from './config';

/** Owner rule on every FOSAY wallet (the passkey, `Default` context). */
export const OWNER_RULE = 0;

let kit: SmartAccountKit | null = null;
let reader: FosayClient | null = null;

/** The passkey wallet kit (browser only). Transactions are fee-sponsored by the FOSAY relayer. */
export function getKit(): SmartAccountKit {
  if (typeof window === 'undefined') throw new Error('SmartAccountKit is browser-only');
  kit ??= new SmartAccountKit({
    rpcUrl: publicConfig.rpcUrl,
    networkPassphrase: publicConfig.networkPassphrase,
    accountWasmHash: publicConfig.accountWasmHash,
    webauthnVerifierAddress: publicConfig.webauthnVerifierId,
    ed25519VerifierAddress: publicConfig.ed25519VerifierId,
    relayerUrl: RELAYER_URL,
    rpName: 'FOSAY',
  });
  return kit;
}

/** Read-only contract access (no wallet needed). */
export function getReader(): FosayClient {
  reader ??= new FosayClient(publicConfig);
  return reader;
}

/** Restores a stored session without prompting; returns the wallet address or null. */
export async function restoreWallet(): Promise<string | null> {
  const k = getKit();
  if (k.isConnected) return k.contractId ?? null;
  const r = await k.connectWallet({ prompt: false });
  return r?.contractId ?? null;
}

/** Asks for the passkey to connect an existing wallet. */
export async function connectWithPasskey(): Promise<string> {
  const r = await getKit().connectWallet({ prompt: true, fresh: true });
  if (!r?.contractId) throw new FosayError('INVALID_INPUT', 'no FOSAY wallet found for that passkey');
  return r.contractId;
}

export function requireWallet(): string {
  const id = getKit().contractId;
  if (!id) throw new FosayError('INVALID_INPUT', 'connect your wallet first');
  return id;
}

function check(r: Awaited<ReturnType<SmartAccountKit['signAndSubmit']>>): string {
  if (!r.success) throw new FosayError('TX_FAILED', r.error.message);
  return r.hash;
}

/** Passkey-signs and submits a non-admin call with explicit context rule ids. */
export async function signAndSubmit<T>(
  tx: contract.AssembledTransaction<T>,
  ruleIds: number[],
): Promise<string> {
  return check(await getKit().signAndSubmit(tx, { resolveContextRuleIds: () => ruleIds }));
}

/** Passkey-signs and submits a wallet admin operation (rule changes) under the owner rule. */
export async function signAndSubmitAdmin<T>(tx: contract.AssembledTransaction<T>): Promise<string> {
  return check(await getKit().signAndSubmitAdmin(tx));
}
