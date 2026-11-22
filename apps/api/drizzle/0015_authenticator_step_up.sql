ALTER TYPE "public"."attempt_purpose" ADD VALUE 'TOTP';--> statement-breakpoint
CREATE TABLE "authenticators" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"recovery_digest" text NOT NULL,
	"last_time_step" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "authenticators" ADD CONSTRAINT "authenticators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;