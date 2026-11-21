CREATE TYPE "public"."cash_request_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."cash_request_type" AS ENUM('DEPOSIT', 'WITHDRAWAL');--> statement-breakpoint
CREATE TABLE "cash_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"type" "cash_request_type" NOT NULL,
	"status" "cash_request_status" DEFAULT 'PENDING' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	CONSTRAINT "cash_requests_positive_amount" CHECK ("cash_requests"."amount_minor" > 0),
	CONSTRAINT "cash_requests_review_fields" CHECK (case
      when "cash_requests"."status" = 'PENDING' then
        "cash_requests"."reviewed_by" is null and "cash_requests"."reviewed_at" is null and "cash_requests"."rejection_reason" is null
      when "cash_requests"."status" = 'APPROVED' then
        "cash_requests"."reviewed_by" is not null and "cash_requests"."reviewed_at" is not null and "cash_requests"."rejection_reason" is null
      else "cash_requests"."reviewed_by" is not null and "cash_requests"."reviewed_at" is not null
        and "cash_requests"."rejection_reason" is not null and length(trim("cash_requests"."rejection_reason")) > 0
      end)
);
--> statement-breakpoint
ALTER TABLE "cash_requests" ADD CONSTRAINT "cash_requests_account_id_bank_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_requests" ADD CONSTRAINT "cash_requests_customer_id_customer_profiles_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_requests" ADD CONSTRAINT "cash_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_requests_customer_time_idx" ON "cash_requests" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "cash_requests_status_time_idx" ON "cash_requests" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_cash_request_id_cash_requests_id_fk" FOREIGN KEY ("cash_request_id") REFERENCES "public"."cash_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_cash_request_unique" UNIQUE("cash_request_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_cash_request_type" CHECK ("transactions"."cash_request_id" is null or "transactions"."type" in ('DEPOSIT', 'WITHDRAWAL'));