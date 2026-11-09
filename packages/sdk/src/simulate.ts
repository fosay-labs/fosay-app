import { Account, Operation, TransactionBuilder, rpc, scValToNative } from '@stellar/stellar-sdk';
import type { Transaction, xdr } from '@stellar/stellar-sdk';

import type { FosayConfig } from './config';
import { FosayError, decodeError, decodeSimulationError } from './errors';

/** Source used for simulation-only transactions (the payer is an address-auth entry). */
export const NULL_ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
/** Default RPC timeout (ms). */
export const RPC_TIMEOUT_MS = 30_000;

export function rpcServer(cfg: Pick<FosayConfig, 'rpcUrl'>): rpc.Server {
  return new rpc.Server(cfg.rpcUrl, {
    allowHttp: cfg.rpcUrl.startsWith('http://'),
    timeout: RPC_TIMEOUT_MS,
  });
}

export interface InvokeSpec {
  contract: string;
  fn: string;
  args: xdr.ScVal[];
}

/** A one-operation invoke tx with a null source; for simulation and relayer payloads. */
export function buildInvoke(cfg: Pick<FosayConfig, 'networkPassphrase'>, spec: InvokeSpec): Transaction {
  return new TransactionBuilder(new Account(NULL_ACCOUNT, '0'), {
    fee: '100',
    networkPassphrase: cfg.networkPassphrase,
  })
    .addOperation(
      Operation.invokeContractFunction({ contract: spec.contract, function: spec.fn, args: spec.args }),
    )
    .setTimeout(120)
    .build();
}

/** Simulates; throws a decoded `FosayError` on failure. */
export async function simulate(
  server: rpc.Server,
  tx: Transaction,
): Promise<rpc.Api.SimulateTransactionSuccessResponse> {
  let sim: rpc.Api.SimulateTransactionResponse;
  try {
    sim = await server.simulateTransaction(tx);
  } catch (e) {
    throw new FosayError('RPC_ERROR', decodeError(e).message);
  }
  if (rpc.Api.isSimulationError(sim)) throw decodeSimulationError(sim);
  if (!rpc.Api.isSimulationSuccess(sim))
    throw new FosayError('SIMULATION_FAILED', 'simulation needs restore');
  return sim;
}

export function hostFunction(tx: Transaction): xdr.HostFunction {
  const op = tx.toEnvelope().v1().tx().operations()[0];
  if (!op) throw new FosayError('INVALID_INPUT', 'transaction has no operation');
  return op.body().invokeHostFunctionOp().hostFunction();
}

/** Address-credential auth entries the simulation says must be signed. */
export function addressAuthEntries(
  sim: rpc.Api.SimulateTransactionSuccessResponse,
): xdr.SorobanAuthorizationEntry[] {
  return (sim.result?.auth ?? []).filter(
    (e) => e.credentials().switch().name === 'sorobanCredentialsAddress',
  );
}

/** Rebuilds `tx` with signed auth entries, re-simulates (enforcing) and assembles it. */
export async function assembleWithAuth(
  server: rpc.Server,
  cfg: Pick<FosayConfig, 'networkPassphrase'>,
  tx: Transaction,
  auth: xdr.SorobanAuthorizationEntry[],
): Promise<{ tx: Transaction; sim: rpc.Api.SimulateTransactionSuccessResponse }> {
  const rebuilt = new TransactionBuilder(new Account(NULL_ACCOUNT, '0'), {
    fee: '100',
    networkPassphrase: cfg.networkPassphrase,
  })
    .addOperation(Operation.invokeHostFunction({ func: hostFunction(tx), auth }))
    .setTimeout(120)
    .build();
  const sim = await simulate(server, rebuilt);
  return { tx: rpc.assembleTransaction(rebuilt, sim).build(), sim };
}

/** Read-only contract call via simulation; returns the decoded native value. */
export async function readContract<T>(
  server: rpc.Server,
  cfg: Pick<FosayConfig, 'networkPassphrase'>,
  spec: InvokeSpec,
): Promise<T> {
  const sim = await simulate(server, buildInvoke(cfg, spec));
  if (!sim.result) throw new FosayError('SIMULATION_FAILED', `${spec.fn} returned no value`);
  return scValToNative(sim.result.retval) as T;
}

export async function latestLedger(server: rpc.Server): Promise<number> {
  try {
    return (await server.getLatestLedger()).sequence;
  } catch (e) {
    throw new FosayError('RPC_ERROR', decodeError(e).message);
  }
}

/** Body for smart-account-kit's relayer protocol: `{ func, auth }` (base64 XDR). */
export function relayerPayload(
  tx: Transaction,
  auth: xdr.SorobanAuthorizationEntry[],
): { func: string; auth: string[] } {
  return { func: hostFunction(tx).toXDR('base64'), auth: auth.map((a) => a.toXDR('base64')) };
}
