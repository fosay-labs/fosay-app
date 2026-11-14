import { FosayError } from '@fosay/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { describe, expect, it, vi } from 'vitest';

import { LEDGERS_PER_HOUR, registerFosayTools } from '../tools';
import type { AgentLike, FetchPaid } from '../tools';

const wallet = StrKey.encodeContract(Buffer.alloc(32, 6));
const payTo = Keypair.random().publicKey();

function fakeAgent(): AgentLike {
  return {
    identity: { wallet, payRule: 1, askRule: 2 },
    status: vi.fn(async () => ({
      wallet,
      payRule: 1,
      askRule: 2,
      agentPublicKey: 'ab'.repeat(32),
      balance: 1_000_000_000n,
      budget: 50_000_000n,
      remaining: 30_000_000n,
      maxPerTx: 20_000_000n,
      periodLedgers: 17_280,
      paused: false,
      pendingRequests: 1,
    })),
    propose: vi.fn(async () => ({ intentId: 7n, hash: 'cafe' })),
    cancel: vi.fn(async () => ({ hash: 'beef' })),
    requestStatus: vi.fn(async (id: bigint) => {
      if (id === 404n) throw new FosayError('NotFound', 'no such request');
      return {
        id,
        account: wallet,
        token: 'C',
        to: payTo,
        amount: 25_000_000n,
        mandateHash: '00',
        memo: 'need data',
        createdLedger: 1,
        expiresLedger: 99,
        status: 'Pending' as const,
      };
    }),
  } as unknown as AgentLike;
}

async function connect(agent: AgentLike, fetchPaid?: FetchPaid) {
  const server = new McpServer({ name: 'fosay', version: 'test' });
  registerFosayTools(server, agent, fetchPaid ? { fetchPaid } : {});
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as {
      content: { type: string; text: string }[];
      isError?: boolean;
    };
    return {
      isError: r.isError ?? false,
      data: JSON.parse(r.content[0]?.text ?? 'null') as Record<string, unknown>,
    };
  };
  return { client, call };
}

describe('FOSAY MCP tools', () => {
  it('lists the six wallet tools', async () => {
    const { client } = await connect(fakeAgent());
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'fosay_approval_status',
      'fosay_budget',
      'fosay_cancel_request',
      'fosay_fetch_paid',
      'fosay_request_approval',
      'fosay_wallet_status',
    ]);
  });

  it('reports status with USDC and base-unit amounts, never the key', async () => {
    const { call } = await connect(fakeAgent());
    const { data } = await call('fosay_wallet_status');
    expect(data['remainingBudget']).toEqual({ usdc: '3', baseUnits: '30000000' });
    expect(data['maxPerPayment']).toEqual({ usdc: '2', baseUnits: '20000000' });
    expect(JSON.stringify(data)).not.toMatch(/agentPublicKey|secret/);
  });

  it('reports budget with remaining, budget, maxPerTx and periodHours, never the key', async () => {
    const { call } = await connect(fakeAgent());
    const { data, isError } = await call('fosay_budget', {});
    expect(isError).toBe(false);
    expect(data).toEqual({
      remaining: { usdc: '3', baseUnits: '30000000' },
      budget: { usdc: '5', baseUnits: '50000000' },
      maxPerTx: { usdc: '2', baseUnits: '20000000' },
      periodHours: 24,
    });
    expect(JSON.stringify(data)).not.toMatch(/agentPublicKey|secret/);
  });

  it('fetch_paid: returns paid responses and approval requests', async () => {
    const paid: FetchPaid = vi.fn(async () => ({
      kind: 'response' as const,
      response: new Response('{"price":1}', { status: 200 }),
      paid: true,
      transaction: 'f00d',
    }));
    const r1 = await (
      await connect(fakeAgent(), paid)
    ).call('fosay_fetch_paid', {
      url: 'https://api.example.com/x',
      maxAmount: '1.5',
    });
    expect(r1.data).toMatchObject({ outcome: 'paid', status: 200, transaction: 'f00d', body: '{"price":1}' });
    expect(paid).toHaveBeenCalledWith(
      'https://api.example.com/x',
      { method: 'GET' },
      { maxAmount: 15_000_000n },
    );

    const asked: FetchPaid = vi.fn(async () => ({
      kind: 'approval_requested' as const,
      intentId: 7n,
      hash: 'cafe',
      amount: 25_000_000n,
      payTo,
      reason: 'over_per_tx_cap' as const,
    }));
    const r2 = await (
      await connect(fakeAgent(), asked)
    ).call('fosay_fetch_paid', { url: 'https://api.example.com/x' });
    expect(r2.data).toMatchObject({
      outcome: 'approval_requested',
      requestId: '7',
      reason: 'over_per_tx_cap',
      amount: { usdc: '2.5', baseUnits: '25000000' },
    });
  });

  it('request_approval converts USDC and hours, and validates the address', async () => {
    const agent = fakeAgent();
    const { call } = await connect(agent);
    const r = await call('fosay_request_approval', {
      to: payTo,
      amount: '2.5',
      memo: 'dataset',
      ttlHours: 2,
    });
    expect(r.data).toMatchObject({ requestId: '7', amount: { usdc: '2.5', baseUnits: '25000000' } });
    expect(agent.propose).toHaveBeenCalledWith({
      to: payTo,
      amount: 25_000_000n,
      memo: 'dataset',
      ttlLedgers: 2 * LEDGERS_PER_HOUR,
    });
    const bad = await call('fosay_request_approval', { to: 'nope', amount: '1', memo: 'x' });
    expect(bad).toMatchObject({ isError: true, data: { error: 'INVALID_INPUT' } });
  });

  it('approval_status and cancel, with typed errors', async () => {
    const { call } = await connect(fakeAgent());
    expect((await call('fosay_approval_status', { requestId: '3' })).data).toMatchObject({
      id: '3',
      status: 'Pending',
      amount: { usdc: '2.5', baseUnits: '25000000' },
    });
    expect(await call('fosay_approval_status', { requestId: '404' })).toMatchObject({
      isError: true,
      data: { error: 'NotFound' },
    });
    expect((await call('fosay_cancel_request', { requestId: '3' })).data).toMatchObject({ cancelled: true });
  });
});
