'use client';

import { latestLedger, mandateHash, mandateParamsToScVal, toHex } from '@fosay/sdk';
import Link from 'next/link';
import { useState } from 'react';
import { createCallContractContext, createEd25519Signer } from 'smart-account-kit';

import { useWallet } from '@/components/useWallet';
import { api } from '@/lib/api';
import { publicConfig } from '@/lib/config';
import { getKit, getReader, signAndSubmitAdmin } from '@/lib/kit';
import { PERIODS, buildMandate } from '@/lib/mandate-form';
import type { AgentForm } from '@/lib/mandate-form';

const initial: AgentForm = {
  name: '',
  purpose: '',
  agentPublicKey: '',
  budget: '25',
  periodLedgers: PERIODS[0].ledgers,
  maxPerTx: '5',
  recipients: '',
  validDays: 30,
};

export default function ConnectAgent() {
  const { address, loading } = useWallet();
  const [form, setForm] = useState<AgentForm>(initial);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pairing, setPairing] = useState<{ code: string; payRule: number; askRule: number } | null>(null);
  const set = <K extends keyof AgentForm>(k: K, v: AgentForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function connect() {
    if (!address) return;
    setError(null);
    try {
      setStep('Preparing mandate…');
      const latest = await latestLedger(getReader().server);
      const m = buildMandate(form, publicConfig, latest, new Date());
      const hash = toHex(mandateHash(m.doc));
      const stored = await api.saveMandateDoc(m.doc);
      if (stored !== hash) throw new Error('API returned a different mandate hash; aborting.');

      const kit = getKit();
      const signer = createEd25519Signer(publicConfig.ed25519VerifierId, m.agentKey);
      const payRule = await kit.rules.count();
      setStep('Passkey 1 of 2: allow the agent to pay within the mandate…');
      const params = mandateParamsToScVal({
        budget: m.budget,
        periodLedgers: form.periodLedgers,
        maxPerTx: m.maxPerTx,
        recipients: m.recipients,
        mandateHash: Buffer.from(hash, 'hex'),
      });
      await signAndSubmitAdmin(
        await kit.rules.add(
          createCallContractContext(publicConfig.usdcId),
          m.ruleNames.pay,
          [signer],
          new Map([[publicConfig.mandatePolicyId, params]]),
          m.validUntilLedger,
        ),
      );
      const askRule = await kit.rules.count();
      setStep('Passkey 2 of 2: allow the agent to ask you for approval…');
      await signAndSubmitAdmin(
        await kit.rules.add(
          createCallContractContext(publicConfig.approvalsId),
          m.ruleNames.ask,
          [signer],
          new Map(),
          m.validUntilLedger,
        ),
      );
      const [pay, ask] = await Promise.all([kit.rules.get(payRule), kit.rules.get(askRule)]);
      if (pay.result.name !== m.ruleNames.pay || ask.result.name !== m.ruleNames.ask) {
        throw new Error(
          'Rules were added but their ids could not be confirmed; check the wallet before pairing.',
        );
      }

      setStep('Registering the agent…');
      const code = await api.pairing({
        wallet: address,
        payRule,
        askRule,
        agentPublicKey: m.agentKey.toString('hex'),
        name: m.doc.agentName,
        mandateHash: hash,
      });
      setPairing({ code, payRule, askRule });
      setStep(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep(null);
    }
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (!address)
    return (
      <p>
        <Link href="/onboard">Create or connect your wallet</Link> first.
      </p>
    );

  if (pairing) {
    return (
      <>
        <h1>Agent connected</h1>
        <div className="card">
          <p>On the agent&apos;s machine, run:</p>
          <pre className="mono">fosay-agent pair {pairing.code}</pre>
          <p className="muted">
            Pay rule {pairing.payRule}, ask rule {pairing.askRule}. The code contains no secrets.
          </p>
        </div>
        <Link href={`/agents/view?rule=${pairing.payRule}`}>View this agent</Link>
      </>
    );
  }

  return (
    <>
      <h1>Connect an agent</h1>
      <p className="muted">
        The agent signs with its own key. It can spend only within this mandate; bigger payments need your
        yes.
      </p>
      <div className="card">
        <label htmlFor="name">Agent name</label>
        <input
          id="name"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="research-bot"
        />
        <label htmlFor="purpose">What may it spend on?</label>
        <textarea
          id="purpose"
          rows={2}
          value={form.purpose}
          onChange={(e) => set('purpose', e.target.value)}
          placeholder="Paid APIs and datasets for market research"
        />
        <label htmlFor="key">Agent public key (from `fosay-agent pubkey`)</label>
        <input
          id="key"
          className="mono"
          value={form.agentPublicKey}
          onChange={(e) => set('agentPublicKey', e.target.value)}
        />
        <div className="row">
          <div style={{ flex: 1 }}>
            <label htmlFor="budget">Budget (USDC)</label>
            <input
              id="budget"
              inputMode="decimal"
              value={form.budget}
              onChange={(e) => set('budget', e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="period">Period</label>
            <select
              id="period"
              value={form.periodLedgers}
              onChange={(e) => set('periodLedgers', Number(e.target.value))}
            >
              {PERIODS.map((p) => (
                <option key={p.ledgers} value={p.ledgers}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="max">Max per payment (USDC)</label>
            <input
              id="max"
              inputMode="decimal"
              value={form.maxPerTx}
              onChange={(e) => set('maxPerTx', e.target.value)}
            />
          </div>
        </div>
        <label htmlFor="recipients">Only pay these addresses (optional, one per line)</label>
        <textarea
          id="recipients"
          rows={2}
          className="mono"
          value={form.recipients}
          onChange={(e) => set('recipients', e.target.value)}
        />
        <label htmlFor="days">Valid for (days)</label>
        <input
          id="days"
          type="number"
          min={1}
          max={365}
          value={form.validDays}
          onChange={(e) => set('validDays', Number(e.target.value))}
        />
        <div className="actions">
          <button onClick={() => void connect()} disabled={step !== null}>
            {step ?? 'Connect agent (2 passkey prompts)'}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}
