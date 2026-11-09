import { AgentSigner, FosayClient, FosayError } from '@fosay/sdk';
import type { AgentIdentity, FosayConfig, Intent } from '@fosay/sdk';

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

  async requestStatus(id: bigint): Promise<Intent> {
    const intent = await this.client.getIntent(id);
    if (intent.account !== this.identity.wallet)
      throw new FosayError('NotFound', `request ${id} is not for this wallet`);
    return intent;
  }
}
