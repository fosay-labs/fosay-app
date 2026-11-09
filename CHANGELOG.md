# Changelog

All notable changes to this project. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [SemVer](https://semver.org/).

## [Unreleased]

## [0.1.0-testnet] - 2026-11-09

First testnet release, against `fosay-contract` v0.1.0-testnet.

### Added

- `@fosay/sdk`: contract clients, x402 payer scheme for OZ smart accounts, agent auth-entry
  signing with an allowlist, simulation error decoding, mandate hashing, pairing codes.
- `@fosay/agent`: key file handling, pay-or-ask `fosayFetch`, `fosay-agent` CLI.
- `@fosay/mcp`: MCP server with five wallet tools.
- `@fosay/api`: event indexer with payment attribution, Web Push, fee-sponsoring relayer with
  a FOSAY-only guard, TTL keeper, read API, pairing.
- `@fosay/web`: passkey wallet, connect agent, dashboard, approvals with auth-entry decoding,
  pause / edit / revoke.
- Hosting: static export for GitHub Pages, Render Blueprint, keep-alive workflow, secrets
  generator, [`docs/HOSTING.md`](docs/HOSTING.md).
- 102 tests; full testnet walkthrough in a real browser, locally and in the production layout.

[Unreleased]: https://github.com/fosay-labs/fosay-app/compare/v0.1.0-testnet...HEAD
[0.1.0-testnet]: https://github.com/fosay-labs/fosay-app/releases/tag/v0.1.0-testnet
