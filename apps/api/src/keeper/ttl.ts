import { buildInvoke, scv, simulate } from '@fosay/sdk';
import type { FosayConfig } from '@fosay/sdk';
import { Address, Operation, SorobanDataBuilder, xdr } from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';

export const DAY_LEDGERS = 17_280;
/** OZ renews entries under 29 days during a payment; keep them above it. */
export const RENEW_BELOW_LEDGERS = 30 * DAY_LEDGERS;
export const EXTEND_TO_LEDGERS = 31 * DAY_LEDGERS;

const persistentKey = (contract: string, key: xdr.ScVal) =>
  xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contract).toScAddress(),
      key,
      durability: xdr.ContractDataDurability.persistent(),
    }),
  );
export const instanceKey = (contract: string) =>
  persistentKey(contract, xdr.ScVal.scvLedgerKeyContractInstance());
export const codeKey = (hashHex: string) =>
  xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.from(hashHex, 'hex') }));
const enumKey = (variant: string, ...args: xdr.ScVal[]) =>
  xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(variant), ...args]);

/** OZ smart-account storage keys (`SmartAccountStorageKey`), as seen in payment footprints. */
export const ozKeys = {
  rule: (wallet: string, id: number) => persistentKey(wallet, enumKey('ContextRuleData', scv.u32(id))),
  signer: (wallet: string, id: number) => persistentKey(wallet, enumKey('SignerData', scv.u32(id))),
  policy: (wallet: string, id: number) => persistentKey(wallet, enumKey('PolicyData', scv.u32(id))),
};
export const mandateKey = (policy: string, wallet: string, rule: number) =>
  persistentKey(policy, enumKey('Mandate', scv.address(wallet), scv.u32(rule)));
export const balanceKey = (token: string, wallet: string) =>
  persistentKey(token, enumKey('Balance', scv.address(wallet)));

/** Raw `ScVal` returned by a read-only call. */
async function viewRaw(
  server: rpc.Server,
  cfg: FosayConfig,
  contract: string,
  fn: string,
  args: xdr.ScVal[],
) {
  const sim = await simulate(server, buildInvoke(cfg, { contract, fn, args }));
  if (!sim.result) throw new Error(`${fn} returned nothing`);
  return sim.result.retval;
}

function mapField(v: xdr.ScVal, name: string): xdr.ScVal | undefined {
  return v
    .map()
    ?.find((e) => e.key().switch().name === 'scvSymbol' && e.key().sym().toString() === name)
    ?.val();
}

/**
 * Every persistent entry an agent payment or an owner approval of this wallet touches:
 * wallet instance; rule/signer/policy data of rules 0, pay and ask; the mandate entry;
 * the wallet's token balance; the instances and code of the wallet, verifiers, policy,
 * approvals queue and token.
 */
export async function walletFootprintKeys(
  server: rpc.Server,
  cfg: FosayConfig,
  wallet: string,
  rules: number[],
): Promise<xdr.LedgerKey[]> {
  const keys: xdr.LedgerKey[] = [instanceKey(wallet), mandateKey(cfg.mandatePolicyId, wallet, rules[1] ?? 1)];
  keys.push(balanceKey(cfg.usdcId, wallet));
  const contracts = new Set([
    cfg.mandatePolicyId,
    cfg.approvalsId,
    cfg.usdcId,
    cfg.ed25519VerifierId,
    cfg.webauthnVerifierId,
  ]);
  for (const id of rules) {
    keys.push(ozKeys.rule(wallet, id));
    const rule = await viewRaw(server, cfg, wallet, 'get_context_rule', [scv.u32(id)]);
    for (const signer of mapField(rule, 'signers')?.vec() ?? []) {
      const sid = await viewRaw(server, cfg, wallet, 'get_signer_id', [signer]);
      keys.push(ozKeys.signer(wallet, sid.u32()));
      const verifier = signer.vec()?.[1];
      if (verifier) contracts.add(Address.fromScVal(verifier).toString());
    }
    for (const policy of mapField(rule, 'policies')?.vec() ?? []) {
      const pid = await viewRaw(server, cfg, wallet, 'get_policy_id', [policy]);
      keys.push(ozKeys.policy(wallet, pid.u32()));
    }
  }
  for (const c of contracts) keys.push(instanceKey(c));
  keys.push(codeKey(cfg.accountWasmHash));
  return keys;
}

/** Adds the code entries of contract instances found among `entries`. */
export function codeKeysOf(entries: rpc.Api.LedgerEntryResult[]): xdr.LedgerKey[] {
  const out: xdr.LedgerKey[] = [];
  for (const e of entries) {
    if (e.key.switch().name !== 'contractData') continue;
    const val = e.val.contractData().val();
    if (val.switch().name !== 'scvContractInstance') continue;
    const exec = val.instance().executable();
    if (exec.switch().name === 'contractExecutableWasm') out.push(codeKey(exec.wasmHash().toString('hex')));
  }
  return out;
}

/** Entries that exist and expire within `RENEW_BELOW_LEDGERS`, de-duplicated. */
export function needsRenewal(entries: rpc.Api.LedgerEntryResult[], latestLedger: number): xdr.LedgerKey[] {
  const seen = new Set<string>();
  const out: xdr.LedgerKey[] = [];
  for (const e of entries) {
    const k = e.key.toXDR('base64');
    if (seen.has(k)) continue;
    seen.add(k);
    if ((e.liveUntilLedgerSeq ?? 0) < latestLedger + RENEW_BELOW_LEDGERS) out.push(e.key);
  }
  return out;
}

/** One ExtendFootprintTTL op (keys read-only) extending them to `EXTEND_TO_LEDGERS`. */
export function extendOp(keys: xdr.LedgerKey[]): {
  op: xdr.Operation;
  sorobanData: xdr.SorobanTransactionData;
} {
  return {
    op: Operation.extendFootprintTtl({ extendTo: EXTEND_TO_LEDGERS }),
    sorobanData: new SorobanDataBuilder().setReadOnly(keys).build(),
  };
}
