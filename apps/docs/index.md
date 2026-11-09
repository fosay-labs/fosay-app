---
layout: home
hero:
  name: FOSAY
  text: Funds Only Spent After Yes
  tagline: A Stellar wallet you share with your AI agent. It spends within a budget you set. Anything bigger waits for your passkey.
  actions:
    - theme: brand
      text: Read the introduction
      link: /guide/introduction
    - theme: alt
      text: Connect an agent
      link: /users/agent-operator
    - theme: alt
      text: Contract reference
      link: /contracts/mandate-policy
features:
  - title: A budget the chain enforces
    details: The agent's key sits on your smart wallet under a rule with a per-payment cap, a rolling budget and an optional recipient list. The contract refuses anything outside it. No server can override that.
  - title: Bigger payments ask first
    details: Over-limit payments become requests. Your phone gets a notification, the app decodes exactly what your passkey would sign, and nothing moves until you say yes.
  - title: Works with x402
    details: Agents pay HTTP 402 pay-per-request APIs from the wallet. A steady-state payment costs about 19,000 stroops in fees, under the facilitator's 50,000-stroop ceiling.
---

::: warning Testnet only
FOSAY runs on Stellar testnet and has not been audited. Don't use it with real funds.
:::
