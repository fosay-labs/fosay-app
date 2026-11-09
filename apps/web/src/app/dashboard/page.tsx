'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { PushToggle } from '@/components/PushToggle';
import { useWallet } from '@/components/useWallet';
import { api } from '@/lib/api';
import type { ActivityItem, ApiWallet } from '@/lib/api';
import { getReader } from '@/lib/kit';
import { VIA_LABEL, period, short, usdc } from '@/lib/format';

interface View {
  balance: bigint;
  wallet: ApiWallet | null;
  remaining: Record<number, bigint>;
  activity: ActivityItem[];
  apiError: string | null;
}

export default function Dashboard() {
  const { address, loading, error } = useWallet();
  const [view, setView] = useState<View | null>(null);

  useEffect(() => {
    if (!address) return;
    let alive = true;
    (async () => {
      const reader = getReader();
      const balance = await reader.tokenBalance(address);
      let wallet: ApiWallet | null = null;
      let activity: ActivityItem[] = [];
      let apiError: string | null = null;
      try {
        [wallet, activity] = await Promise.all([api.wallet(address), api.activity(address)]);
      } catch (e) {
        apiError = e instanceof Error ? e.message : String(e);
      }
      const remaining: Record<number, bigint> = {};
      for (const m of wallet?.mandates.filter((x) => !x.uninstalled) ?? []) {
        remaining[m.ruleId] = await reader.remainingBudget(address, m.ruleId);
      }
      if (alive) setView({ balance, wallet, remaining, activity, apiError });
    })().catch(
      (e: unknown) =>
        alive && setView({ balance: 0n, wallet: null, remaining: {}, activity: [], apiError: String(e) }),
    );
    return () => {
      alive = false;
    };
  }, [address]);

  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <p className="error">{error}</p>;
  if (!address)
    return (
      <p>
        No wallet connected. <Link href="/onboard">Create or connect one</Link>.
      </p>
    );

  const agents = view?.wallet?.agents.filter((a) => !a.revoked) ?? [];
  const mandates = view?.wallet?.mandates ?? [];
  return (
    <>
      <h1>Wallet</h1>
      <div className="card">
        <div className="muted">Balance</div>
        <div className="amount">{view ? usdc(view.balance) : '…'}</div>
        <div className="mono muted">{address}</div>
      </div>

      {view?.wallet && view.wallet.pendingRequests > 0 && (
        <Link href="/approvals" className="card warning" style={{ display: 'block' }}>
          {view.wallet.pendingRequests} payment request{view.wallet.pendingRequests > 1 ? 's' : ''} waiting
          for your yes →
        </Link>
      )}

      <PushToggle wallet={address} />

      <div className="row">
        <h2>Agents</h2>
        <Link href="/agents/new">+ Connect agent</Link>
      </div>
      {!view && <p className="muted">Loading agents…</p>}
      {view && agents.length === 0 && <p className="muted">No agents connected yet.</p>}
      {agents.map((a) => {
        const m = mandates.find((x) => x.ruleId === a.payRule);
        return (
          <Link
            key={a.payRule}
            href={`/agents/${a.payRule}`}
            className="card"
            style={{ display: 'block', color: 'inherit' }}
          >
            <div className="row">
              <strong>{a.name}</strong>
              {m?.paused && <span className="badge">paused</span>}
            </div>
            {m && (
              <div className="muted">
                {view?.remaining[a.payRule] !== undefined ? usdc(view.remaining[a.payRule] ?? 0n) : '…'} left
                of {usdc(m.budget)} per {period(m.periodLedgers)} · max {usdc(m.maxPerTx)} per payment
              </div>
            )}
          </Link>
        );
      })}

      <h2>Activity</h2>
      {view?.apiError && <p className="muted">Activity unavailable: {view.apiError}</p>}
      {!view && <p className="muted">Loading activity…</p>}
      {view?.activity.length === 0 && <p className="muted">Nothing yet.</p>}
      {view?.activity.map((i) => (
        <div key={`${i.kind}-${i.txHash}-${i.kind === 'request' ? i.id : i.to}`} className="card row">
          <div>
            <div>{i.kind === 'payment' ? (VIA_LABEL[i.via] ?? 'payment') : `request #${i.id}`}</div>
            <div className="muted">
              to {short(i.to)} {i.kind === 'request' && `· ${i.memo}`}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div>{usdc(i.amount)}</div>
            {i.kind === 'request' && <span className={`badge ${i.status}`}>{i.status}</span>}
          </div>
        </div>
      ))}
    </>
  );
}
