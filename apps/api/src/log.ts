import { redactSecrets } from '@fosay/sdk';

export type Level = 'debug' | 'info' | 'warn' | 'error';
export type Logger = (level: Level, msg: string, fields?: Record<string, unknown>) => void;

/** Structured JSON logs on stdout; secret seeds are redacted. */
export const jsonLogger: Logger = (level, msg, fields = {}) => {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields }, (_k, v: unknown) =>
    typeof v === 'bigint' ? v.toString() : v,
  );
  process.stdout.write(`${redactSecrets(line)}\n`);
};

export const silentLogger: Logger = () => undefined;

/** Readable text for anything thrown, incl. RPC error objects like { code, message }. */
export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; code?: unknown };
    if (typeof o.message === 'string')
      return o.code === undefined ? o.message : `${String(o.code)}: ${o.message}`;
    try {
      return JSON.stringify(e);
    } catch {
      return Object.prototype.toString.call(e);
    }
  }
  return String(e);
}
