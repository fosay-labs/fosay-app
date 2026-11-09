'use client';

import { useEffect, useState } from 'react';

import { currentSubscription, disablePush, enablePush, pushSupported } from '@/lib/push';

/** Turns approval-request notifications on/off for this device. */
export function PushToggle({ wallet }: { wallet: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    currentSubscription()
      .then((s) => setOn(Boolean(s)))
      .catch(() => setOn(false));
  }, []);

  if (!pushSupported()) return <p className="muted">This browser can&apos;t receive push notifications.</p>;

  async function toggle() {
    setError(null);
    try {
      if (on) await disablePush();
      else await enablePush(wallet);
      setOn(!on);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="card row">
      <div>
        <strong>Approval notifications</strong>
        <div className="muted">Get a notification on this device when your agent asks for a yes.</div>
        {error && <div className="error">{error}</div>}
      </div>
      <button className="secondary" onClick={() => void toggle()} disabled={on === null}>
        {on ? 'Turn off' : 'Turn on'}
      </button>
    </div>
  );
}
