ALTER TYPE "public"."cash_request_status" ADD VALUE 'CANCELLED';--> statement-breakpoint
ALTER TABLE "cash_requests" DROP CONSTRAINT "cash_requests_review_fields";--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "held_balance_poisha" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_requests" ADD COLUMN "funds_reserved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_requests" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_valid_hold" CHECK ("bank_accounts"."held_balance_poisha" between 0 and "bank_accounts"."balance_poisha");--> statement-breakpoint
ALTER TABLE "cash_requests" ADD CONSTRAINT "cash_requests_valid_reservation" CHECK (not "cash_requests"."funds_reserved" or ("cash_requests"."type" = 'WITHDRAWAL' and "cash_requests"."status" = 'PENDING'));--> statement-breakpoint
ALTER TABLE "cash_requests" ADD CONSTRAINT "cash_requests_cancellation_time" CHECK (("cash_requests"."status"::text = 'CANCELLED') = ("cash_requests"."cancelled_at" is not null));--> statement-breakpoint
ALTER TABLE "cash_requests" ADD CONSTRAINT "cash_requests_review_fields" CHECK (case
      when "cash_requests"."status"::text in ('PENDING', 'CANCELLED') then
        "cash_requests"."reviewed_by" is null and "cash_requests"."reviewed_at" is null and "cash_requests"."rejection_reason" is null
      when "cash_requests"."status" = 'APPROVED' then
        "cash_requests"."reviewed_by" is not null and "cash_requests"."reviewed_at" is not null and "cash_requests"."rejection_reason" is null
      else "cash_requests"."reviewed_by" is not null and "cash_requests"."reviewed_at" is not null
        and "cash_requests"."rejection_reason" is not null and length(trim("cash_requests"."rejection_reason")) > 0
      end);