'use client';

import Link from 'next/link';
import { useState } from 'react';

import { useWallet } from '@/components/useWallet';
import { publicConfig } from '@/lib/config';
import { connectWithPasskey, getKit } from '@/lib/kit';

export default function Onboard() {
  const { address: restored, loading } = useWallet();
  const [name, setName] = useState('');
  const [address, setAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wallet = address ?? restored;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const r = await getKit().createWallet('FOSAY', name.trim() || 'FOSAY owner', { autoSubmit: true });
      if (r.submitResult && !r.submitResult.success) throw new Error(r.submitResult.error.message);
      setAddress(r.contractId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      setAddress(await connectWithPasskey());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="muted">Loading…</p>;

  if (wallet) {
    return (
      <>
        <h1>Your FOSAY wallet</h1>
        <div className="card">
          <div className="muted">Address</div>
          <div className="mono">{wallet}</div>
        </div>
        <div className="card">
          <strong>Fund it with {publicConfig.network} USDC</strong>
          <p className="muted">
            Send USDC (token <span className="mono">{publicConfig.usdcId}</span>) to the address above. On
            testnet, use Circle&apos;s USDC faucet and pick Stellar. Fees are paid by the FOSAY relayer.
          </p>
        </div>
        <div className="actions">
          <Link className="button" href="/agents/new">
            Connect an agent
          </Link>
          <Link href="/dashboard">Go to wallet</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Create your wallet</h1>
      <p>Your passkey (Face ID, fingerprint or security key) controls the wallet. There is no seed phrase.</p>
      <div className="card">
        <label htmlFor="name">Name for this passkey</label>
        <input
          id="name"
          value={name}
          maxLength={64}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Ada's phone"
        />
        <div className="actions">
          <button onClick={() => void create()} disabled={busy}>
            {busy ? 'Waiting for passkey…' : 'Create wallet with passkey'}
          </button>
          <button className="secondary" onClick={() => void connect()} disabled={busy}>
            I already have one
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}
