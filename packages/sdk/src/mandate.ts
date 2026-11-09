import { hash } from '@stellar/stellar-sdk';

/** The human-readable mandate the owner approves; its hash goes on-chain. */
export interface MandateDoc {
  v: 1;
  agentName: string;
  purpose: string;
  token: string;
  /** base units, decimal string */
  budget: string;
  periodLedgers: number;
  /** base units, decimal string */
  maxPerTx: string;
  recipients: string[];
  validUntilLedger: number | null;
  /** ISO-8601 */
  createdAt: string;
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function normalize(value: unknown, path: string): Json {
  if (value === null) return null;
  switch (typeof value) {
    case 'boolean':
    case 'string':
      return value;
    case 'bigint':
      return value.toString();
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError(`non-finite number at ${path}`);
      return value;
    case 'object': {
      if (Array.isArray(value)) return value.map((v, i) => normalize(v, `${path}[${i}]`));
      const out: { [k: string]: Json } = {};
      for (const k of Object.keys(value as object).sort()) {
        const v = (value as Record<string, unknown>)[k];
        if (v === undefined) continue;
        out[k] = normalize(v, `${path}.${k}`);
      }
      return out;
    }
    default:
      throw new TypeError(`unsupported ${typeof value} at ${path}`);
  }
}

/** Canonical JSON: keys sorted recursively, no whitespace, bigint as decimal strings. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value, '$'));
}

/** sha256(utf8(canonicalJson(doc))): the `mandate_hash` stored on-chain. */
export function mandateHash(doc: MandateDoc): Uint8Array {
  return new Uint8Array(hash(Buffer.from(canonicalJson(doc), 'utf8')));
}

export function toHex(b: Uint8Array): string {
  return Buffer.from(b).toString('hex');
}
