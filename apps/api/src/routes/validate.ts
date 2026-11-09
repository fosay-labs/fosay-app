import { StrKey } from '@stellar/stellar-sdk';
import { z } from 'zod';

export const contractAddress = z
  .string()
  .refine((v) => StrKey.isValidContract(v), 'expected a C… contract address');
export const stellarAddress = z
  .string()
  .refine(
    (v) => StrKey.isValidContract(v) || StrKey.isValidEd25519PublicKey(v),
    'expected a G… or C… address',
  );
export const intentStatus = z.enum(['Pending', 'Executed', 'Cancelled', 'Expired']);

/** 400 body for zod failures (no input values echoed). */
export function badRequest(error: z.ZodError) {
  return {
    error: 'bad_request',
    issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  };
}
