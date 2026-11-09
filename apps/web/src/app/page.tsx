import Link from 'next/link';

export default function Home() {
  return (
    <>
      <h1>Funds Only Spent After Yes</h1>
      <p>
        FOSAY is a Stellar wallet you share with your AI agent. The agent gets its own key with a budget you
        set: small payments go through on their own, anything bigger waits for your yes, given with your
        passkey.
      </p>
      <div className="card">
        <ol>
          <li>Create a wallet secured by a passkey (no seed phrase).</li>
          <li>Connect your agent: paste its public key and set a budget and per-payment cap.</li>
          <li>Approve or reject bigger payments from your phone. Pause or revoke the agent any time.</li>
        </ol>
      </div>
      <div className="actions">
        <Link className="button" href="/onboard">
          Create wallet
        </Link>
        <Link href="/dashboard">I already have one</Link>
      </div>
      <p className="muted">Testnet only. Not audited.</p>
    </>
  );
}
