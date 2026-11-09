import { decodeSimulationError } from '@fosay/sdk';
import type { FosayConfig } from '@fosay/sdk';
import { Keypair, Operation, TransactionBuilder, rpc, xdr } from '@stellar/stellar-sdk';
import { Hono } from 'hono';
import type { Context } from 'hono';

import type { Logger } from '../log';
import { checkRelayRequest } from './guard';
import { RateLimiter } from './ratelimit';

export interface RelayerDeps {
  cfg: FosayConfig;
  server: rpc.Server;
  secret: string;
  maxFeeStroops: number;
  log: Logger;
  /** Override for tests; defaults to reading the contract instance's executable. */
  wasmHashOf?: (contractId: string) => Promise<string | null>;
  limits?: { perIpPerMinute: number; perWalletPerMinute: number };
}

type RelayError =
  | 'BAD_REQUEST'
  | 'UNSUPPORTED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'SIMULATION_FAILED'
  | 'FEE_TOO_HIGH'
  | 'SUBMIT_FAILED';

function fail(c: Context, status: 400 | 403 | 429 | 502, errorCode: RelayError, message: string) {
  return c.json({ success: false, errorCode, message }, status);
}

/** Reads a contract's WASM hash from its instance entry; cached for 10 minutes. */
export function contractWasmHashReader(server: rpc.Server): (id: string) => Promise<string | null> {
  const cache = new Map<string, { at: number; hash: string | null }>();
  return async (id) => {
    const hit = cache.get(id);
    if (hit && Date.now() - hit.at < 600_000) return hit.hash;
    let hash: string | null;
    try {
      const entry = await server.getContractData(id, xdr.ScVal.scvLedgerKeyContractInstance());
      const exec = entry.val.contractData().val().instance().executable();
      hash = exec.switch().name === 'contractExecutableWasm' ? exec.wasmHash().toString('hex') : null;
    } catch {
      hash = null;
    }
    cache.set(id, { at: Date.now(), hash });
    return hash;
  };
}

/**
 * Fee-sponsoring relayer implementing smart-account-kit's protocol:
 * `POST { func, auth }` → `{ success: true, data: { hash, status } }`.
 * Signed-transaction fee bumps (`{ xdr }`) are not supported.
 */
export function relayerRoutes(deps: RelayerDeps): Hono {
  const r = new Hono();
  const keypair = Keypair.fromSecret(deps.secret);
  const relayerAddress = keypair.publicKey();
  const wasmHashOf = deps.wasmHashOf ?? contractWasmHashReader(deps.server);
  const perIp = new RateLimiter(deps.limits?.perIpPerMinute ?? 30, 60_000);
  const perWallet = new RateLimiter(deps.limits?.perWalletPerMinute ?? 20, 60_000);
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };

  r.post('/', async (c) => {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
    if (!perIp.allow(ip)) return fail(c, 429, 'RATE_LIMITED', 'too many requests');
    const body = (await c.req.json().catch(() => null)) as {
      func?: unknown;
      auth?: unknown;
      xdr?: unknown;
    } | null;
    if (body && typeof body.xdr === 'string') {
      return fail(
        c,
        400,
        'UNSUPPORTED',
        'signed-transaction fee bumps are not supported; send { func, auth }',
      );
    }
    if (
      !body ||
      typeof body.func !== 'string' ||
      !Array.isArray(body.auth) ||
      !body.auth.every((a) => typeof a === 'string')
    ) {
      return fail(c, 400, 'BAD_REQUEST', 'expected { func: base64, auth: base64[] }');
    }
    let func: xdr.HostFunction;
    let auth: xdr.SorobanAuthorizationEntry[];
    try {
      func = xdr.HostFunction.fromXDR(body.func, 'base64');
      auth = (body.auth as string[]).map((a) => xdr.SorobanAuthorizationEntry.fromXDR(a, 'base64'));
    } catch {
      return fail(c, 400, 'BAD_REQUEST', 'invalid XDR');
    }

    const verdict = await checkRelayRequest({ cfg: deps.cfg, relayerAddress, wasmHashOf }, func, auth);
    if (!verdict.ok) {
      deps.log('warn', 'relay refused', { reason: verdict.reason, ip });
      return fail(c, 403, 'FORBIDDEN', verdict.reason);
    }
    if (verdict.wallet && !perWallet.allow(verdict.wallet))
      return fail(c, 429, 'RATE_LIMITED', 'too many requests for this wallet');

    return serialize(async () => {
      const account = await deps.server.getAccount(relayerAddress);
      const tx = new TransactionBuilder(account, {
        fee: '100',
        networkPassphrase: deps.cfg.networkPassphrase,
      })
        .addOperation(Operation.invokeHostFunction({ func, auth }))
        .setTimeout(60)
        .build();
      const sim = await deps.server.simulateTransaction(tx);
      if (!rpc.Api.isSimulationSuccess(sim)) {
        const e = decodeSimulationError(rpc.Api.isSimulationError(sim) ? sim : { error: 'restore required' });
        return fail(c, 400, 'SIMULATION_FAILED', `${e.code}: ${e.message}`);
      }
      const fee = Number(sim.minResourceFee) + 100;
      if (fee > deps.maxFeeStroops)
        return fail(c, 400, 'FEE_TOO_HIGH', `fee ${fee} exceeds ${deps.maxFeeStroops}`);
      const prepared = rpc.assembleTransaction(tx, sim).build();
      prepared.sign(keypair);
      const sent = await deps.server.sendTransaction(prepared);
      if (sent.status === 'ERROR' || sent.status === 'TRY_AGAIN_LATER') {
        return fail(c, 502, 'SUBMIT_FAILED', `send status ${sent.status}`);
      }
      const res = await deps.server.pollTransaction(sent.hash, { attempts: 30 });
      if (res.status !== 'SUCCESS')
        return fail(c, 502, 'SUBMIT_FAILED', `transaction ${sent.hash} ${res.status}`);
      deps.log('info', 'relayed', { label: verdict.label, wallet: verdict.wallet, hash: sent.hash, fee });
      return c.json({ success: true, data: { hash: sent.hash, status: 'SUCCESS' } });
    });
  });

  return r;
}
