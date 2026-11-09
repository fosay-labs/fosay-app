import { x402Client } from '@x402/core/client';

import type { FosayExactStellarScheme } from './scheme';

export { FosayExactStellarScheme, LEDGER_SECONDS, x402Network } from './scheme';
export type { PaymentPreflight } from './scheme';

/**
 * An x402 client that pays with a FOSAY wallet on Stellar. Client-side spend controls
 * are disabled: the on-chain mandate (checked in preflight and enforced by the policy)
 * is the limit, and amounts over it become approval requests.
 */
export function createFosayX402Client(scheme: FosayExactStellarScheme): x402Client {
  return x402Client.fromConfig({
    schemes: [{ network: 'stellar:*', client: scheme }],
    spendControls: false,
  });
}
