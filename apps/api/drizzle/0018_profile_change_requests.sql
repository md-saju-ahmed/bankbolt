CREATE TYPE "public"."profile_change_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
ALTER TYPE "public"."management_action" ADD VALUE 'PROFILE_UPDATED' BEFORE 'ACCOUNT_OPENED';--> statement-breakpoint
ALTER TYPE "public"."management_action" ADD VALUE 'PROFILE_CHANGE_REQUESTED' BEFORE 'ACCOUNT_OPENED';--> statement-breakpoint
ALTER TYPE "public"."management_action" ADD VALUE 'PROFILE_CHANGE_APPROVED' BEFORE 'ACCOUNT_OPENED';--> statement-breakpoint
ALTER TYPE "public"."management_action" ADD VALUE 'PROFILE_CHANGE_REJECTED' BEFORE 'ACCOUNT_OPENED';--> statement-breakpoint
CREATE TABLE "profile_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"submitted_by" uuid NOT NULL,
	"full_name" text,
	"email" text,
	"phone" text,
	"address" text,
	"reason" text NOT NULL,
	"status" "profile_change_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_reason" text,
	CONSTRAINT "profile_change_has_fields" CHECK (num_nonnulls("profile_change_requests"."full_name", "profile_change_requests"."email", "profile_change_requests"."phone", "profile_change_requests"."address") > 0),
	CONSTRAINT "profile_change_review_complete" CHECK (("profile_change_requests"."status" = 'PENDING' and num_nonnulls("profile_change_requests"."reviewed_by", "profile_change_requests"."reviewed_at", "profile_change_requests"."review_reason") = 0)
        or ("profile_change_requests"."status" <> 'PENDING' and num_nonnulls("profile_change_requests"."reviewed_by", "profile_change_requests"."reviewed_at", "profile_change_requests"."review_reason") = 3
          and "profile_change_requests"."reviewed_by" <> "profile_change_requests"."submitted_by"))
);
--> statement-breakpoint
ALTER TABLE "profile_change_requests" ADD CONSTRAINT "profile_change_requests_customer_id_customer_profiles_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_change_requests" ADD CONSTRAINT "profile_change_requests_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_change_requests" ADD CONSTRAINT "profile_change_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profile_change_one_pending_per_customer" ON "profile_change_requests" USING btree ("customer_id") WHERE "profile_change_requests"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "profile_change_customer_time_idx" ON "profile_change_requests" USING btree ("customer_id","created_at");