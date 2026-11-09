import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

const amount = (name: string) => numeric(name, { precision: 39, scale: 0 });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/** Indexer progress per stream. */
export const cursors = pgTable('cursors', {
  name: text('name').primaryKey(),
  ledger: integer('ledger').notNull(),
  cursor: text('cursor'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** FOSAY wallets the service knows about (registered on pairing or seen on-chain). */
export const wallets = pgTable('wallets', {
  address: text('address').primaryKey(),
  createdAt: createdAt(),
});

/** Agents connected to a wallet (from the web app's pairing step). */
export const agents = pgTable(
  'agents',
  {
    wallet: text('wallet').notNull(),
    payRule: integer('pay_rule').notNull(),
    askRule: integer('ask_rule').notNull(),
    agentPublicKey: text('agent_public_key').notNull(),
    name: text('name').notNull(),
    mandateHash: text('mandate_hash').notNull(),
    revoked: boolean('revoked').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.wallet, t.payRule] })],
);

/** Mandate state mirrored from fosay-mandate-policy events. */
export const mandates = pgTable(
  'mandates',
  {
    wallet: text('wallet').notNull(),
    ruleId: integer('rule_id').notNull(),
    token: text('token').notNull(),
    budget: amount('budget').notNull(),
    periodLedgers: integer('period_ledgers').notNull(),
    maxPerTx: amount('max_per_tx').notNull(),
    recipients: jsonb('recipients').$type<string[]>().notNull(),
    mandateHash: text('mandate_hash').notNull(),
    paused: boolean('paused').notNull().default(false),
    uninstalled: boolean('uninstalled').notNull().default(false),
    updatedLedger: integer('updated_ledger').notNull(),
  },
  (t) => [primaryKey({ columns: [t.wallet, t.ruleId] })],
);

/** The human-readable mandate documents, by sha256 (what the owner approved). */
export const mandateDocs = pgTable('mandate_docs', {
  hash: text('hash').primaryKey(),
  doc: jsonb('doc').notNull(),
  createdAt: createdAt(),
});

/** Approval requests mirrored from fosay-approvals events. */
export const intents = pgTable(
  'intents',
  {
    id: text('id').primaryKey(),
    account: text('account').notNull(),
    token: text('token').notNull(),
    to: text('to').notNull(),
    amount: amount('amount').notNull(),
    mandateHash: text('mandate_hash').notNull(),
    memo: text('memo').notNull(),
    expiresLedger: integer('expires_ledger').notNull(),
    status: text('status').$type<'Pending' | 'Executed' | 'Cancelled' | 'Expired'>().notNull(),
    proposedLedger: integer('proposed_ledger').notNull(),
    proposedTx: text('proposed_tx').notNull(),
    closedLedger: integer('closed_ledger'),
    closedTx: text('closed_tx'),
  },
  (t) => [index('intents_account_status').on(t.account, t.status)],
);

/** Token transfers out of FOSAY wallets. */
export const payments = pgTable(
  'payments',
  {
    eventId: text('event_id').primaryKey(),
    txHash: text('tx_hash').notNull(),
    wallet: text('wallet').notNull(),
    to: text('to').notNull(),
    token: text('token').notNull(),
    amount: amount('amount').notNull(),
    ledger: integer('ledger').notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }).notNull(),
    /** context rule ids from the wallet's AuthPayload (attribution), if decodable */
    ruleIds: jsonb('rule_ids').$type<number[]>(),
    via: text('via').$type<'agent' | 'owner' | 'approval' | 'unknown'>().notNull(),
  },
  (t) => [index('payments_wallet_ledger').on(t.wallet, t.ledger)],
);

/** Web Push subscriptions per wallet. */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    endpoint: text('endpoint').primaryKey(),
    wallet: text('wallet').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('push_wallet').on(t.wallet)],
);
