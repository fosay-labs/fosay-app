'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useWallet } from '@/components/useWallet';
import { api } from '@/lib/api';
import type { ApiIntent } from '@/lib/api';
import { short, usdc } from '@/lib/format';

export default function Approvals() {
  const { address, loading } = useWallet();
  const [items, setItems] = useState<ApiIntent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    api
      .intents(address)
      .then(setItems)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [address]);

  if (loading) return <p className="muted">Loading…</p>;
  if (!address)
    return (
      <p>
        <Link href="/onboard">Connect your wallet</Link> to see requests.
      </p>
    );

  const pending = items?.filter((i) => i.status === 'Pending') ?? [];
  const done = items?.filter((i) => i.status !== 'Pending') ?? [];
  return (
    <>
      <h1>Approvals</h1>
      {error && <p className="error">{error}</p>}
      {items && pending.length === 0 && <p className="muted">Nothing waiting for you.</p>}
      {pending.map((i) => (
        <Link
          key={i.id}
          href={`/approvals/${i.id}`}
          className="card warning"
          style={{ display: 'block', color: 'inherit' }}
        >
          <div className="row">
            <strong>{usdc(i.amount)}</strong>
            <span className="badge Pending">needs your yes</span>
          </div>
          <div>{i.memo}</div>
          <div className="muted">to {short(i.to)}</div>
        </Link>
      ))}
      {done.length > 0 && <h2>History</h2>}
      {done.map((i) => (
        <Link key={i.id} href={`/approvals/${i.id}`} className="card row" style={{ color: 'inherit' }}>
          <div>
            <div>{i.memo}</div>
            <div className="muted">
              #{i.id} to {short(i.to)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div>{usdc(i.amount)}</div>
            <span className={`badge ${i.status}`}>{i.status}</span>
          </div>
        </Link>
      ))}
    </>
  );
}
