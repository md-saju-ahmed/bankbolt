ALTER TABLE "profile_change_requests" DROP CONSTRAINT "profile_change_has_fields";--> statement-breakpoint
ALTER TABLE "profile_change_requests" ADD COLUMN "personal_changes" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_change_requests" ADD CONSTRAINT "profile_change_has_fields" CHECK (jsonb_typeof("profile_change_requests"."personal_changes") = 'object' and
        (num_nonnulls("profile_change_requests"."full_name", "profile_change_requests"."email", "profile_change_requests"."phone", "profile_change_requests"."address") > 0
          or "profile_change_requests"."personal_changes" <> '{}'::jsonb));