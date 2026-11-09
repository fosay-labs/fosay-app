import type { AgentStatus, FosayAgent } from '@fosay/agent';
import { decodeError, fromBaseUnits } from '@fosay/sdk';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** The part of `FosayAgent` the tools use (lets tests pass a fake). */
export type AgentLike = Pick<FosayAgent, 'identity' | 'status' | 'propose' | 'cancel' | 'requestStatus'>;

export interface ToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

/** Amounts are reported in USDC and in base units (7 decimals). */
export function money(units: bigint): { usdc: string; baseUnits: string } {
  return { usdc: fromBaseUnits(units), baseUnits: units.toString() };
}

export function ok(data: unknown): ToolResult {
  const text = JSON.stringify(data, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v), 2);
  return { content: [{ type: 'text', text }] };
}

export function fail(e: unknown): ToolResult {
  const fe = decodeError(e);
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: fe.code, message: fe.message }) }],
    isError: true,
  };
}

export function statusView(s: AgentStatus) {
  return {
    wallet: s.wallet,
    balance: money(s.balance),
    budget: money(s.budget),
    remainingBudget: money(s.remaining),
    maxPerPayment: money(s.maxPerTx),
    periodLedgers: s.periodLedgers,
    paused: s.paused,
    pendingRequests: s.pendingRequests,
  };
}

/** Registers the FOSAY wallet tools on an MCP server. */
export function registerFosayTools(server: McpServer, agent: AgentLike): void {
  server.registerTool(
    'fosay_wallet_status',
    {
      title: 'FOSAY wallet status',
      description:
        'Balance, remaining budget, per-payment cap and pending approval requests of the FOSAY wallet this agent spends from.',
    },
    async () => {
      try {
        return ok(statusView(await agent.status()));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
