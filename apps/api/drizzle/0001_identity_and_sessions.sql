CREATE TYPE "public"."attempt_purpose" AS ENUM('LOGIN', 'PIN');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'STAFF', 'CUSTOMER');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('PENDING', 'VERIFIED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "auth_attempts" (
	"purpose" "attempt_purpose" NOT NULL,
	"subject" text NOT NULL,
	"attempts" integer NOT NULL,
	"resets_at" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_attempts_purpose_subject_pk" PRIMARY KEY("purpose","subject")
);
--> statement-breakpoint
CREATE TABLE "customer_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"date_of_birth" date NOT NULL,
	"address" text NOT NULL,
	"identity_reference" text NOT NULL,
	"occupation" text,
	"verification_status" "verification_status" DEFAULT 'PENDING' NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"pin_hash" text,
	CONSTRAINT "customer_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "customer_profiles_identity_reference_unique" UNIQUE("identity_reference")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_digest" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_normalized" CHECK ("users"."email" = lower(trim("users"."email")))
);
--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");