'use client';

import { useEffect, useState } from 'react';

import { restoreWallet } from '@/lib/kit';

/** The connected FOSAY wallet (restored from the stored passkey session, no prompt). */
export function useWallet(): { address: string | null; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ address: string | null; loading: boolean; error: string | null }>({
    address: null,
    loading: true,
    error: null,
  });
  useEffect(() => {
    let alive = true;
    restoreWallet()
      .then((address) => alive && setState({ address, loading: false, error: null }))
      .catch(
        (e: unknown) =>
          alive &&
          setState({ address: null, loading: false, error: e instanceof Error ? e.message : String(e) }),
      );
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
