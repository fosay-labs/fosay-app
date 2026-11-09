import { StrKey } from '@stellar/stellar-sdk';
import type { PaymentPayloadResult, PaymentRequirements, SchemeNetworkClient } from '@x402/core/types';

import type { AgentSigner } from '../auth';
import type { FosayClient } from '../clients';
import { FosayError } from '../errors';
import { addressAuthEntries, assembleWithAuth, buildInvoke, latestLedger, simulate } from '../simulate';

/** Seconds per ledger used to turn `maxTimeoutSeconds` into an auth-expiry ledger. */
export const LEDGER_SECONDS = 5;

export interface PaymentPreflight {
  amount: bigint;
  payTo: string;
  remaining: bigint;
  maxPerTx: bigint;
  reason: 'over_per_tx_cap' | 'over_budget' | 'over_call_cap';
}

/** The CAIP-2 id x402 uses for a FOSAY network. */
export function x402Network(network: 'testnet' | 'mainnet'): `stellar:${string}` {
  return network === 'mainnet' ? 'stellar:pubnet' : 'stellar:testnet';
}

/**
 * x402 `exact` client scheme where the payer is a FOSAY smart account and the agent's
 * Ed25519 key authorizes the payment under its `:pay` rule.
 *
 * Mirrors `@x402/stellar`'s `ExactStellarScheme.createPaymentPayload`, except that the
 * auth entry is signed with the OZ `AuthPayload` (via smart-account-kit) and, before
 * signing, the mandate is checked: if the payment would exceed the per-tx cap or the
 * remaining budget it throws `FosayError('NEEDS_APPROVAL')` so the agent can propose it.
 */
export class FosayExactStellarScheme implements SchemeNetworkClient {
  readonly scheme = 'exact';
  /**
   * The last error thrown by `createPaymentPayload`. x402's client re-throws scheme errors
   * as plain `Error`s without a `cause`, so callers read the typed error from here.
   */
  lastError: FosayError | undefined;

  constructor(
    private readonly client: FosayClient,
    private readonly signer: AgentSigner,
    private readonly opts: { maxAmountPerCall?: bigint } = {},
  ) {}

  async createPaymentPayload(x402Version: number, req: PaymentRequirements): Promise<PaymentPayloadResult> {
    this.lastError = undefined;
    try {
      return await this.create(x402Version, req);
    } catch (e) {
      if (e instanceof FosayError) this.lastError = e;
      throw e;
    }
  }

  private async create(x402Version: number, req: PaymentRequirements): Promise<PaymentPayloadResult> {
    const cfg = this.client.cfg;
    const { wallet, payRule } = this.signer.identity;
    if (req.scheme !== 'exact') throw new FosayError('INVALID_INPUT', `unsupported scheme ${req.scheme}`);
    if (req.network !== x402Network(cfg.network) && req.network !== 'stellar:*')
      throw new FosayError('INVALID_INPUT', `wrong network ${req.network}`);
    if (req.extra?.['areFeesSponsored'] !== true)
      throw new FosayError('INVALID_INPUT', 'exact scheme requires areFeesSponsored: true');
    if (req.asset !== cfg.usdcId)
      throw new FosayError('INVALID_INPUT', `asset ${req.asset} is not the mandate token`);
    if (!/^\d+$/.test(req.amount) || BigInt(req.amount) <= 0n)
      throw new FosayError('INVALID_INPUT', `invalid amount ${req.amount}`);
    if (!StrKey.isValidEd25519PublicKey(req.payTo) && !StrKey.isValidContract(req.payTo))
      throw new FosayError('INVALID_INPUT', `invalid payTo ${req.payTo}`);
    const amount = BigInt(req.amount);

    // Preflight against the on-chain mandate so the agent asks instead of failing.
    const [mandate, remaining] = await Promise.all([
      this.client.getMandate(wallet, payRule),
      this.client.remainingBudget(wallet, payRule),
    ]);
    if (mandate.paused) throw new FosayError('Paused', 'The owner has paused this agent.');
    if (mandate.recipients.length > 0 && !mandate.recipients.includes(req.payTo))
      throw new FosayError('RecipientNotAllowed', 'Recipient is not on the mandate allowlist.', {
        payTo: req.payTo,
      });
    const over = (reason: PaymentPreflight['reason']): never => {
      const details: PaymentPreflight = {
        amount,
        payTo: req.payTo,
        remaining,
        maxPerTx: mandate.maxPerTx,
        reason,
      };
      throw new FosayError('NEEDS_APPROVAL', `payment needs the owner's approval (${reason})`, {
        ...details,
      });
    };
    if (this.opts.maxAmountPerCall !== undefined && amount > this.opts.maxAmountPerCall)
      over('over_call_cap');
    if (amount > mandate.maxPerTx) over('over_per_tx_cap');
    if (amount > remaining) over('over_budget');

    // Build, simulate, sign the wallet's auth entry with the agent key, re-simulate.
    const server = this.client.server;
    const tx = buildInvoke(cfg, this.client.transferInvoke(wallet, req.payTo, amount));
    const sim = await simulate(server, tx);
    const entries = addressAuthEntries(sim);
    if (entries.length !== 1)
      throw new FosayError(
        'SIMULATION_FAILED',
        `expected 1 auth entry for the wallet, got ${entries.length}`,
      );
    const [entry] = entries;
    if (!entry) throw new FosayError('SIMULATION_FAILED', 'missing auth entry');
    const expiration = (await latestLedger(server)) + Math.ceil(req.maxTimeoutSeconds / LEDGER_SECONDS);
    const signed = await this.signer.sign(entry, expiration);
    const assembled = await assembleWithAuth(server, cfg, tx, [signed]);
    return { x402Version, payload: { transaction: assembled.tx.toXDR() } };
  }
}
