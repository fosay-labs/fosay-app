import { fromBaseUnits } from '@fosay/sdk';

import type { ActivityItem } from './api';

export const CSV_COLUMNS = [
  'date',
  'kind',
  'via',
  'to',
  'amount_usdc',
  'status',
  'request_id',
  'tx_hash',
] as const;

/** Escape a single cell according to RFC 4180. */
export function escapeCsvCell(value: string | null | undefined): string {
  const text = value ?? '';
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Convert dashboard activity items into an RFC 4180 CSV document. */
export function activityToCsv(items: ActivityItem[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const item of items) {
    const amountUsdc = item.amount ? fromBaseUnits(BigInt(item.amount)) : '';
    const date = item.kind === 'payment' ? item.at : '';
    const via = item.kind === 'payment' ? item.via : '';
    const status = item.kind === 'request' ? item.status : '';
    const requestId = item.kind === 'request' ? item.id : '';
    const row = [
      escapeCsvCell(date),
      escapeCsvCell(item.kind),
      escapeCsvCell(via),
      escapeCsvCell(item.to),
      escapeCsvCell(amountUsdc),
      escapeCsvCell(status),
      escapeCsvCell(requestId),
      escapeCsvCell(item.txHash),
    ];
    lines.push(row.join(','));
  }
  return lines.join('\n');
}
