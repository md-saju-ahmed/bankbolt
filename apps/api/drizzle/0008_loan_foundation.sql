CREATE TYPE "public"."loan_status" AS ENUM('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'ACTIVE', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."loan_type" AS ENUM('PERSONAL', 'EDUCATION', 'BUSINESS');--> statement-breakpoint
CREATE TABLE "loan_installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"loan_id" uuid NOT NULL,
	"installment_number" integer NOT NULL,
	"due_date" date NOT NULL,
	"principal_minor" bigint NOT NULL,
	"interest_minor" bigint NOT NULL,
	"paid_amount_minor" bigint,
	"paid_at" timestamp with time zone,
	"repayment_transaction_id" uuid,
	CONSTRAINT "loan_installments_repayment_transaction_id_unique" UNIQUE("repayment_transaction_id"),
	CONSTRAINT "loan_installments_loan_number_unique" UNIQUE("loan_id","installment_number"),
	CONSTRAINT "loan_installments_schedule_fields" CHECK ("loan_installments"."installment_number" > 0 and "loan_installments"."principal_minor" > 0 and "loan_installments"."interest_minor" >= 0),
	CONSTRAINT "loan_installments_payment_fields" CHECK ((
    "loan_installments"."paid_at" is null and "loan_installments"."paid_amount_minor" is null and "loan_installments"."repayment_transaction_id" is null
  ) or (
    "loan_installments"."paid_at" is not null and "loan_installments"."paid_amount_minor" is not null and "loan_installments"."repayment_transaction_id" is not null
    and "loan_installments"."paid_amount_minor" = "loan_installments"."principal_minor" + "loan_installments"."interest_minor"
  ))
);
--> statement-breakpoint
CREATE TABLE "loan_review_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"loan_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loan_review_notes_note_required" CHECK (length(trim("loan_review_notes"."note")) > 0)
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"disbursement_account_id" uuid NOT NULL,
	"type" "loan_type" NOT NULL,
	"status" "loan_status" DEFAULT 'PENDING' NOT NULL,
	"requested_principal_minor" bigint NOT NULL,
	"approved_principal_minor" bigint,
	"remaining_principal_minor" bigint,
	"annual_rate_bps" integer DEFAULT 1200 NOT NULL,
	"term_months" integer NOT NULL,
	"monthly_income_minor" bigint NOT NULL,
	"employment_status" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"review_started_at" timestamp with time zone,
	"forwarded_at" timestamp with time zone,
	"forwarded_by" uuid,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"rejection_reason" text,
	"disbursed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "loans_baseline_terms" CHECK ("loans"."requested_principal_minor" > 0
    and "loans"."monthly_income_minor" >= 0 and "loans"."term_months" between 6 and 60
    and "loans"."annual_rate_bps" = 1200),
	CONSTRAINT "loans_review_fields" CHECK (("loans"."forwarded_at" is null) = ("loans"."forwarded_by" is null)
    and ("loans"."status" <> 'PENDING' or ("loans"."review_started_at" is null and "loans"."forwarded_at" is null))),
	CONSTRAINT "loans_decision_fields" CHECK (case
    when "loans"."status" in ('PENDING', 'UNDER_REVIEW') then
      "loans"."decided_at" is null and "loans"."decided_by" is null and "loans"."approved_principal_minor" is null and "loans"."rejection_reason" is null
    when "loans"."status" = 'REJECTED' then
      "loans"."decided_at" is not null and "loans"."decided_by" is not null and "loans"."approved_principal_minor" is null
      and "loans"."rejection_reason" is not null and length(trim("loans"."rejection_reason")) > 0
    else "loans"."decided_at" is not null and "loans"."decided_by" is not null and "loans"."rejection_reason" is null
      and "loans"."approved_principal_minor" is not null and "loans"."approved_principal_minor" > 0
  end),
	CONSTRAINT "loans_disbursement_fields" CHECK (case
    when "loans"."status" = 'ACTIVE' then "loans"."disbursed_at" is not null and "loans"."completed_at" is null
      and "loans"."remaining_principal_minor" is not null and "loans"."remaining_principal_minor" > 0
      and "loans"."remaining_principal_minor" <= "loans"."approved_principal_minor"
    when "loans"."status" = 'COMPLETED' then "loans"."disbursed_at" is not null and "loans"."completed_at" is not null
      and "loans"."remaining_principal_minor" is not null and "loans"."remaining_principal_minor" = 0
    else "loans"."disbursed_at" is null and "loans"."completed_at" is null and "loans"."remaining_principal_minor" is null
  end)
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_id_customer_unique" UNIQUE("id","customer_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_id_loan_unique" UNIQUE("id","loan_id");--> statement-breakpoint
ALTER TABLE "loan_installments" ADD CONSTRAINT "loan_installments_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_installments" ADD CONSTRAINT "loan_installments_repayment_loan_fk" FOREIGN KEY ("repayment_transaction_id","loan_id") REFERENCES "public"."transactions"("id","loan_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_review_notes" ADD CONSTRAINT "loan_review_notes_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_review_notes" ADD CONSTRAINT "loan_review_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_customer_id_customer_profiles_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_forwarded_by_users_id_fk" FOREIGN KEY ("forwarded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_owned_disbursement_account_fk" FOREIGN KEY ("disbursement_account_id","customer_id") REFERENCES "public"."bank_accounts"("id","customer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loan_review_notes_loan_time_idx" ON "loan_review_notes" USING btree ("loan_id","created_at");--> statement-breakpoint
CREATE INDEX "loans_customer_time_idx" ON "loans" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "loans_status_time_idx" ON "loans" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_loan_disbursement_unique" ON "transactions" USING btree ("loan_id") WHERE "transactions"."type" = 'LOAN_DISBURSEMENT';--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_loan_type" CHECK ("transactions"."loan_id" is null or "transactions"."type" in ('LOAN_DISBURSEMENT', 'LOAN_REPAYMENT'));
