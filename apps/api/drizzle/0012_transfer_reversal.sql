ALTER TYPE "public"."transaction_type" ADD VALUE 'TRANSFER_REVERSAL' BEFORE 'LOAN_DISBURSEMENT';--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_account_direction";--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "reverses_transaction_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "reversal_reason" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "refunded_fee_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reversal_fk" FOREIGN KEY ("reverses_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reversal_unique" UNIQUE("reverses_transaction_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reversal_fields" CHECK (case
      when "transactions"."type"::text = 'TRANSFER_REVERSAL' then
        "transactions"."reverses_transaction_id" is not null and "transactions"."reverses_transaction_id" <> "transactions"."id"
        and "transactions"."initiated_by" is not null and "transactions"."status" = 'COMPLETED'
        and "transactions"."reversal_reason" is not null and length(trim("transactions"."reversal_reason")) between 1 and 300
        and "transactions"."refunded_fee_minor" >= 0 and "transactions"."fee_minor" = 0
        and "transactions"."idempotency_key" is null
      else "transactions"."reverses_transaction_id" is null and "transactions"."reversal_reason" is null and "transactions"."refunded_fee_minor" = 0
      end);--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_direction" CHECK (case
        when "transactions"."type"::text in ('FUND_TRANSFER', 'TRANSFER_REVERSAL') then
          "transactions"."sender_account_id" is not null and "transactions"."receiver_account_id" is not null
          and "transactions"."sender_account_id" <> "transactions"."receiver_account_id"
        when "transactions"."type" in ('DEPOSIT', 'LOAN_DISBURSEMENT')
          then "transactions"."sender_account_id" is null and "transactions"."receiver_account_id" is not null
        else "transactions"."sender_account_id" is not null and "transactions"."receiver_account_id" is null
      end);