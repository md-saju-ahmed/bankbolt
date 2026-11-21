CREATE TABLE "transaction_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"flagged_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	CONSTRAINT "transaction_flags_reason_required" CHECK (length(trim("transaction_flags"."reason")) > 0),
	CONSTRAINT "transaction_flags_resolution_fields" CHECK ((
      "transaction_flags"."resolved_at" is null and "transaction_flags"."resolved_by" is null and "transaction_flags"."resolution_note" is null
    ) or ("transaction_flags"."resolved_at" is not null and "transaction_flags"."resolved_by" is not null))
);
--> statement-breakpoint
ALTER TABLE "transaction_flags" ADD CONSTRAINT "transaction_flags_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_flags" ADD CONSTRAINT "transaction_flags_flagged_by_users_id_fk" FOREIGN KEY ("flagged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_flags" ADD CONSTRAINT "transaction_flags_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_flags_open_transaction_unique" ON "transaction_flags" USING btree ("transaction_id") WHERE "transaction_flags"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "transaction_flags_transaction_time_idx" ON "transaction_flags" USING btree ("transaction_id","created_at");--> statement-breakpoint
CREATE INDEX "transaction_flags_created_idx" ON "transaction_flags" USING btree ("created_at","id");