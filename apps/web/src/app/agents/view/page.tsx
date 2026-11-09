'use client';

import { fromBaseUnits, mandateHash, toBaseUnits, toHex } from '@fosay/sdk';
import type { Mandate, MandateDoc } from '@fosay/sdk';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

import { useWallet } from '@/components/useWallet';
import { api } from '@/lib/api';
import type { ApiAgent } from '@/lib/api';
import { API_URL, publicConfig } from '@/lib/config';
import { period, usdc } from '@/lib/format';
import { OWNER_RULE, getKit, getReader, signAndSubmit, signAndSubmitAdmin } from '@/lib/kit';

function AgentSettings() {
  const rule = useSearchParams().get('rule') ?? '';
  const payRule = /^\d+$/.test(rule) ? Number(rule) : NaN;
  const { address, loading } = useWallet();
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [remaining, setRemaining] = useState<bigint | null>(null);
  const [agent, setAgent] = useState<ApiAgent | null>(null);
  const [budget, setBudget] = useState('');
  const [maxPerTx, setMaxPerTx] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);

  const load = useCallback(async () => {
    if (!address || !Number.isInteger(payRule)) return;
    const reader = getReader();
    const [m, r, w] = await Promise.all([
      reader.getMandate(address, payRule),
      reader.remainingBudget(address, payRule),
      api.wallet(address).catch(() => null),
    ]);
    setMandate(m);
    setRemaining(r);
    setBudget(fromBaseUnits(m.budget));
    setMaxPerTx(fromBaseUnits(m.maxPerTx));
    setAgent(w?.agents.find((a) => a.payRule === payRule) ?? null);
  }, [address, payRule]);

  useEffect(() => {
    load().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [load]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      await load().catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const togglePause = () =>
    run(mandate?.paused ? 'Unpausing…' : 'Pausing…', async () => {
      if (!address || !mandate) return;
      const tx = await getReader()
        .mandatePolicyContract()
        .set_paused({ smart_account: address, context_rule_id: payRule, paused: !mandate.paused });
      await signAndSubmit(tx, [OWNER_RULE]);
    });

  const saveLimits = () =>
    run('Saving limits…', async () => {
      if (!address || !mandate) return;
      const newBudget = toBaseUnits(budget);
      const newMax = toBaseUnits(maxPerTx);
      if (newMax > newBudget) throw new Error('Max per payment cannot exceed the budget.');
      const old = (
        await fetch(`${API_URL}/mandate-docs/${mandate.mandateHash}`)
          .then((r) => (r.ok ? (r.json() as Promise<{ doc: MandateDoc }>) : null))
          .catch(() => null)
      )?.doc;
      const doc: MandateDoc = {
        v: 1,
        agentName: old?.agentName ?? agent?.name ?? 'agent',
        purpose: old?.purpose ?? 'updated mandate',
        token: publicConfig.usdcId,
        budget: newBudget.toString(),
        periodLedgers: mandate.periodLedgers,
        maxPerTx: newMax.toString(),
        recipients: mandate.recipients,
        validUntilLedger: old?.validUntilLedger ?? null,
        createdAt: new Date().toISOString(),
      };
      const hash = toHex(mandateHash(doc));
      if ((await api.saveMandateDoc(doc)) !== hash)
        throw new Error('API returned a different mandate hash; aborting.');
      const tx = await getReader()
        .mandatePolicyContract()
        .update_mandate({
          smart_account: address,
          context_rule_id: payRule,
          budget: newBudget,
          max_per_tx: newMax,
          recipients: mandate.recipients,
          mandate_hash: Buffer.from(hash, 'hex'),
        });
      await signAndSubmit(tx, [OWNER_RULE]);
    });

  const revoke = () =>
    run('Revoking (2 passkey prompts)…', async () => {
      const kit = getKit();
      await signAndSubmitAdmin(await kit.rules.remove(payRule));
      if (agent) await signAndSubmitAdmin(await kit.rules.remove(agent.askRule));
      setRevoked(true);
    });

  if (loading) return <p className="muted">Loading…</p>;
  if (!address)
    return (
      <p>
        <Link href="/onboard">Connect your wallet</Link> first.
      </p>
    );
  if (revoked) return <p>Agent revoked. It can no longer pay or ask from this wallet.</p>;
  if (error && !mandate) return <p className="error">{error}</p>;
  if (!mandate) return <p className="muted">Loading agent…</p>;

  return (
    <>
      <h1>{agent?.name ?? `Agent (rule ${payRule})`}</h1>
      <div className="card">
        <div className="row">
          <div>
            <div className="muted">Left this period</div>
            <div className="amount">{remaining === null ? '…' : usdc(remaining)}</div>
          </div>
          {mandate.paused && <span className="badge">paused</span>}
        </div>
        <p className="muted">
          Budget {usdc(mandate.budget)} per {period(mandate.periodLedgers)} · max {usdc(mandate.maxPerTx)} per
          payment ·{' '}
          {mandate.recipients.length ? `${mandate.recipients.length} allowed recipients` : 'any recipient'}
        </p>
        {agent && <div className="mono muted">agent key {agent.agentPublicKey}</div>}
      </div>

      <h2>Limits</h2>
      <div className="card">
        <div className="row">
          <div style={{ flex: 1 }}>
            <label htmlFor="budget">Budget (USDC)</label>
            <input id="budget" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="max">Max per payment (USDC)</label>
            <input id="max" value={maxPerTx} onChange={(e) => setMaxPerTx(e.target.value)} />
          </div>
        </div>
        <div className="actions">
          <button onClick={() => void saveLimits()} disabled={busy !== null}>
            Save limits
          </button>
        </div>
      </div>

      <div className="actions">
        <button className="secondary" onClick={() => void togglePause()} disabled={busy !== null}>
          {mandate.paused ? 'Unpause agent' : 'Pause agent'}
        </button>
        <button className="danger" onClick={() => void revoke()} disabled={busy !== null}>
          Revoke agent
        </button>
      </div>
      {busy && <p className="muted">{busy}</p>}
      {error && <p className="error">{error}</p>}
    </>
  );
}

// Static export (GitHub Pages) has no dynamic segments, so the rule comes from the query string.
export default function Page() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <AgentSettings />
    </Suspense>
  );
}
