CREATE TYPE "public"."transaction_status" AS ENUM('PENDING', 'COMPLETED', 'FAILED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('DEPOSIT', 'WITHDRAWAL', 'FUND_TRANSFER', 'LOAN_DISBURSEMENT', 'LOAN_REPAYMENT');--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" uuid DEFAULT gen_random_uuid() NOT NULL,
	"sender_account_id" uuid,
	"receiver_account_id" uuid,
	"type" "transaction_type" NOT NULL,
	"status" "transaction_status" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"fee_minor" bigint DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"initiated_by" uuid,
	"idempotency_key" uuid,
	"cash_request_id" uuid,
	"loan_id" uuid,
	CONSTRAINT "transactions_reference_unique" UNIQUE("reference"),
	CONSTRAINT "transactions_initiator_idempotency_key" UNIQUE("initiated_by","idempotency_key"),
	CONSTRAINT "transactions_positive_amount" CHECK ("transactions"."amount_minor" > 0),
	CONSTRAINT "transactions_nonnegative_fee" CHECK ("transactions"."fee_minor" >= 0),
	CONSTRAINT "transactions_account_direction" CHECK (case
        when "transactions"."type" = 'FUND_TRANSFER' then
          "transactions"."sender_account_id" is not null and "transactions"."receiver_account_id" is not null
          and "transactions"."sender_account_id" <> "transactions"."receiver_account_id"
        when "transactions"."type" in ('DEPOSIT', 'LOAN_DISBURSEMENT')
          then "transactions"."sender_account_id" is null and "transactions"."receiver_account_id" is not null
        else "transactions"."sender_account_id" is not null and "transactions"."receiver_account_id" is null
      end),
	CONSTRAINT "transactions_transfer_identity" CHECK (("transactions"."idempotency_key" is null or "transactions"."initiated_by" is not null)
        and ("transactions"."type" <> 'FUND_TRANSFER' or "transactions"."idempotency_key" is not null))
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_sender_account_id_bank_accounts_id_fk" FOREIGN KEY ("sender_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_receiver_account_id_bank_accounts_id_fk" FOREIGN KEY ("receiver_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_sender_time_idx" ON "transactions" USING btree ("sender_account_id","created_at");--> statement-breakpoint
CREATE INDEX "transactions_receiver_time_idx" ON "transactions" USING btree ("receiver_account_id","created_at");