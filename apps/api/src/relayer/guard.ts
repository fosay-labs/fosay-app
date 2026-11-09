import type { FosayConfig } from '@fosay/sdk';
import { Address, scValToNative } from '@stellar/stellar-sdk';
import type { xdr } from '@stellar/stellar-sdk';

export type GuardResult = { ok: true; wallet: string | null; label: string } | { ok: false; reason: string };

export interface GuardDeps {
  cfg: Pick<FosayConfig, 'approvalsId' | 'mandatePolicyId' | 'usdcId' | 'accountWasmHash'>;
  /** The relayer's own G-address: it must never be asked to authorize anything. */
  relayerAddress: string;
  /** WASM hash (hex) of a deployed contract, or null if not a wasm contract / unknown. */
  wasmHashOf: (contractId: string) => Promise<string | null>;
}

export const MAX_AUTH_ENTRIES = 4;

const APPROVALS_FNS = new Set(['propose', 'execute', 'cancel', 'expire']);
const POLICY_FNS = new Set(['set_paused', 'update_mandate', 'extend_ttl']);
const WALLET_FNS = new Set([
  'add_context_rule',
  'remove_context_rule',
  'update_context_rule_name',
  'update_context_rule_valid_until',
  'add_signer',
  'batch_add_signer',
  'remove_signer',
  'add_policy',
  'remove_policy',
  'execute',
  'upgrade',
]);

const deny = (reason: string): GuardResult => ({ ok: false, reason });

/**
 * Decides whether the relayer pays for `func` + `auth`. Only FOSAY-shaped calls pass:
 * the approvals queue, the mandate policy, USDC transfers *from FOSAY wallets*, wallet
 * management on canonical OZ wallets, and deploying a canonical OZ wallet. Every auth
 * entry must be an address credential, and none may be for the relayer itself (the
 * relayer's envelope signature would otherwise authorize it).
 */
export async function checkRelayRequest(
  deps: GuardDeps,
  func: xdr.HostFunction,
  auth: xdr.SorobanAuthorizationEntry[],
): Promise<GuardResult> {
  if (auth.length > MAX_AUTH_ENTRIES) return deny('too many auth entries');
  for (const a of auth) {
    const creds = a.credentials();
    if (creds.switch().name !== 'sorobanCredentialsAddress')
      return deny('source-account credentials are not accepted');
    const who = Address.fromScAddress(creds.address().address()).toString();
    if (who === deps.relayerAddress) return deny('auth for the relayer account is not accepted');
  }

  const isWallet = async (id: string) => (await deps.wasmHashOf(id)) === deps.cfg.accountWasmHash;
  const kind = func.switch().name;

  if (kind === 'hostFunctionTypeInvokeContract') {
    const call = func.invokeContract();
    const contract = Address.fromScAddress(call.contractAddress()).toString();
    const fn = call.functionName().toString();
    const firstArg = call.args()[0];
    const first = firstArg ? scValToNative(firstArg) : undefined;

    if (contract === deps.cfg.approvalsId) {
      if (!APPROVALS_FNS.has(fn)) return deny(`approvals.${fn} is not relayed`);
      return {
        ok: true,
        wallet: fn === 'propose' && typeof first === 'string' ? first : null,
        label: `approvals.${fn}`,
      };
    }
    if (contract === deps.cfg.mandatePolicyId) {
      if (!POLICY_FNS.has(fn)) return deny(`mandate_policy.${fn} is not relayed`);
      return { ok: true, wallet: typeof first === 'string' ? first : null, label: `mandate_policy.${fn}` };
    }
    if (contract === deps.cfg.usdcId) {
      if (fn !== 'transfer') return deny(`token.${fn} is not relayed`);
      if (typeof first !== 'string' || !(await isWallet(first)))
        return deny('only transfers from FOSAY wallets are relayed');
      return { ok: true, wallet: first, label: 'token.transfer' };
    }
    if (await isWallet(contract)) {
      if (!WALLET_FNS.has(fn)) return deny(`wallet.${fn} is not relayed`);
      return { ok: true, wallet: contract, label: `wallet.${fn}` };
    }
    return deny(`contract ${contract} is not relayed`);
  }

  if (kind === 'hostFunctionTypeCreateContractV2' || kind === 'hostFunctionTypeCreateContract') {
    const args =
      kind === 'hostFunctionTypeCreateContractV2' ? func.createContractV2() : func.createContract();
    const exec = args.executable();
    if (exec.switch().name !== 'contractExecutableWasm')
      return deny('only wasm contract deployments are relayed');
    if (exec.wasmHash().toString('hex') !== deps.cfg.accountWasmHash)
      return deny('only canonical OZ wallet deployments are relayed');
    return { ok: true, wallet: null, label: 'wallet.deploy' };
  }

  return deny(`${kind} is not relayed`);
}
