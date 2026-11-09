import { loadConfigFromEnv } from '@fosay/sdk';
import type { FosayConfig } from '@fosay/sdk';
import { StrKey } from '@stellar/stellar-sdk';
import { z } from 'zod';

const secret = z
  .string()
  .refine((v) => StrKey.isValidEd25519SecretSeed(v), 'must be a Stellar secret seed (S…)')
  .optional();

const apiEnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  RELAYER_SECRET: secret,
  RELAYER_MAX_FEE_STROOPS: z.coerce.number().int().positive().default(2_000_000),
  KEEPER_SECRET: secret,
  KEEPER_INTERVAL_SECONDS: z.coerce.number().int().positive().default(3600),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  INDEXER_START_LEDGER: z.coerce.number().int().nonnegative(),
  INDEXER_POLL_SECONDS: z.coerce.number().positive().default(5),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** Validates the API environment; throws listing every bad variable (values not echoed). */
export function loadEnv(raw: Record<string, string | undefined>): { env: ApiEnv; cfg: FosayConfig } {
  const parsed = apiEnvSchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${String(i.path[0])}: ${i.message}`);
    throw new Error(`Invalid API environment:\n${lines.join('\n')}`);
  }
  return { env: parsed.data, cfg: loadConfigFromEnv(raw) };
}
