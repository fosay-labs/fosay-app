import { TESTNET } from '@fosay/sdk';
import { Address, Keypair, StrKey, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { checkRelayRequest } from '../relayer/guard';

const relayer = Keypair.random().publicKey();
const wallet = StrKey.encodeContract(Buffer.alloc(32, 1));
const stranger = StrKey.encodeContract(Buffer.alloc(32, 2));
const deps = {
  cfg: TESTNET,
  relayerAddress: relayer,
  wasmHashOf: async (id: string) =>
    id === wallet ? TESTNET.accountWasmHash : id === stranger ? 'ff'.repeat(32) : null,
};

const a = (s: string) => new Address(s).toScVal();
const invoke = (contract: string, fn: string, args: xdr.ScVal[] = []) =>
  xdr.HostFunction.hostFunctionTypeInvokeContract(
    new xdr.InvokeContractArgs({
      contractAddress: new Address(contract).toScAddress(),
      functionName: fn,
      args,
    }),
  );
const deploy = (hashHex: string) =>
  xdr.HostFunction.hostFunctionTypeCreateContractV2(
    new xdr.CreateContractArgsV2({
      contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
        new xdr.ContractIdPreimageFromAddress({
          address: new Address(relayer).toScAddress(),
          salt: Buffer.alloc(32),
        }),
      ),
      executable: xdr.ContractExecutable.contractExecutableWasm(Buffer.from(hashHex, 'hex')),
      constructorArgs: [],
    }),
  );
const addrAuth = (who: string) =>
  new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: new Address(who).toScAddress(),
        nonce: xdr.Int64.fromString('1'),
        signatureExpirationLedger: 1,
        signature: xdr.ScVal.scvVoid(),
      }),
    ),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        new xdr.InvokeContractArgs({
          contractAddress: new Address(TESTNET.approvalsId).toScAddress(),
          functionName: 'x',
          args: [],
        }),
      ),
      subInvocations: [],
    }),
  });
const sourceAuth = () =>
  new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
    rootInvocation: addrAuth(wallet).rootInvocation(),
  });

describe('relayer guard', () => {
  const allowed: [string, xdr.HostFunction][] = [
    ['propose', invoke(TESTNET.approvalsId, 'propose', [a(wallet)])],
    ['execute', invoke(TESTNET.approvalsId, 'execute', [nativeToScVal(1n, { type: 'u64' })])],
    ['expire', invoke(TESTNET.approvalsId, 'expire', [nativeToScVal(1n, { type: 'u64' })])],
    ['set_paused', invoke(TESTNET.mandatePolicyId, 'set_paused', [a(wallet)])],
    [
      'usdc from wallet',
      invoke(TESTNET.usdcId, 'transfer', [a(wallet), a(relayer), nativeToScVal(1n, { type: 'i128' })]),
    ],
    ['wallet admin', invoke(wallet, 'add_context_rule')],
    ['deploy OZ wallet', deploy(TESTNET.accountWasmHash)],
  ];
  for (const [name, fn] of allowed) {
    it(`allows ${name}`, async () => {
      expect(await checkRelayRequest(deps, fn, [addrAuth(wallet)])).toMatchObject({ ok: true });
    });
  }

  const denied: [string, xdr.HostFunction, xdr.SorobanAuthorizationEntry[], RegExp][] = [
    ['upload wasm', xdr.HostFunction.hostFunctionTypeUploadContractWasm(Buffer.alloc(8)), [], /not relayed/],
    ['other contract', invoke(stranger, 'add_context_rule'), [], /not relayed/],
    ['unknown contract', invoke(StrKey.encodeContract(Buffer.alloc(32, 3)), 'transfer'), [], /not relayed/],
    ['usdc from G account', invoke(TESTNET.usdcId, 'transfer', [a(relayer), a(wallet)]), [], /FOSAY wallets/],
    ['usdc approve', invoke(TESTNET.usdcId, 'approve', [a(wallet)]), [], /not relayed/],
    ['approvals constructor', invoke(TESTNET.approvalsId, '__constructor'), [], /not relayed/],
    ['non-OZ deploy', deploy('ab'.repeat(32)), [], /canonical OZ/],
    ['source-account auth', invoke(TESTNET.approvalsId, 'execute'), [sourceAuth()], /source-account/],
    ['auth for the relayer', invoke(TESTNET.approvalsId, 'execute'), [addrAuth(relayer)], /relayer account/],
    [
      'too many entries',
      invoke(TESTNET.approvalsId, 'execute'),
      Array.from({ length: 5 }, () => addrAuth(wallet)),
      /too many/,
    ],
  ];
  for (const [name, fn, auth, reason] of denied) {
    it(`denies ${name}`, async () => {
      const r = await checkRelayRequest(deps, fn, auth);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(reason);
    });
  }
});
