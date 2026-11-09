import { Address, scValToNative } from '@stellar/stellar-sdk';
import type { rpc, xdr } from '@stellar/stellar-sdk';

/**
 * The context rule ids a wallet's `AuthPayload` selected in a transaction, read from the
 * transaction envelope (fee bumps unwrapped). `null` if the tx can't be read or the wallet
 * didn't sign with an AuthPayload.
 */
export async function walletRuleIds(
  server: rpc.Server,
  txHash: string,
  wallet: string,
): Promise<number[] | null> {
  try {
    const tx = await server.getTransaction(txHash);
    if (tx.status !== 'SUCCESS') return null;
    return ruleIdsFromEnvelope(tx.envelopeXdr, wallet);
  } catch {
    return null;
  }
}

export function ruleIdsFromEnvelope(env: xdr.TransactionEnvelope, wallet: string): number[] | null {
  const kind = env.switch().name;
  const inner =
    kind === 'envelopeTypeTxFeeBump'
      ? env.feeBump().tx().innerTx().v1().tx()
      : kind === 'envelopeTypeTx'
        ? env.v1().tx()
        : null;
  if (!inner) return null;
  for (const op of inner.operations()) {
    if (op.body().switch().name !== 'invokeHostFunction') continue;
    for (const entry of op.body().invokeHostFunctionOp().auth()) {
      const creds = entry.credentials();
      if (creds.switch().name !== 'sorobanCredentialsAddress') continue;
      if (Address.fromScAddress(creds.address().address()).toString() !== wallet) continue;
      const payload = scValToNative(creds.address().signature()) as { context_rule_ids?: unknown } | null;
      const ids = payload?.context_rule_ids;
      if (Array.isArray(ids)) return ids.map(Number);
    }
  }
  return null;
}
