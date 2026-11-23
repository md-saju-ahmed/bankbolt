CREATE TABLE "staff_photo_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"photo_url" text,
	"status" "profile_change_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_reason" text,
	CONSTRAINT "staff_photo_review_complete" CHECK ((
      "staff_photo_requests"."status" = 'PENDING' and num_nonnulls("staff_photo_requests"."reviewed_by", "staff_photo_requests"."reviewed_at", "staff_photo_requests"."review_reason") = 0
    ) or (
      "staff_photo_requests"."status" <> 'PENDING' and num_nonnulls("staff_photo_requests"."reviewed_by", "staff_photo_requests"."reviewed_at", "staff_photo_requests"."review_reason") = 3
      and "staff_photo_requests"."reviewed_by" <> "staff_photo_requests"."staff_id"
    ))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "photo_url" text;--> statement-breakpoint
ALTER TABLE "staff_photo_requests" ADD CONSTRAINT "staff_photo_requests_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_photo_requests" ADD CONSTRAINT "staff_photo_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_photo_one_pending" ON "staff_photo_requests" USING btree ("staff_id") WHERE "staff_photo_requests"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "staff_photo_latest" ON "staff_photo_requests" USING btree ("staff_id","created_at");