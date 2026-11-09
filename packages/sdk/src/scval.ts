import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';

/** Mandate limits enforced on-chain by fosay-mandate-policy (SPEC §4). */
export const MANDATE_LIMITS = {
  buckets: 8,
  minPeriodLedgers: 8,
  maxPeriodLedgers: 535_680,
  maxRecipients: 20,
} as const;

/** USDC and FOSAY test assets use 7 decimals. */
export const TOKEN_DECIMALS = 7;

export interface MandateParamsInput {
  budget: bigint;
  periodLedgers: number;
  maxPerTx: bigint;
  recipients: readonly string[];
  /** 32-byte sha256 of the canonical mandate document. */
  mandateHash: Uint8Array;
}

export const scv = {
  address: (a: string): xdr.ScVal => new Address(a).toScVal(),
  i128: (n: bigint): xdr.ScVal => nativeToScVal(n, { type: 'i128' }),
  u32: (n: number): xdr.ScVal => xdr.ScVal.scvU32(n),
  u64: (n: bigint): xdr.ScVal => nativeToScVal(n, { type: 'u64' }),
  bytes: (b: Uint8Array): xdr.ScVal => xdr.ScVal.scvBytes(Buffer.from(b)),
  string: (s: string): xdr.ScVal => nativeToScVal(s, { type: 'string' }),
  symbol: (s: string): xdr.ScVal => xdr.ScVal.scvSymbol(s),
  vec: (items: xdr.ScVal[]): xdr.ScVal => xdr.ScVal.scvVec(items),
};

/** Throws `RangeError` if params would be rejected on-chain with `InvalidParams`. */
export function validateMandateParams(p: MandateParamsInput): void {
  const { minPeriodLedgers, maxPeriodLedgers, maxRecipients } = MANDATE_LIMITS;
  if (p.budget <= 0n) throw new RangeError('budget must be positive');
  if (p.maxPerTx <= 0n || p.maxPerTx > p.budget) throw new RangeError('maxPerTx must be in 1..=budget');
  if (
    !Number.isInteger(p.periodLedgers) ||
    p.periodLedgers < minPeriodLedgers ||
    p.periodLedgers > maxPeriodLedgers
  )
    throw new RangeError(`periodLedgers must be in ${minPeriodLedgers}..=${maxPeriodLedgers}`);
  if (p.recipients.length > maxRecipients) throw new RangeError(`at most ${maxRecipients} recipients`);
  if (p.mandateHash.length !== 32) throw new RangeError('mandateHash must be 32 bytes');
}

/**
 * `MandateParams` as the contract expects it: a struct, i.e. an `ScMap` with
 * symbol keys in sorted order.
 */
export function mandateParamsToScVal(p: MandateParamsInput): xdr.ScVal {
  validateMandateParams(p);
  const entry = (k: string, v: xdr.ScVal) => new xdr.ScMapEntry({ key: scv.symbol(k), val: v });
  return xdr.ScVal.scvMap([
    entry('budget', scv.i128(p.budget)),
    entry('mandate_hash', scv.bytes(p.mandateHash)),
    entry('max_per_tx', scv.i128(p.maxPerTx)),
    entry('period_ledgers', scv.u32(p.periodLedgers)),
    entry('recipients', scv.vec(p.recipients.map(scv.address))),
  ]);
}

/** "12.5" → 125000000n (7 decimals). Rejects more precision than the token has. */
export function toBaseUnits(amount: string, decimals = TOKEN_DECIMALS): bigint {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(amount.trim());
  if (!m) throw new RangeError(`not a non-negative decimal amount: ${amount}`);
  const whole = m[1] ?? '0';
  const frac = m[2] ?? '';
  if (frac.length > decimals) throw new RangeError(`more than ${decimals} decimal places: ${amount}`);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
}

/** 125000000n → "12.5" (7 decimals), trailing zeros trimmed. */
export function fromBaseUnits(units: bigint, decimals = TOKEN_DECIMALS): string {
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const base = 10n ** BigInt(decimals);
  const frac = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${abs / base}${frac ? `.${frac}` : ''}`;
}
