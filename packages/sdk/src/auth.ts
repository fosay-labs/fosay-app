import { Address, scValToNative } from '@stellar/stellar-sdk';
import type { xdr } from '@stellar/stellar-sdk';
import { Ed25519Signer, KNOWN_AUTH_DIGEST_SCHEMES, signAuthEntryWithSigners } from 'smart-account-kit';

import type { FosayConfig } from './config';
import { FosayError } from './errors';

/** Which wallet and rules an agent acts through. */
export interface AgentIdentity {
  wallet: string;
  payRule: number;
  askRule: number;
}

export type AgentAction = 'transfer' | 'propose' | 'cancel';

/**
 * Decides whether the agent may sign `entry`, and under which rule. The agent signs
 * only: `USDC.transfer(wallet, …)` → `[payRule]`, `approvals.propose(wallet, …)` and
 * `approvals.cancel(id)` → `[askRule]`, each with no sub-invocations, for its own wallet.
 * Anything else throws `REFUSED_ENTRY`.
 */
export function classifyAgentEntry(
  cfg: Pick<FosayConfig, 'usdcId' | 'approvalsId'>,
  id: AgentIdentity,
  entry: xdr.SorobanAuthorizationEntry,
): { action: AgentAction; contextRuleIds: number[] } {
  const refuse = (why: string): never => {
    throw new FosayError('REFUSED_ENTRY', `agent refuses to sign: ${why}`);
  };
  const creds = entry.credentials();
  if (creds.switch().name !== 'sorobanCredentialsAddress') refuse('not an address credential');
  const signer = Address.fromScAddress(creds.address().address()).toString();
  if (signer !== id.wallet) refuse(`credential is for ${signer}, not the agent's wallet`);

  const root = entry.rootInvocation();
  if (root.subInvocations().length > 0) refuse('entry has sub-invocations');
  const fn = root.function();
  if (fn.switch().name !== 'sorobanAuthorizedFunctionTypeContractFn') refuse('not a contract call');
  const call = fn.contractFn();
  const contract = Address.fromScAddress(call.contractAddress()).toString();
  const name = call.functionName().toString();
  const args = call.args();
  const firstArg = args[0] ? String(scValToNative(args[0])) : undefined;

  if (contract === cfg.usdcId && name === 'transfer' && args.length === 3 && firstArg === id.wallet) {
    return { action: 'transfer', contextRuleIds: [id.payRule] };
  }
  if (contract === cfg.approvalsId && name === 'propose' && firstArg === id.wallet) {
    return { action: 'propose', contextRuleIds: [id.askRule] };
  }
  if (contract === cfg.approvalsId && name === 'cancel' && args.length === 1) {
    return { action: 'cancel', contextRuleIds: [id.askRule] };
  }
  return refuse(`${name} on ${contract} is not an agent action`);
}

/**
 * Signs FOSAY agent auth entries with the agent's Ed25519 key through smart-account-kit
 * (`signAuthEntryWithSigners`, preimage-v1 digest for the canonical OZ v0.8.0 account).
 * The secret stays inside the kit's signer; it is never logged or returned.
 */
export class AgentSigner {
  private readonly signer: Ed25519Signer;

  constructor(
    private readonly cfg: Pick<
      FosayConfig,
      'usdcId' | 'approvalsId' | 'ed25519VerifierId' | 'accountWasmHash' | 'networkPassphrase'
    >,
    readonly identity: AgentIdentity,
    secret: string,
  ) {
    try {
      this.signer = Ed25519Signer.fromSecret(secret, cfg.ed25519VerifierId);
    } catch {
      throw new FosayError('INVALID_INPUT', 'agent secret is not a valid Stellar secret key');
    }
  }

  /** Raw 32-byte Ed25519 public key (what the owner registers as the agent signer). */
  get publicKey(): Buffer {
    return this.signer.publicKey;
  }

  get publicKeyHex(): string {
    return this.signer.publicKey.toString('hex');
  }

  async sign(
    entry: xdr.SorobanAuthorizationEntry,
    expiration: number,
  ): Promise<xdr.SorobanAuthorizationEntry> {
    const { contextRuleIds } = classifyAgentEntry(this.cfg, this.identity, entry);
    const scheme = KNOWN_AUTH_DIGEST_SCHEMES[this.cfg.accountWasmHash];
    if (!scheme)
      throw new FosayError('INVALID_INPUT', `unknown account wasm hash ${this.cfg.accountWasmHash}`);
    return signAuthEntryWithSigners(entry, [this.signer], {
      networkPassphrase: this.cfg.networkPassphrase,
      authDigestScheme: scheme,
      contextRuleIds,
      expiration,
    });
  }
}
