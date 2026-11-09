'use client';

import type { Intent } from '@fosay/sdk';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

import { useWallet } from '@/components/useWallet';
import { api } from '@/lib/api';
import type { ApiIntent } from '@/lib/api';
import { publicConfig } from '@/lib/config';
import { decodeApprovalAuth, decodeCancelAuth, mismatches } from '@/lib/decode-auth';
import type { DecodedApproval } from '@/lib/decode-auth';
import { usdc } from '@/lib/format';
import { OWNER_RULE, getReader, signAndSubmit } from '@/lib/kit';

type ExecuteTx = Awaited<
  ReturnType<ReturnType<ReturnType<typeof getReader>['approvalsContract']>['execute']>
>;

function ReviewRequest() {
  const id = useSearchParams().get('id') ?? '';
  const { address, loading } = useWallet();
  const [onChain, setOnChain] = useState<Intent | null>(null);
  const [fromApi, setFromApi] = useState<ApiIntent | null>(null);
  const [signed, setSigned] = useState<DecodedApproval | null>(null);
  const [tx, setTx] = useState<ExecuteTx | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address || !/^\d+$/.test(id)) return;
    setError(null);
    const intentId = BigInt(id);
    const reader = getReader();
    const intent = await reader.getIntent(intentId);
    setOnChain(intent);
    setFromApi(await api.intent(id).catch(() => null));
    if (intent.account !== address) throw new Error('This request is for a different wallet.');
    if (intent.status !== 'Pending') return;
    // Build the exact transaction the passkey would sign and decode its authorization.
    const t = await reader.approvalsContract().execute({ id: intentId });
    const decoded = decodeApprovalAuth(t.simulationData.result.auth, {
      wallet: address,
      approvalsId: publicConfig.approvalsId,
      intentId,
    });
    setTx(t);
    setSigned(decoded);
    setProblems([
      ...mismatches(decoded, intent).map((p) => `on-chain request: ${p}`),
      ...(decoded.token !== publicConfig.usdcId ? ['token is not the configured USDC'] : []),
    ]);
  }, [address, id]);

  useEffect(() => {
    load().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [load]);

  async function approve() {
    if (!tx) return;
    setBusy('Waiting for your passkey…');
    setError(null);
    try {
      const hash = await signAndSubmit(tx, [OWNER_RULE, OWNER_RULE]);
      setDone(`Approved and paid. Transaction ${hash}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    if (!address) return;
    setBusy('Waiting for your passkey…');
    setError(null);
    try {
      const intentId = BigInt(id);
      const t = await getReader().approvalsContract().cancel({ id: intentId });
      decodeCancelAuth(t.simulationData.result.auth, {
        wallet: address,
        approvalsId: publicConfig.approvalsId,
        intentId,
      });
      const hash = await signAndSubmit(t, [OWNER_RULE]);
      setDone(`Rejected. Transaction ${hash}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (!address)
    return (
      <p>
        <Link href="/onboard">Connect your wallet</Link> to review this request.
      </p>
    );
  if (error && !onChain) return <p className="error">{error}</p>;
  if (!onChain) return <p className="muted">Loading request #{id}…</p>;

  const doc = fromApi?.mandateDoc;
  return (
    <>
      <h1>Request #{id}</h1>
      <div className={`card ${onChain.status === 'Pending' ? 'warning' : ''}`}>
        <div className="row">
          <div className="amount">{usdc(signed?.amount ?? onChain.amount)}</div>
          <span className={`badge ${onChain.status}`}>{onChain.status}</span>
        </div>
        <p>&ldquo;{onChain.memo}&rdquo;</p>
        <div className="muted">Pay to</div>
        <div className="mono">{signed?.to ?? onChain.to}</div>
        {doc && (
          <p className="muted">
            Agent <strong>{doc.agentName}</strong> · mandate: {doc.purpose}
          </p>
        )}
        <p className="muted">Expires at ledger {onChain.expiresLedger}.</p>
      </div>

      {signed && (
        <div className="card">
          <strong>What your passkey will sign</strong>
          <p className="muted">
            approvals.execute(#{signed.intentId.toString()}) → transfer {usdc(signed.amount)} from your wallet
            to <span className="mono">{signed.to}</span>. Decoded from the transaction itself, not from the
            server.
          </p>
        </div>
      )}
      {problems.length > 0 && (
        <div className="card error">
          <strong>Don&apos;t approve: the transaction does not match the request.</strong>
          <ul>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {done ? (
        <p>{done}</p>
      ) : (
        onChain.status === 'Pending' && (
          <div className="actions">
            <button onClick={() => void approve()} disabled={!tx || problems.length > 0 || busy !== null}>
              {busy ?? `Approve ${usdc(signed?.amount ?? onChain.amount)}`}
            </button>
            <button className="secondary" onClick={() => void reject()} disabled={busy !== null}>
              Reject
            </button>
          </div>
        )
      )}
      {error && <p className="error">{error}</p>}
    </>
  );
}

// Static export (GitHub Pages) has no dynamic segments, so the id comes from the query string.
export default function Page() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <ReviewRequest />
    </Suspense>
  );
}
