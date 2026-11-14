import { describe, expect, it } from 'vitest';

import type { ActivityItem } from './api';
import { activityToCsv } from './csv';

describe('activityToCsv', () => {
  it('returns only the header row when activity is empty', () => {
    expect(activityToCsv([])).toBe('date,kind,via,to,amount_usdc,status,request_id,tx_hash');
  });

  it('formats base-unit bigint strings with fromBaseUnits and escapes RFC 4180 fields', () => {
    const items: ActivityItem[] = [
      {
        kind: 'payment',
        via: 'agent, "bot"',
        to: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        amount: '25000000',
        txHash: 'tx123',
        ledger: 1000,
        at: '2026-11-09T12:00:00Z',
      },
      {
        kind: 'request',
        id: '42',
        to: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBWHF',
        amount: '170141183460469231731687303715884105727',
        memo: 'over cap',
        status: 'Executed',
        txHash: 'tx456,quoted"hash\nline2',
        ledger: 1005,
      },
    ];

    const csv = activityToCsv(items);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('date,kind,via,to,amount_usdc,status,request_id,tx_hash');
    expect(lines[1]).toBe(
      '2026-11-09T12:00:00Z,payment,"agent, ""bot""",GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF,2.5,,,tx123',
    );
    expect(lines.slice(2).join('\n')).toBe(
      ',request,,GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBWHF,17014118346046923173168730371588.4105727,Executed,42,"tx456,quoted""hash\nline2"',
    );
  });
});
