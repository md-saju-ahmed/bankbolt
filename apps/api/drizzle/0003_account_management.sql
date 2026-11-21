CREATE TYPE "public"."management_action" AS ENUM('CUSTOMER_ACTIVATED', 'CUSTOMER_DEACTIVATED', 'CUSTOMER_BLOCKED', 'ACCOUNT_OPENED', 'ACCOUNT_ACTIVATED', 'ACCOUNT_FROZEN', 'ACCOUNT_UNFROZEN', 'ACCOUNT_DEACTIVATED', 'ACCOUNT_REACTIVATED', 'ACCOUNT_METADATA_UPDATED', 'ACCOUNT_LIMITS_UPDATED');--> statement-breakpoint
CREATE TABLE "management_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"account_id" uuid,
	"actor_id" uuid,
	"action" "management_action" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "access_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "management_events" ADD CONSTRAINT "management_events_customer_id_customer_profiles_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_events" ADD CONSTRAINT "management_events_account_id_bank_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "management_events" ADD CONSTRAINT "management_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "management_events_customer_time_idx" ON "management_events" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "management_events_account_time_idx" ON "management_events" USING btree ("account_id","created_at");
--> statement-breakpoint
INSERT INTO "management_events" ("customer_id", "account_id", "action", "created_at")
SELECT "customer_id", "id", 'ACCOUNT_OPENED', "created_at" FROM "bank_accounts";
--> statement-breakpoint
INSERT INTO "management_events" ("customer_id", "account_id", "action", "created_at")
SELECT "customer_id", "id", 'ACCOUNT_ACTIVATED', "activated_at"
FROM "bank_accounts" WHERE "activated_at" IS NOT NULL;
