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
