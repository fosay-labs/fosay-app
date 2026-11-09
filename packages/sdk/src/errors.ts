import type { xdr } from '@stellar/stellar-sdk';

/** fosay-mandate-policy error codes (SPEC §4). */
export const MANDATE_ERRORS = {
  4100: 'NotInstalled',
  4101: 'AlreadyInstalled',
  4102: 'OnlyCallContractAllowed',
  4103: 'InvalidParams',
  4104: 'Paused',
  4105: 'SignerMissing',
  4106: 'NotAllowed',
  4107: 'PerTxLimitExceeded',
  4108: 'RecipientNotAllowed',
  4109: 'BudgetExceeded',
  4110: 'MathOverflow',
} as const;

/** fosay-approvals error codes (SPEC §5). */
export const APPROVALS_ERRORS = {
  4200: 'NotFound',
  4201: 'NotPending',
  4202: 'Expired',
  4203: 'NotYetExpired',
  4204: 'InvalidAmount',
  4205: 'InvalidTtl',
  4206: 'MemoTooLong',
  4207: 'TooManyPending',
  4208: 'InvalidConfig',
} as const;

export type ContractErrorName =
  | (typeof MANDATE_ERRORS)[keyof typeof MANDATE_ERRORS]
  | (typeof APPROVALS_ERRORS)[keyof typeof APPROVALS_ERRORS];

export type FosayErrorCode =
  | ContractErrorName
  | 'AUTH_REJECTED'
  | 'SIMULATION_FAILED'
  | 'TX_FAILED'
  | 'RPC_ERROR'
  | 'NEEDS_APPROVAL'
  | 'REFUSED_ENTRY'
  | 'INVALID_INPUT'
  | 'UNKNOWN';

export class FosayError extends Error {
  readonly code: FosayErrorCode;
  readonly details: Record<string, unknown>;
  constructor(code: FosayErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(redactSecrets(message));
    this.name = 'FosayError';
    this.code = code;
    this.details = details;
  }
}

const NAMES: Record<number, ContractErrorName> = { ...MANDATE_ERRORS, ...APPROVALS_ERRORS };

/** Human explanation for each contract error, phrased for the agent/owner. */
export const ERROR_HINTS: Partial<Record<FosayErrorCode, string>> = {
  BudgetExceeded: 'Over the rolling budget: ask the owner for approval instead.',
  PerTxLimitExceeded: 'Over the per-payment cap: ask the owner for approval instead.',
  RecipientNotAllowed: 'Recipient is not on the mandate allowlist.',
  Paused: 'The owner has paused this agent.',
  SignerMissing: 'The agent key did not authorize this payment.',
  NotInstalled: 'No mandate on this rule (the agent may have been revoked).',
  AUTH_REJECTED: 'The wallet rejected the authorization.',
};

/** Replaces anything that looks like a Stellar secret seed. */
export function redactSecrets(s: string): string {
  return s.replace(/\bS[A-Z2-7]{55}\b/g, 'S…[redacted]');
}

/** Contract error codes found in an `ScVal` tree (scvError with sceContract). */
function codesInScVal(v: xdr.ScVal, out: Set<number>): void {
  const kind = v.switch().name;
  if (kind === 'scvError') {
    const err = v.error();
    if (err.switch().name === 'sceContract') out.add(err.contractCode());
  } else if (kind === 'scvVec') {
    for (const item of v.vec() ?? []) codesInScVal(item, out);
  } else if (kind === 'scvMap') {
    for (const e of v.map() ?? []) {
      codesInScVal(e.key(), out);
      codesInScVal(e.val(), out);
    }
  }
}

/** All contract error codes mentioned in simulation diagnostics and the error text. */
export function contractErrorCodes(
  events: readonly xdr.DiagnosticEvent[] | undefined,
  errorText?: string,
): number[] {
  const out = new Set<number>();
  for (const d of events ?? []) {
    try {
      const body = d.event().body().v0();
      for (const t of body.topics()) codesInScVal(t, out);
      codesInScVal(body.data(), out);
    } catch {
      // not a v0 body: ignore
    }
  }
  for (const m of (errorText ?? '').matchAll(/Error\(Contract, #(\d+)\)/g)) out.add(Number(m[1]));
  return [...out];
}

/** Turns a failed simulation (`{ error, events }`) into a `FosayError` with a named code. */
export function decodeSimulationError(sim: {
  error?: string;
  events?: readonly xdr.DiagnosticEvent[];
}): FosayError {
  const text = sim.error ?? '';
  const codes = contractErrorCodes(sim.events, text);
  const known = codes.map((c) => NAMES[c]).filter((n): n is ContractErrorName => n !== undefined);
  const first = known[0];
  if (first)
    return new FosayError(first, ERROR_HINTS[first] ?? first, { codes, simulationError: firstLine(text) });
  if (/Error\(Auth, /.test(text)) {
    return new FosayError('AUTH_REJECTED', ERROR_HINTS.AUTH_REJECTED ?? 'auth rejected', {
      codes,
      simulationError: firstLine(text),
    });
  }
  return new FosayError('SIMULATION_FAILED', firstLine(text) || 'simulation failed', { codes });
}

/** Normalizes anything thrown by stellar-sdk / fetch into a `FosayError`. */
export function decodeError(e: unknown): FosayError {
  if (e instanceof FosayError) return e;
  const text = e instanceof Error ? e.message : String(e);
  const codes = contractErrorCodes(undefined, text);
  const name = codes.map((c) => NAMES[c]).find((n) => n !== undefined);
  if (name) return new FosayError(name, ERROR_HINTS[name] ?? name, { codes });
  if (/Error\(Auth, /.test(text)) return new FosayError('AUTH_REJECTED', ERROR_HINTS.AUTH_REJECTED ?? text);
  return new FosayError('UNKNOWN', firstLine(text));
}

function firstLine(s: string): string {
  return s.split('\n')[0]?.slice(0, 300) ?? '';
}
