/**
 * @fosay/sdk — FOSAY contract clients, agent auth signing, the x402 smart-account
 * payer scheme and error decoding. Isomorphic (browser + Node).
 */
export const SDK_VERSION = '0.1.0';

export { TESTNET, fosayConfigSchema, loadConfigFromEnv } from './config';
export type { FosayConfig } from './config';
export {
  APPROVALS_ERRORS,
  ERROR_HINTS,
  FosayError,
  MANDATE_ERRORS,
  contractErrorCodes,
  decodeError,
  decodeSimulationError,
  redactSecrets,
} from './errors';
export type { ContractErrorName, FosayErrorCode } from './errors';
export { canonicalJson, mandateHash, toHex } from './mandate';
export type { MandateDoc } from './mandate';
export {
  MANDATE_LIMITS,
  TOKEN_DECIMALS,
  fromBaseUnits,
  mandateParamsToScVal,
  scv,
  toBaseUnits,
  validateMandateParams,
} from './scval';
export type { MandateParamsInput } from './scval';
export {
  NULL_ACCOUNT,
  addressAuthEntries,
  assembleWithAuth,
  buildInvoke,
  hostFunction,
  latestLedger,
  readContract,
  relayerPayload,
  rpcServer,
  simulate,
} from './simulate';
export type { InvokeSpec } from './simulate';
export { ApprovalsBindings, FosayClient, MandatePolicyBindings } from './clients';
export type { Intent, IntentStatus, Mandate, ProposeArgs } from './clients';
export { AgentSigner, classifyAgentEntry } from './auth';
export type { AgentAction, AgentIdentity } from './auth';
