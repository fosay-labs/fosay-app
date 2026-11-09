# Deployments

## Stellar testnet (9 November 2026)

| Contract | ID | WASM sha256 |
|---|---|---|
| `fosay-mandate-policy` | [`CABMDEJEXOIBR4F6TDIYQ7CA5GFENXAYDRA4WH7V4QR7PAMTFIEQWWQ5`](https://stellar.expert/explorer/testnet/contract/CABMDEJEXOIBR4F6TDIYQ7CA5GFENXAYDRA4WH7V4QR7PAMTFIEQWWQ5) | `46336ed2e9d1f05b82b7331309fd5c6123727f70d20120a14e5898a1ba39cd70` |
| `fosay-approvals` | [`CAZDF7XQSKLZK5JG4FPCG6ZSGK3C4ZGNBKHU3VYDPQSZWLX2HPRXJCIU`](https://stellar.expert/explorer/testnet/contract/CAZDF7XQSKLZK5JG4FPCG6ZSGK3C4ZGNBKHU3VYDPQSZWLX2HPRXJCIU) | `867499c4eece48777833fc28d58e63c5f904dbc7c1d73c1a043c72cc24f44fe2` |

Canonical contracts FOSAY uses (not deployed by FOSAY):

| | Testnet |
|---|---|
| OpenZeppelin smart account WASM (v0.8.0) | `c514d35ea67eaea9bfc1fb3327854c0c06111bc1ddebd4fe217c504c1004b9e1` |
| WebAuthn verifier | `CC7EKIHQP3TN4CARQDND6CEOY2UXLWWC2X5GHTD5NLAT7BG5GPZIOM3F` |
| Ed25519 verifier | `CAAVTMCBXEIBPR64EAASKFXERVPYFZA2JYP5A3BG6PESWEFUJX5IHKN4` |
| USDC (Stellar Asset Contract) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |

Machine-readable records: [`deployments/testnet.json`](https://github.com/fosay-labs/fosay-contract/blob/main/deployments/testnet.json)
in both repositories. Release: [v0.1.0-testnet](https://github.com/fosay-labs/fosay-contract/releases/tag/v0.1.0-testnet).

## Deploying your own

```bash
git clone https://github.com/fosay-labs/fosay-contract && cd fosay-contract
stellar contract build
cd scripts && npm install && node deploy.mjs
```

The deploy script is idempotent. The salt is `sha256("fosay:<crate>:<wasm-hash>")`, so the
same build always maps to the same contract ID. It writes `deployments/<network>.json` and
prints an `.env` block for fosay-app.

## Mainnet

None. Mainnet comes after an external audit.
