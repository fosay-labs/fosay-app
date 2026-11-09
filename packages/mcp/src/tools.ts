import { fosayFetch } from '@fosay/agent';
import type { AgentStatus, FosayAgent, FosayFetchOptions, FosayFetchResult } from '@fosay/agent';
import { FosayError, decodeError, fromBaseUnits, toBaseUnits } from '@fosay/sdk';
import type { Intent } from '@fosay/sdk';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StrKey } from '@stellar/stellar-sdk';
import { z } from 'zod';

/** Ledgers per hour at ~5 s per ledger. */
export const LEDGERS_PER_HOUR = 720;
/** Response bodies returned to the model are truncated to this many characters. */
export const MAX_BODY_CHARS = 20_000;

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

export function intentView(i: Intent) {
  return {
    id: i.id.toString(),
    status: i.status,
    amount: money(i.amount),
    to: i.to,
    memo: i.memo,
    expiresLedger: i.expiresLedger,
  };
}

const usdcAmount = z
  .string()
  .regex(/^\d+(\.\d{1,7})?$/, 'a positive USDC amount like "2.5"')
  .describe('Amount in USDC, e.g. "2.5"');

export type FetchPaid = (
  url: string,
  init: RequestInit,
  opts: FosayFetchOptions,
) => Promise<FosayFetchResult>;

/** Registers the FOSAY wallet tools on an MCP server. */
export function registerFosayTools(
  server: McpServer,
  agent: AgentLike,
  deps: { fetchPaid?: FetchPaid } = {},
): void {
  const fetchPaid: FetchPaid =
    deps.fetchPaid ?? ((url, init, opts) => fosayFetch(agent as FosayAgent, url, init, opts));

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

  server.registerTool(
    'fosay_fetch_paid',
    {
      title: 'Fetch a URL, paying x402 from the FOSAY wallet',
      description:
        'Fetches a URL. If it answers HTTP 402 (x402 on Stellar), pays from the FOSAY wallet when the price fits ' +
        'the mandate and maxAmount; otherwise opens an approval request for the owner and returns its id ' +
        'instead of paying. Check later with fosay_approval_status.',
      inputSchema: {
        url: z.url().describe('URL to fetch'),
        method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
        body: z.string().max(100_000).optional().describe('Request body (sent as-is)'),
        maxAmount: usdcAmount.optional().describe('Never pay more than this in one payment (USDC)'),
      },
    },
    async ({ url, method, body, maxAmount }) => {
      try {
        const r = await fetchPaid(
          url,
          { method: method ?? 'GET', ...(body === undefined ? {} : { body }) },
          maxAmount === undefined ? {} : { maxAmount: toBaseUnits(maxAmount) },
        );
        if (r.kind === 'approval_requested') {
          return ok({
            outcome: 'approval_requested',
            reason: r.reason,
            requestId: r.intentId.toString(),
            amount: money(r.amount),
            payTo: r.payTo,
            note: 'Not paid. The wallet owner was asked to approve this payment.',
          });
        }
        const text = await r.response.text();
        return ok({
          outcome: r.paid ? 'paid' : 'free',
          status: r.response.status,
          ...(r.transaction ? { transaction: r.transaction } : {}),
          body: text.length > MAX_BODY_CHARS ? `${text.slice(0, MAX_BODY_CHARS)}…[truncated]` : text,
        });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'fosay_request_approval',
    {
      title: 'Ask the wallet owner to approve a payment',
      description:
        'Opens an approval request on the FOSAY wallet for a payment the agent cannot make on its own ' +
        '(over budget or over the per-payment cap). The owner approves or rejects it on their phone.',
      inputSchema: {
        to: z.string().describe('Recipient Stellar address (G… or C…)'),
        amount: usdcAmount,
        memo: z.string().min(1).max(140).describe('Why the agent needs this payment (shown to the owner)'),
        ttlHours: z
          .number()
          .int()
          .min(1)
          .max(168)
          .optional()
          .describe('How long the request stays open (default 24)'),
      },
    },
    async ({ to, amount, memo, ttlHours }) => {
      try {
        if (!StrKey.isValidEd25519PublicKey(to) && !StrKey.isValidContract(to)) {
          throw new FosayError('INVALID_INPUT', `not a Stellar address: ${to}`);
        }
        const units = toBaseUnits(amount);
        const { intentId, hash } = await agent.propose({
          to,
          amount: units,
          memo,
          ttlLedgers: (ttlHours ?? 24) * LEDGERS_PER_HOUR,
        });
        return ok({ requestId: intentId.toString(), amount: money(units), to, transaction: hash });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'fosay_approval_status',
    {
      title: 'Status of an approval request',
      description: 'Pending, Executed (approved and paid), Cancelled (rejected or withdrawn) or Expired.',
      inputSchema: { requestId: z.string().regex(/^\d+$/).describe('Request id returned earlier') },
    },
    async ({ requestId }) => {
      try {
        return ok(intentView(await agent.requestStatus(BigInt(requestId))));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    'fosay_cancel_request',
    {
      title: 'Withdraw an approval request',
      description: "Withdraws one of this wallet's pending approval requests.",
      inputSchema: { requestId: z.string().regex(/^\d+$/) },
    },
    async ({ requestId }) => {
      try {
        const { hash } = await agent.cancel(BigInt(requestId));
        return ok({ requestId, cancelled: true, transaction: hash });
      } catch (e) {
        return fail(e);
      }
    },
  );
}
