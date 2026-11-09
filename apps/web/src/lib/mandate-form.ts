import { MANDATE_LIMITS, toBaseUnits, validateMandateParams } from '@fosay/sdk';
import type { FosayConfig, MandateDoc } from '@fosay/sdk';
import { StrKey } from '@stellar/stellar-sdk';

import { LEDGERS_PER_DAY } from './config';

export interface AgentForm {
  name: string;
  purpose: string;
  agentPublicKey: string;
  /** USDC */
  budget: string;
  periodLedgers: number;
  /** USDC */
  maxPerTx: string;
  /** newline/comma separated Stellar addresses; empty = any */
  recipients: string;
  validDays: number;
}

export const PERIODS = [
  { label: 'per day', ledgers: LEDGERS_PER_DAY },
  { label: 'per week', ledgers: 7 * LEDGERS_PER_DAY },
  { label: 'per 30 days', ledgers: 30 * LEDGERS_PER_DAY },
] as const;

/** Rule names must be at most 20 bytes: `<slug>:pay` / `<slug>:ask` with a ≤15-char slug. */
export function ruleSlug(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 15)
    .replace(/-+$/, '');
  return s || 'agent';
}

export interface BuiltMandate {
  doc: MandateDoc;
  budget: bigint;
  maxPerTx: bigint;
  recipients: string[];
  validUntilLedger: number;
  ruleNames: { pay: string; ask: string };
  agentKey: Buffer;
}

/** Validates the form and builds the mandate document + on-chain parameters. Throws readable errors. */
export function buildMandate(
  form: AgentForm,
  cfg: Pick<FosayConfig, 'usdcId'>,
  latestLedger: number,
  now: Date,
): BuiltMandate {
  const name = form.name.trim();
  if (!name) throw new Error('Give the agent a name.');
  if (!form.purpose.trim()) throw new Error('Describe what the agent may spend on.');
  const key = form.agentPublicKey.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(key))
    throw new Error('Agent public key must be 64 hex characters (run `fosay-agent pubkey`).');
  let budget: bigint;
  let maxPerTx: bigint;
  try {
    budget = toBaseUnits(form.budget);
    maxPerTx = toBaseUnits(form.maxPerTx);
  } catch (e) {
    throw new Error('Amounts must be USDC numbers like 25 or 2.5 (up to 7 decimals).', { cause: e });
  }
  const recipients = form.recipients
    .split(/[\s,]+/)
    .map((r) => r.trim())
    .filter(Boolean);
  for (const r of recipients) {
    if (!StrKey.isValidEd25519PublicKey(r) && !StrKey.isValidContract(r))
      throw new Error(`Not a Stellar address: ${r}`);
  }
  if (!Number.isInteger(form.validDays) || form.validDays < 1 || form.validDays > 365)
    throw new Error('Valid for 1–365 days.');
  try {
    validateMandateParams({
      budget,
      maxPerTx,
      periodLedgers: form.periodLedgers,
      recipients,
      mandateHash: new Uint8Array(32),
    });
  } catch (e) {
    throw new Error(`Mandate rejected: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
  if (recipients.length > MANDATE_LIMITS.maxRecipients) throw new Error('Too many recipients.');
  const validUntilLedger = latestLedger + form.validDays * LEDGERS_PER_DAY;
  const slug = ruleSlug(name);
  return {
    doc: {
      v: 1,
      agentName: name.slice(0, 64),
      purpose: form.purpose.trim().slice(0, 500),
      token: cfg.usdcId,
      budget: budget.toString(),
      periodLedgers: form.periodLedgers,
      maxPerTx: maxPerTx.toString(),
      recipients,
      validUntilLedger,
      createdAt: now.toISOString(),
    },
    budget,
    maxPerTx,
    recipients,
    validUntilLedger,
    ruleNames: { pay: `${slug}:pay`, ask: `${slug}:ask` },
    agentKey: Buffer.from(key, 'hex'),
  };
}
