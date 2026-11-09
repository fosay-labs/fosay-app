import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { intents, mandates } from '../db/schema';
import { testDb } from './testdb';

describe('database schema', () => {
  it('applies migrations and stores large amounts exactly', async () => {
    const db = await testDb();
    await db.insert(intents).values({
      id: '1',
      account: 'CWALLET',
      token: 'CTOKEN',
      to: 'GDEST',
      amount: '170141183460469231731687303715884105727', // i128::MAX
      mandateHash: '00',
      memo: 'x',
      expiresLedger: 10,
      status: 'Pending',
      proposedLedger: 1,
      proposedTx: 'aa',
    });
    const [row] = await db.select().from(intents).where(eq(intents.id, '1'));
    expect(row?.amount).toBe('170141183460469231731687303715884105727');
    expect(row?.status).toBe('Pending');
  });

  it('keys mandates by (wallet, rule)', async () => {
    const db = await testDb();
    const m = {
      wallet: 'CW',
      ruleId: 1,
      token: 'CT',
      budget: '5',
      periodLedgers: 8,
      maxPerTx: '1',
      recipients: [],
      mandateHash: '00',
      updatedLedger: 1,
    };
    await db.insert(mandates).values(m);
    await expect(db.insert(mandates).values(m)).rejects.toThrow();
    await db.insert(mandates).values({ ...m, ruleId: 2 });
    expect(await db.select().from(mandates)).toHaveLength(2);
  });
});
