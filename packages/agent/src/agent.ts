import {
  AgentSigner,
  FosayClient,
  FosayError,
  addressAuthEntries,
  assembleWithAuth,
  buildInvoke,
  latestLedger,
  relayerPayload,
  simulate,
} from '@fosay/sdk';
import type { AgentIdentity, FosayConfig, Intent, InvokeSpec } from '@fosay/sdk';
import { scValToNative } from '@stellar/stellar-sdk';
import { RelayerClient } from 'smart-account-kit';

/** Submits `{ func, auth }` for fee-sponsored inclusion (smart-account-kit relayer protocol). */
export interface Submitter {
  submit(payload: { func: string; auth: string[] }): Promise<{ hash: string }>;
}

/** Submitter backed by a smart-account-kit compatible relayer (e.g. FOSAY API `/relay`). */
export function relayerSubmitter(url: string): Submitter {
  const relayer = new RelayerClient(url);
  return {
    async submit({ func, auth }) {
      const r = await relayer.send(func, auth);
      if (!r.success || !r.hash) {
        throw new FosayError(
          'TX_FAILED',
          `relayer rejected the transaction: ${r.error ?? r.errorCode ?? 'unknown'}`,
        );
      }
      return { hash: r.hash };
    },
  };
}

/** Longest memo the approvals contract accepts, in bytes. */
export const MAX_MEMO_BYTES = 140;
/** Default lifetime of an approval request: ~1 day of ledgers. */
export const DEFAULT_REQUEST_TTL_LEDGERS = 17_280;

/** Truncates to at most 140 UTF-8 bytes without splitting a character. */
export function clampMemo(memo: string): string {
  let out = memo;
  while (Buffer.byteLength(out, 'utf8') > MAX_MEMO_BYTES) out = out.slice(0, -1);
  return out;
}

export interface ProposeInput {
  to: string;
  amount: bigint;
  memo: string;
  ttlLedgers?: number;
}

export interface AgentStatus {
  wallet: string;
  payRule: number;
  askRule: number;
  agentPublicKey: string;
  balance: bigint;
  budget: bigint;
  remaining: bigint;
  maxPerTx: bigint;
  periodLedgers: number;
  paused: boolean;
  pendingRequests: number;
}

export interface FosayAgentOptions {
  cfg: FosayConfig;
  identity: AgentIdentity;
  /** Agent secret seed. Kept inside the signer; never logged. */
  secret: string;
  client?: FosayClient;
  /** How signed agent transactions reach the chain (default: relayer at `relayerUrl`). */
  submitter?: Submitter;
  relayerUrl?: string;
}

/** The agent side of a FOSAY wallet: reads its mandate and spends within it. */
export class FosayAgent {
  readonly client: FosayClient;
  readonly signer: AgentSigner;

  constructor(protected readonly opts: FosayAgentOptions) {
    this.client = opts.client ?? new FosayClient(opts.cfg);
    this.signer = new AgentSigner(opts.cfg, opts.identity, opts.secret);
  }

  get identity(): AgentIdentity {
    return this.opts.identity;
  }

  async remainingBudget(): Promise<bigint> {
    return this.client.remainingBudget(this.identity.wallet, this.identity.payRule);
  }

  async status(): Promise<AgentStatus> {
    const { wallet, payRule, askRule } = this.identity;
    const [mandate, remaining, balance, pendingRequests] = await Promise.all([
      this.client.getMandate(wallet, payRule),
      this.client.remainingBudget(wallet, payRule),
      this.client.tokenBalance(wallet),
      this.client.pendingCount(wallet),
    ]);
    if (mandate.token !== this.opts.cfg.usdcId) {
      throw new FosayError(
        'INVALID_INPUT',
        `mandate token ${mandate.token} differs from configured ${this.opts.cfg.usdcId}`,
      );
    }
    return {
      wallet,
      payRule,
      askRule,
      agentPublicKey: this.signer.publicKeyHex,
      balance,
      budget: mandate.budget,
      remaining,
      maxPerTx: mandate.maxPerTx,
      periodLedgers: mandate.periodLedgers,
      paused: mandate.paused,
      pendingRequests,
    };
  }

  /** Opens an approval request on the wallet's queue (agent `:ask` rule). */
  async propose(input: ProposeInput): Promise<{ intentId: bigint; hash: string }> {
    if (input.amount <= 0n) throw new FosayError('InvalidAmount', 'amount must be positive');
    const mandate = await this.client.getMandate(this.identity.wallet, this.identity.payRule);
    const spec = this.client.proposeInvoke({
      wallet: this.identity.wallet,
      to: input.to,
      amount: input.amount,
      mandateHash: Buffer.from(mandate.mandateHash, 'hex'),
      memo: clampMemo(input.memo),
      ttlLedgers: input.ttlLedgers ?? DEFAULT_REQUEST_TTL_LEDGERS,
    });
    const { hash, returnValue } = await this.submitSigned(spec);
    return { intentId: BigInt(returnValue as bigint), hash };
  }

  /** Withdraws one of this wallet's pending requests (agent `:ask` rule). */
  async cancel(id: bigint): Promise<{ hash: string }> {
    await this.requestStatus(id);
    const { hash } = await this.submitSigned(this.client.cancelInvoke(id));
    return { hash };
  }

  /** Simulate → agent-sign → re-simulate → submit via the submitter → wait for the result. */
  protected async submitSigned(spec: InvokeSpec): Promise<{ hash: string; returnValue: unknown }> {
    const server = this.client.server;
    const tx = buildInvoke(this.opts.cfg, spec);
    const sim = await simulate(server, tx);
    const expiration = (await latestLedger(server)) + 60;
    const signed = await Promise.all(addressAuthEntries(sim).map((e) => this.signer.sign(e, expiration)));
    await assembleWithAuth(server, this.opts.cfg, tx, signed); // validates the signed auth before submitting
    const submitter = this.opts.submitter ?? this.defaultSubmitter();
    const { hash } = await submitter.submit(relayerPayload(tx, signed));
    const res = await server.pollTransaction(hash, { attempts: 30 });
    if (res.status !== 'SUCCESS')
      throw new FosayError('TX_FAILED', `transaction ${hash} ${res.status}`, { hash });
    return { hash, returnValue: res.returnValue ? scValToNative(res.returnValue) : undefined };
  }

  private defaultSubmitter(): Submitter {
    if (!this.opts.relayerUrl) throw new FosayError('INVALID_INPUT', 'no submitter or relayerUrl configured');
    return relayerSubmitter(this.opts.relayerUrl);
  }

  async requestStatus(id: bigint): Promise<Intent> {
    const intent = await this.client.getIntent(id);
    if (intent.account !== this.identity.wallet)
      throw new FosayError('NotFound', `request ${id} is not for this wallet`);
    return intent;
  }
}
