import type { MandateDoc } from '@fosay/sdk';

import { API_URL } from './config';

export type IntentStatus = 'Pending' | 'Executed' | 'Cancelled' | 'Expired';

export interface ApiIntent {
  id: string;
  account: string;
  token: string;
  to: string;
  amount: string;
  memo: string;
  mandateHash: string;
  status: IntentStatus;
  expiresLedger: number;
  proposedLedger: number;
  proposedTx: string;
  closedLedger: number | null;
  closedTx: string | null;
  mandateDoc?: MandateDoc | null;
}

export interface ApiAgent {
  name: string;
  payRule: number;
  askRule: number;
  agentPublicKey: string;
  mandateHash: string;
  revoked: boolean;
}

export interface ApiMandate {
  ruleId: number;
  token: string;
  budget: string;
  periodLedgers: number;
  maxPerTx: string;
  recipients: string[];
  mandateHash: string;
  paused: boolean;
  uninstalled: boolean;
}

export interface ApiWallet {
  address: string;
  agents: ApiAgent[];
  mandates: ApiMandate[];
  pendingRequests: number;
}

export type ActivityItem =
  | { kind: 'payment'; ledger: number; at: string; txHash: string; to: string; amount: string; via: string }
  | {
      kind: 'request';
      ledger: number;
      txHash: string;
      id: string;
      to: string;
      amount: string;
      memo: string;
      status: IntentStatus;
    };

const TIMEOUT_MS = 15_000;

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) throw new Error(body.message ?? body.error ?? `API ${res.status}`);
  return body;
}

export const api = {
  wallet: (address: string) => call<ApiWallet>(`/wallets/${address}`),
  activity: (address: string, limit = 30) =>
    call<{ items: ActivityItem[] }>(`/wallets/${address}/activity?limit=${limit}`).then((r) => r.items),
  intents: (account: string, status?: IntentStatus) =>
    call<{ items: ApiIntent[] }>(`/intents?account=${account}${status ? `&status=${status}` : ''}`).then(
      (r) => r.items,
    ),
  intent: (id: string) => call<ApiIntent>(`/intents/${id}`),
  saveMandateDoc: (doc: MandateDoc) =>
    call<{ hash: string }>('/mandate-docs', { method: 'POST', body: JSON.stringify(doc) }).then(
      (r) => r.hash,
    ),
  pairing: (body: {
    wallet: string;
    payRule: number;
    askRule: number;
    agentPublicKey: string;
    name: string;
    mandateHash: string;
  }) =>
    call<{ code: string }>('/pairing', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.code),
  vapidKey: () => call<{ publicKey: string }>('/push/vapid-public-key').then((r) => r.publicKey),
  subscribePush: (wallet: string, subscription: PushSubscriptionJSON) =>
    call<{ ok: boolean }>('/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ wallet, subscription }),
    }),
  unsubscribePush: (endpoint: string) =>
    call<{ ok: boolean }>('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),
};
