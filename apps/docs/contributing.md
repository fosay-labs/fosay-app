# Contributing

FOSAY decides when an AI agent may spend someone's money. Changes are reviewed for safety
first. Both repositories welcome contributions, and scoped tasks for Stellar Wave contributors
carry the `wave` label with a `tier/trivial`, `tier/medium` or `tier/high` complexity.

- Contract issues: [fosay-contract/issues](https://github.com/fosay-labs/fosay-contract/issues?q=is%3Aissue+is%3Aopen+label%3Awave)
- App, SDK, API and docs issues: [fosay-app/issues](https://github.com/fosay-labs/fosay-app/issues?q=is%3Aissue+is%3Aopen+label%3Awave)

## How to work on an issue

1. Comment "I'll take this" on the issue. One open claim per person. A claim with no activity
   for 7 days goes back to the pool.
2. Read the repository's `CONTRIBUTING.md`. For contracts, the security invariants in
   `docs/SPEC.md` are binding.
3. Issues marked `security-sensitive` need an agreed approach on the issue before code.
4. Branch from `main` (`feat/…`, `fix/…`, `test/…`, `docs/…`, `chore/…`) and use
   Conventional Commit subjects.
5. Run the checks and paste the real output in the pull request:

::: code-group

```bash [fosay-contract]
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
stellar contract build
```

```bash [fosay-app]
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

:::

6. Open a pull request. CI must pass and a maintainer must approve.

## Rules that don't bend

- Every behaviour change comes with a test. Never skip a test, loosen an assertion or edit a
  fixture to make a case pass.
- Never log, return or commit a secret.
- The agent signing allowlist and the relayer guard stay closed: adding a call needs a test
  showing what is still refused.
- `enforce` emits no events (I7). The mandate entry stays a constant size.

## Editing these docs

The site lives in `apps/docs` in fosay-app. Every page has an **Edit this page on GitHub**
link. Preview locally with `pnpm --filter @fosay/docs dev`.

Style: short sentences, real numbers, no filler. If a number came from a measurement, say
when and where.

## Security issues

Don't open public issues for vulnerabilities. Use private reporting:
[fosay-contract](https://github.com/fosay-labs/fosay-contract/security/advisories/new) ·
[fosay-app](https://github.com/fosay-labs/fosay-app/security/advisories/new).
