CREATE TABLE "agents" (
	"wallet" text NOT NULL,
	"pay_rule" integer NOT NULL,
	"ask_rule" integer NOT NULL,
	"agent_public_key" text NOT NULL,
	"name" text NOT NULL,
	"mandate_hash" text NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_wallet_pay_rule_pk" PRIMARY KEY("wallet","pay_rule")
);
--> statement-breakpoint
CREATE TABLE "cursors" (
	"name" text PRIMARY KEY NOT NULL,
	"ledger" integer NOT NULL,
	"cursor" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intents" (
	"id" text PRIMARY KEY NOT NULL,
	"account" text NOT NULL,
	"token" text NOT NULL,
	"to" text NOT NULL,
	"amount" numeric(39, 0) NOT NULL,
	"mandate_hash" text NOT NULL,
	"memo" text NOT NULL,
	"expires_ledger" integer NOT NULL,
	"status" text NOT NULL,
	"proposed_ledger" integer NOT NULL,
	"proposed_tx" text NOT NULL,
	"closed_ledger" integer,
	"closed_tx" text
);
--> statement-breakpoint
CREATE TABLE "mandate_docs" (
	"hash" text PRIMARY KEY NOT NULL,
	"doc" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mandates" (
	"wallet" text NOT NULL,
	"rule_id" integer NOT NULL,
	"token" text NOT NULL,
	"budget" numeric(39, 0) NOT NULL,
	"period_ledgers" integer NOT NULL,
	"max_per_tx" numeric(39, 0) NOT NULL,
	"recipients" jsonb NOT NULL,
	"mandate_hash" text NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"uninstalled" boolean DEFAULT false NOT NULL,
	"updated_ledger" integer NOT NULL,
	CONSTRAINT "mandates_wallet_rule_id_pk" PRIMARY KEY("wallet","rule_id")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"event_id" text PRIMARY KEY NOT NULL,
	"tx_hash" text NOT NULL,
	"wallet" text NOT NULL,
	"to" text NOT NULL,
	"token" text NOT NULL,
	"amount" numeric(39, 0) NOT NULL,
	"ledger" integer NOT NULL,
	"closed_at" timestamp with time zone NOT NULL,
	"rule_ids" jsonb,
	"via" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"wallet" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"address" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "intents_account_status" ON "intents" USING btree ("account","status");--> statement-breakpoint
CREATE INDEX "payments_wallet_ledger" ON "payments" USING btree ("wallet","ledger");--> statement-breakpoint
CREATE INDEX "push_wallet" ON "push_subscriptions" USING btree ("wallet");