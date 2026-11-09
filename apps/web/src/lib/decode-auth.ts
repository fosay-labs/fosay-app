import { Address, scValToNative } from '@stellar/stellar-sdk';
import type { xdr } from '@stellar/stellar-sdk';

/** What the owner's passkey will authorize when approving a request. */
export interface DecodedApproval {
  intentId: bigint;
  token: string;
  from: string;
  to: string;
  amount: bigint;
}

function call(inv: xdr.SorobanAuthorizedInvocation) {
  const fn = inv.function();
  if (fn.switch().name !== 'sorobanAuthorizedFunctionTypeContractFn') throw new Error('not a contract call');
  const c = fn.contractFn();
  return {
    contract: Address.fromScAddress(c.contractAddress()).toString(),
    name: c.functionName().toString(),
    args: c.args().map((a) => scValToNative(a) as unknown),
  };
}

function walletEntries(entries: xdr.SorobanAuthorizationEntry[], wallet: string) {
  return entries.filter((e) => {
    const c = e.credentials();
    return (
      c.switch().name === 'sorobanCredentialsAddress' &&
      Address.fromScAddress(c.address().address()).toString() === wallet
    );
  });
}

/**
 * Decodes the wallet's auth entry for `approvals.execute(id)` and checks its shape:
 * exactly one entry for the wallet, rooted at `execute(intentId)` on the approvals
 * contract, with exactly one sub-invocation `token.transfer(wallet, to, amount)`.
 * Throws if the entry authorizes anything else.
 */
export function decodeApprovalAuth(
  entries: xdr.SorobanAuthorizationEntry[],
  expected: { wallet: string; approvalsId: string; intentId: bigint },
): DecodedApproval {
  const mine = walletEntries(entries, expected.wallet);
  if (mine.length !== 1) throw new Error(`expected 1 authorization for the wallet, found ${mine.length}`);
  const [entry] = mine;
  if (!entry) throw new Error('missing authorization');
  const root = entry.rootInvocation();
  const r = call(root);
  if (r.contract !== expected.approvalsId || r.name !== 'execute')
    throw new Error(`authorization is for ${r.name} on ${r.contract}`);
  if (BigInt(r.args[0] as bigint) !== expected.intentId)
    throw new Error(`authorization is for request #${String(r.args[0])}`);
  const subs = root.subInvocations();
  if (subs.length !== 1 || !subs[0])
    throw new Error(`expected exactly one nested payment, found ${subs.length}`);
  const t = call(subs[0]);
  if (t.name !== 'transfer' || t.args.length !== 3)
    throw new Error(`nested call is ${t.name}, not a transfer`);
  if (subs[0].subInvocations().length > 0) throw new Error('nested payment has further calls');
  const from = String(t.args[0]);
  if (from !== expected.wallet) throw new Error('payment is not from this wallet');
  return {
    intentId: expected.intentId,
    token: t.contract,
    from,
    to: String(t.args[1]),
    amount: BigInt(t.args[2] as bigint),
  };
}

/** Decodes the wallet's auth entry for `approvals.cancel(id)` (no nested calls allowed). */
export function decodeCancelAuth(
  entries: xdr.SorobanAuthorizationEntry[],
  expected: { wallet: string; approvalsId: string; intentId: bigint },
): void {
  const mine = walletEntries(entries, expected.wallet);
  if (mine.length !== 1 || !mine[0])
    throw new Error(`expected 1 authorization for the wallet, found ${mine.length}`);
  const r = call(mine[0].rootInvocation());
  if (
    r.contract !== expected.approvalsId ||
    r.name !== 'cancel' ||
    BigInt(r.args[0] as bigint) !== expected.intentId
  ) {
    throw new Error(`authorization is for ${r.name}(${String(r.args[0])})`);
  }
  if (mine[0].rootInvocation().subInvocations().length > 0)
    throw new Error('reject must not include other calls');
}

/** Differences between what will be signed and what the request says (empty = consistent). */
export function mismatches(
  signed: DecodedApproval,
  shown: { token: string; to: string; amount: string | bigint },
): string[] {
  const out: string[] = [];
  if (signed.token !== shown.token) out.push(`token ${signed.token} ≠ ${shown.token}`);
  if (signed.to !== shown.to) out.push(`recipient ${signed.to} ≠ ${shown.to}`);
  if (signed.amount !== BigInt(shown.amount)) out.push(`amount ${signed.amount} ≠ ${String(shown.amount)}`);
  return out;
}
