## What and why

Closes #

## How it was tested

```text
paste the real output of:
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Checklist

- [ ] One logical change; no unrelated reformatting
- [ ] Tests added or updated; none skipped or weakened
- [ ] Touches signing, the relayer guard, auth decoding or key handling? If yes, explain the security impact:
- [ ] Docs and `CHANGELOG.md` (Unreleased) updated if behaviour changed
