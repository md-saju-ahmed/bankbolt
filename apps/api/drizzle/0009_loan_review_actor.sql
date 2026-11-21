ALTER TABLE "loans" DROP CONSTRAINT "loans_review_fields";--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "review_started_by" uuid;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_review_started_by_users_id_fk" FOREIGN KEY ("review_started_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_review_fields" CHECK (("loans"."forwarded_at" is null) = ("loans"."forwarded_by" is null)
    and ("loans"."review_started_by" is null or "loans"."review_started_at" is not null)
    and ("loans"."status" <> 'PENDING' or ("loans"."review_started_at" is null and "loans"."forwarded_at" is null)));