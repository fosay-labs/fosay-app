import type { FosayConfig } from '@fosay/sdk';
import { decodeSimulationError } from '@fosay/sdk';
import { TransactionBuilder, rpc } from '@stellar/stellar-sdk';
import type { Keypair, xdr } from '@stellar/stellar-sdk';

/** Builds, simulates, assembles, signs and submits a one-op tx from the keeper account. */
export async function submitAsKeeper(
  server: rpc.Server,
  cfg: Pick<FosayConfig, 'networkPassphrase'>,
  keypair: Keypair,
  op: xdr.Operation,
  sorobanData?: xdr.SorobanTransactionData,
): Promise<{ hash: string; fee: number }> {
  const account = await server.getAccount(keypair.publicKey());
  let b = new TransactionBuilder(account, { fee: '100', networkPassphrase: cfg.networkPassphrase })
    .addOperation(op)
    .setTimeout(60);
  if (sorobanData) b = b.setSorobanData(sorobanData);
  const tx = b.build();
  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) {
    throw decodeSimulationError(rpc.Api.isSimulationError(sim) ? sim : { error: 'restore required' });
  }
  const prepared = rpc.assembleTransaction(tx, sim).build();
  prepared.sign(keypair);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === 'ERROR') throw new Error(`keeper send failed: ${sent.status}`);
  const res = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (res.status !== 'SUCCESS') throw new Error(`keeper tx ${sent.hash} ${res.status}`);
  return { hash: sent.hash, fee: Number(res.resultXdr.feeCharged().toString()) };
}
