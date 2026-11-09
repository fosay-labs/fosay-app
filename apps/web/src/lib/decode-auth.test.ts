import { TESTNET } from '@fosay/sdk';
import { Address, Keypair, StrKey, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { decodeApprovalAuth, decodeCancelAuth, mismatches } from './decode-auth';

const wallet = StrKey.encodeContract(Buffer.alloc(32, 1));
const to = Keypair.random().publicKey();
const expected = { wallet, approvalsId: TESTNET.approvalsId, intentId: 7n };

const inv = (contract: string, fn: string, args: xdr.ScVal[], subs: xdr.SorobanAuthorizedInvocation[] = []) =>
  new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({
        contractAddress: new Address(contract).toScAddress(),
        functionName: fn,
        args,
      }),
    ),
    subInvocations: subs,
  });
const entry = (root: xdr.SorobanAuthorizedInvocation, who = wallet) =>
  new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: new Address(who).toScAddress(),
        nonce: xdr.Int64.fromString('1'),
        signatureExpirationLedger: 0,
        signature: xdr.ScVal.scvVoid(),
      }),
    ),
    rootInvocation: root,
  });
const a = (s: string) => new Address(s).toScVal();
const u64 = (n: bigint) => nativeToScVal(n, { type: 'u64' });
const i128 = (n: bigint) => nativeToScVal(n, { type: 'i128' });
const transfer = (from = wallet, dest = to, amount = 25_000_000n, token = TESTNET.usdcId) =>
  inv(token, 'transfer', [a(from), a(dest), i128(amount)]);
const execute = (id = 7n, subs = [transfer()]) => inv(TESTNET.approvalsId, 'execute', [u64(id)], subs);

describe('decodeApprovalAuth', () => {
  it('decodes exactly what the passkey will authorize', () => {
    expect(decodeApprovalAuth([entry(execute())], expected)).toEqual({
      intentId: 7n,
      token: TESTNET.usdcId,
      from: wallet,
      to,
      amount: 25_000_000n,
    });
  });

  it('rejects every other shape', () => {
    const other = StrKey.encodeContract(Buffer.alloc(32, 9));
    const bad: [string, xdr.SorobanAuthorizationEntry[]][] = [
      ['no entry', []],
      ['two entries', [entry(execute()), entry(execute())]],
      ['other contract', [entry(inv(other, 'execute', [u64(7n)], [transfer()]))]],
      ['other request', [entry(execute(8n))]],
      ['no nested payment', [entry(execute(7n, []))]],
      ['two nested payments', [entry(execute(7n, [transfer(), transfer()]))]],
      [
        'nested non-transfer',
        [
          entry(
            execute(7n, [inv(TESTNET.usdcId, 'approve', [a(wallet), a(to), i128(1n), xdr.ScVal.scvU32(1)])]),
          ),
        ],
      ],
      ['payment from elsewhere', [entry(execute(7n, [transfer(other)]))]],
      [
        'nested deeper calls',
        [entry(execute(7n, [inv(TESTNET.usdcId, 'transfer', [a(wallet), a(to), i128(1n)], [transfer()])]))],
      ],
    ];
    for (const [name, entries] of bad) expect(() => decodeApprovalAuth(entries, expected), name).toThrow();
    // entries for other addresses are ignored
    expect(() =>
      decodeApprovalAuth([entry(execute()), entry(execute(), Keypair.random().publicKey())], expected),
    ).not.toThrow();
  });

  it('flags differences from the request shown to the owner', () => {
    const d = decodeApprovalAuth([entry(execute())], expected);
    expect(mismatches(d, { token: TESTNET.usdcId, to, amount: '25000000' })).toEqual([]);
    expect(
      mismatches(d, { token: TESTNET.usdcId, to: Keypair.random().publicKey(), amount: '1' }),
    ).toHaveLength(2);
  });
});

describe('decodeCancelAuth', () => {
  it('accepts cancel(id) only', () => {
    expect(() =>
      decodeCancelAuth([entry(inv(TESTNET.approvalsId, 'cancel', [u64(7n)]))], expected),
    ).not.toThrow();
    expect(() =>
      decodeCancelAuth([entry(inv(TESTNET.approvalsId, 'cancel', [u64(8n)]))], expected),
    ).toThrow();
    expect(() => decodeCancelAuth([entry(execute())], expected)).toThrow();
  });
});
