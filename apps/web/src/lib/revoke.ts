import type { ContextRule } from 'smart-account-kit';

type RuleLike = Pick<ContextRule, 'id' | 'name' | 'signers'>;

/** Hex Ed25519 key of a rule's agent signer (External signer on the Ed25519 verifier). */
export function agentKeyOf(rule: RuleLike, ed25519Verifier: string): string | null {
  for (const s of rule.signers) {
    if (s.tag === 'External' && s.values[0] === ed25519Verifier)
      return Buffer.from(s.values[1]).toString('hex');
  }
  return null;
}

/**
 * Rule ids to remove when revoking the agent whose payment rule is `payRule`, read from the
 * wallet itself so it works without the API. The `:ask` rule is the one with the same agent
 * key and the matching name (or the id the API knows). It comes first: if the owner cancels
 * the second passkey prompt, the payment rule is still there and revoking can be retried.
 * Returns [] when nothing of this agent is left.
 */
export function rulesToRevoke(
  rules: RuleLike[],
  payRule: number,
  ed25519Verifier: string,
  knownAskRule?: number,
): number[] {
  const pay = rules.find((r) => r.id === payRule);
  const key = pay ? agentKeyOf(pay, ed25519Verifier) : null;
  const askName = pay?.name.endsWith(':pay') ? `${pay.name.slice(0, -4)}:ask` : null;
  const ask = rules
    .filter((r) => r.id !== 0 && r.id !== payRule)
    .filter(
      (r) =>
        r.id === knownAskRule ||
        (key !== null && agentKeyOf(r, ed25519Verifier) === key && r.name === askName),
    )
    .map((r) => r.id);
  return [...ask, ...(pay ? [payRule] : [])];
}
