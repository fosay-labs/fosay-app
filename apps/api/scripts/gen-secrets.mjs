#!/usr/bin/env node
// Generates the API's secrets for a new deployment and funds the two testnet accounts.
//   pnpm --filter @fosay/api secrets
// Prints KEY=value lines to paste into the host's secret settings (Render → Environment).
// Nothing is written to disk. Testnet only: mainnet accounts must be funded by you.
import { Keypair } from '@stellar/stellar-sdk';
import webpush from 'web-push';

const FRIENDBOT = 'https://friendbot.stellar.org';

async function fund(publicKey) {
  const res = await fetch(`${FRIENDBOT}/?addr=${publicKey}`);
  if (!res.ok) throw new Error(`friendbot ${res.status} for ${publicKey}: ${await res.text()}`);
}

const relayer = Keypair.random();
const keeper = Keypair.random(); // must differ from the relayer (sequence numbers)
const vapid = webpush.generateVAPIDKeys();

for (const [name, kp] of [
  ['relayer', relayer],
  ['keeper', keeper],
]) {
  await fund(kp.publicKey());
  console.error(`funded ${name} ${kp.publicKey()} on testnet`);
}

console.error('\nStore these as secrets on the API host. Do not commit them.\n');
// stdout carries only the KEY=value lines, so the output can be piped or redirected
process.stdout.write(
  [
    `RELAYER_SECRET=${relayer.secret()}`,
    `KEEPER_SECRET=${keeper.secret()}`,
    `VAPID_PUBLIC_KEY=${vapid.publicKey}`,
    `VAPID_PRIVATE_KEY=${vapid.privateKey}`,
  ].join('\n') + '\n',
);
