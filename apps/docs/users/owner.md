# Guide for wallet owners

You want an AI agent to pay for things for you, but not without limits. This guide takes
about 10 minutes. You need a phone or computer with a passkey (Face ID, Touch ID, Windows
Hello, Android screen lock or a security key) and a modern browser.

::: warning Testnet
FOSAY runs on Stellar testnet. The USDC is test money. Don't send real funds.
:::

## 1. Create your wallet

1. Open [the FOSAY app](https://fosay-labs.github.io/fosay-app/) and choose **Create wallet**.
2. Under **Name for this passkey**, enter something like "My phone", then choose **Create wallet with passkey**.
3. Your device asks to create a passkey. Confirm with your face, fingerprint or PIN.

The app shows your wallet address. It starts with **C**: it's a smart contract account, not
a regular Stellar account. You don't need XLM for fees. FOSAY pays them.

To get test USDC, send it from a testnet faucet to the address shown.

## 2. Connect your agent

The person who runs your agent gives you its **public key** (64 characters). It's safe to
share. The secret part stays on the agent's computer.

1. On the dashboard, choose **+ Connect agent**.
2. Fill in:
   - **Agent name** and **What may it spend on?**, for example "Research bot" and "Paid data
     APIs". You'll see these on every request.
   - **Agent public key**: paste the key you were given.
   - **Budget (USDC)** and **Period**, for example 5 USDC per day.
   - **Max per payment (USDC)**, for example 2.
   - **Only pay these addresses** (optional, one per line). Leave empty to allow any recipient
     within the limits.
   - **Valid for (days)**: after this the agent's rules stop working on their own.
3. Choose **Connect agent (2 passkey prompts)** and confirm **two** passkey prompts. The first adds the agent's payment rule with your limits.
   The second lets it ask you for approvals.
4. Copy the **pairing code** and give it to the person running the agent.

## 3. Turn on notifications

On the dashboard, choose **Turn on** under *Approval notifications* and allow notifications.
On iPhone, first add the app to your home screen (Share → Add to Home Screen), then turn
notifications on from there.

## 4. Approve or reject a request

When your agent needs more than its limits allow, you get a notification:
*"Your agent asks for 3 USDC"*.

1. Open it. The app shows the amount, the recipient, the agent's reason and when it expires.
2. Read **What your passkey will sign**. The app decodes this from the transaction itself,
   not from FOSAY's server. If it doesn't match the request, the app shows a red warning and
   won't let you approve.
3. Choose **Approve** and confirm with your passkey, or **Reject**.

Approved payments don't use up the agent's budget. If you do nothing, the request expires
(after one day by default).

## 5. Pause, change or remove an agent

Open the agent from the dashboard.

| You want to | Choose | Effect |
|---|---|---|
| Stop it for now | **Pause agent** | Every payment it tries fails until you choose **Unpause agent** |
| Change its limits | **Save limits** (after editing budget or max per payment) | New limits apply; spending so far still counts |
| Remove it for good | **Revoke agent** | Its key is removed from your wallet and can't sign anything |

Each change needs one passkey confirmation.

## What the agent can and can't do

| It can | It can't |
|---|---|
| Send USDC from your wallet within the limits you set | Send more than the cap in one payment, or more than the budget per period |
| Ask you to approve a bigger payment | Approve its own request |
| Withdraw a request it made | Change its limits, unpause itself or add rules |
| | Send any other token, or call any other contract |

These limits are enforced by the wallet contract on Stellar. FOSAY's server can't change them.

## If you lose your passkey

Your passkey is the only owner of the wallet. Passkeys synced by iCloud Keychain, Google
Password Manager or a password manager survive a lost device. A passkey that lives only on a
lost security key can't be recovered, and neither can the wallet. Recovery options are
planned work.
