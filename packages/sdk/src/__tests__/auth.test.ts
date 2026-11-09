import { Address, Keypair, StrKey, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { AgentSigner, classifyAgentEntry } from '../auth';
import { TESTNET } from '../config';

const wallet = StrKey.encodeContract(Buffer.alloc(32, 1));
const other = StrKey.encodeContract(Buffer.alloc(32, 2));
const id = { wallet, payRule: 1, askRule: 2 };
const agent = Keypair.random();

function entry(contract: string, fn: string, args: xdr.ScVal[], opts: { for?: string; subs?: number } = {}) {
  const invocation = (c: string, f: string, a: xdr.ScVal[], subs: xdr.SorobanAuthorizedInvocation[] = []) =>
    new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
        new xdr.InvokeContractArgs({
          contractAddress: new Address(c).toScAddress(),
          functionName: f,
          args: a,
        }),
      ),
      subInvocations: subs,
    });
  const subs = Array.from({ length: opts.subs ?? 0 }, () => invocation(TESTNET.usdcId, 'transfer', []));
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: new Address(opts.for ?? wallet).toScAddress(),
        nonce: xdr.Int64.fromString('42'),
        signatureExpirationLedger: 0,
        signature: xdr.ScVal.scvVoid(),
      }),
    ),
    rootInvocation: invocation(contract, fn, args, subs),
  });
}

const a = (s: string) => new Address(s).toScVal();
const i128 = (n: bigint) => nativeToScVal(n, { type: 'i128' });
const transfer = (from = wallet) =>
  entry(TESTNET.usdcId, 'transfer', [a(from), a(agent.publicKey()), i128(10n)]);

describe('classifyAgentEntry', () => {
  it('maps the three agent actions to the right rule', () => {
    expect(classifyAgentEntry(TESTNET, id, transfer())).toEqual({ action: 'transfer', contextRuleIds: [1] });
    expect(
      classifyAgentEntry(TESTNET, id, entry(TESTNET.approvalsId, 'propose', [a(wallet), a(TESTNET.usdcId)])),
    ).toEqual({ action: 'propose', contextRuleIds: [2] });
    expect(
      classifyAgentEntry(
        TESTNET,
        id,
        entry(TESTNET.approvalsId, 'cancel', [nativeToScVal(7n, { type: 'u64' })]),
      ),
    ).toEqual({ action: 'cancel', contextRuleIds: [2] });
  });

  it('refuses everything else', () => {
    const refused = [
      transfer(other), // someone else's funds
      entry(TESTNET.usdcId, 'transfer', [a(wallet), a(other), i128(1n)], { for: other }), // other credential
      entry(TESTNET.usdcId, 'approve', [a(wallet), a(other), i128(1n), xdr.ScVal.scvU32(9)]),
      entry(TESTNET.approvalsId, 'execute', [nativeToScVal(1n, { type: 'u64' })], { subs: 1 }),
      entry(wallet, 'add_context_rule', []), // account mutation
      entry(TESTNET.mandatePolicyId, 'set_paused', [
        a(wallet),
        xdr.ScVal.scvU32(1),
        xdr.ScVal.scvBool(false),
      ]),
      entry(other, 'transfer', [a(wallet), a(other), i128(1n)]), // a different token
    ];
    for (const e of refused) expect(() => classifyAgentEntry(TESTNET, id, e)).toThrow(/refuses/);
  });
});

describe('AgentSigner', () => {
  it('signs an allowed entry offline and sets the expiration', async () => {
    const s = new AgentSigner(TESTNET, id, agent.secret());
    expect(s.publicKey).toEqual(agent.rawPublicKey());
    const signed = await s.sign(transfer(), 123_456);
    const creds = signed.credentials().address();
    expect(creds.signatureExpirationLedger()).toBe(123_456);
    expect(creds.signature().switch().name).toBe('scvMap'); // OZ AuthPayload
  });

  it('refuses before signing and rejects bad secrets without echoing them', async () => {
    const s = new AgentSigner(TESTNET, id, agent.secret());
    await expect(s.sign(transfer(other), 1)).rejects.toThrow(/refuses/);
    expect(() => new AgentSigner(TESTNET, id, 'SNOTAKEY')).toThrow(/not a valid Stellar secret/);
  });
});
