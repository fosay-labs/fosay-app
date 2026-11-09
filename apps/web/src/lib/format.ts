import { fromBaseUnits } from '@fosay/sdk';

/** "12.5 USDC" from base units (string or bigint). */
export function usdc(units: string | bigint): string {
  return `${fromBaseUnits(typeof units === 'string' ? BigInt(units) : units)} USDC`;
}

/** GABC…WXYZ */
export function short(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

/** Human period for a ledger count (~5 s per ledger). */
export function period(ledgers: number): string {
  const days = (ledgers * 5) / 86_400;
  if (days >= 1) return `${Number.isInteger(days) ? days : days.toFixed(1)} day${days === 1 ? '' : 's'}`;
  const hours = (ledgers * 5) / 3600;
  return `${hours.toFixed(1)} hours`;
}

export const VIA_LABEL: Record<string, string> = {
  agent: 'paid by agent',
  approval: 'you approved',
  owner: 'you paid',
  unknown: 'payment',
};
