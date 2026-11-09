import { xdr } from '@stellar/stellar-sdk';
import type { rpc } from '@stellar/stellar-sdk';

import type { FosayConfig } from './config';
import { FosayError } from './errors';
import * as ApprovalsBindings from './generated/approvals';
import * as MandatePolicyBindings from './generated/mandate-policy';
import { scv } from './scval';
import type { InvokeSpec } from './simulate';
import { readContract, rpcServer } from './simulate';

export type IntentStatus = 'Pending' | 'Executed' | 'Cancelled' | 'Expired';

export interface Mandate {
  token: string;
  budget: bigint;
  periodLedgers: number;
  maxPerTx: bigint;
  recipients: string[];
  mandateHash: string;
  paused: boolean;
}

export interface Intent {
  id: bigint;
  account: string;
  token: string;
  to: string;
  amount: bigint;
  mandateHash: string;
  memo: string;
  createdLedger: number;
  expiresLedger: number;
  status: IntentStatus;
}

export interface ProposeArgs {
  wallet: string;
  to: string;
  amount: bigint;
  mandateHash: Uint8Array;
  memo: string;
  ttlLedgers: number;
}

const hex = (b: unknown): string => Buffer.from(b as Uint8Array).toString('hex');

function statusOf(v: unknown): IntentStatus {
  const tag = Array.isArray(v) ? v[0] : ((v as { tag?: string } | undefined)?.tag ?? v);
  if (tag === 'Pending' || tag === 'Executed' || tag === 'Cancelled' || tag === 'Expired') return tag;
  throw new FosayError('UNKNOWN', `unexpected intent status ${JSON.stringify(v)}`);
}

/** Typed access to the FOSAY contracts on one network. */
export class FosayClient {
  readonly server: rpc.Server;

  constructor(
    readonly cfg: FosayConfig,
    server?: rpc.Server,
  ) {
    this.server = server ?? rpcServer(cfg);
  }

  private read<T>(spec: InvokeSpec): Promise<T> {
    return readContract<T>(this.server, this.cfg, spec);
  }

  async getMandate(wallet: string, payRule: number): Promise<Mandate> {
    const m = await this.read<Record<string, unknown>>({
      contract: this.cfg.mandatePolicyId,
      fn: 'get_mandate',
      args: [scv.address(wallet), scv.u32(payRule)],
    });
    return {
      token: String(m['token']),
      budget: BigInt(m['budget'] as bigint),
      periodLedgers: Number(m['period_ledgers']),
      maxPerTx: BigInt(m['max_per_tx'] as bigint),
      recipients: (m['recipients'] as string[]).map(String),
      mandateHash: hex(m['mandate_hash']),
      paused: Boolean(m['paused']),
    };
  }

  async remainingBudget(wallet: string, payRule: number): Promise<bigint> {
    return BigInt(
      await this.read<bigint>({
        contract: this.cfg.mandatePolicyId,
        fn: 'remaining_budget',
        args: [scv.address(wallet), scv.u32(payRule)],
      }),
    );
  }

  async getIntent(id: bigint): Promise<Intent> {
    const i = await this.read<Record<string, unknown>>({
      contract: this.cfg.approvalsId,
      fn: 'get_intent',
      args: [scv.u64(id)],
    });
    return {
      id: BigInt(i['id'] as bigint),
      account: String(i['account']),
      token: String(i['token']),
      to: String(i['to']),
      amount: BigInt(i['amount'] as bigint),
      mandateHash: hex(i['mandate_hash']),
      memo: String(i['memo']),
      createdLedger: Number(i['created_ledger']),
      expiresLedger: Number(i['expires_ledger']),
      status: statusOf(i['status']),
    };
  }

  async pendingCount(wallet: string): Promise<number> {
    return Number(
      await this.read<number>({
        contract: this.cfg.approvalsId,
        fn: 'pending_count',
        args: [scv.address(wallet)],
      }),
    );
  }

  async tokenBalance(owner: string, token = this.cfg.usdcId): Promise<bigint> {
    return BigInt(await this.read<bigint>({ contract: token, fn: 'balance', args: [scv.address(owner)] }));
  }

  // ---- invocation builders (signed by the agent or the owner, submitted elsewhere) ----

  transferInvoke(wallet: string, to: string, amount: bigint, token = this.cfg.usdcId): InvokeSpec {
    return {
      contract: token,
      fn: 'transfer',
      args: [scv.address(wallet), scv.address(to), scv.i128(amount)],
    };
  }

  proposeInvoke(a: ProposeArgs): InvokeSpec {
    return {
      contract: this.cfg.approvalsId,
      fn: 'propose',
      args: [
        scv.address(a.wallet),
        scv.address(this.cfg.usdcId),
        scv.address(a.to),
        scv.i128(a.amount),
        scv.bytes(a.mandateHash),
        scv.string(a.memo),
        scv.u32(a.ttlLedgers),
      ],
    };
  }

  cancelInvoke(id: bigint): InvokeSpec {
    return { contract: this.cfg.approvalsId, fn: 'cancel', args: [scv.u64(id)] };
  }

  executeInvoke(id: bigint): InvokeSpec {
    return { contract: this.cfg.approvalsId, fn: 'execute', args: [scv.u64(id)] };
  }

  setPausedInvoke(wallet: string, payRule: number, paused: boolean): InvokeSpec {
    return {
      contract: this.cfg.mandatePolicyId,
      fn: 'set_paused',
      args: [scv.address(wallet), scv.u32(payRule), xdrBool(paused)],
    };
  }

  // ---- generated clients (AssembledTransaction, e.g. for smart-account-kit signing) ----

  approvalsContract(publicKey?: string): ApprovalsBindings.Client {
    return new ApprovalsBindings.Client({
      ...this.clientOptions(),
      contractId: this.cfg.approvalsId,
      ...(publicKey ? { publicKey } : {}),
    });
  }

  mandatePolicyContract(publicKey?: string): MandatePolicyBindings.Client {
    return new MandatePolicyBindings.Client({
      ...this.clientOptions(),
      contractId: this.cfg.mandatePolicyId,
      ...(publicKey ? { publicKey } : {}),
    });
  }

  private clientOptions() {
    return {
      networkPassphrase: this.cfg.networkPassphrase,
      rpcUrl: this.cfg.rpcUrl,
      allowHttp: this.cfg.rpcUrl.startsWith('http://'),
    };
  }
}

function xdrBool(b: boolean): xdr.ScVal {
  return xdr.ScVal.scvBool(b);
}

export { ApprovalsBindings, MandatePolicyBindings };
