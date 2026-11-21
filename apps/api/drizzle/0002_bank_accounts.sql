CREATE TYPE "public"."account_status" AS ENUM('PENDING', 'ACTIVE', 'FROZEN', 'DEACTIVATED');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('SAVINGS', 'CURRENT', 'BUSINESS');--> statement-breakpoint
CREATE SEQUENCE "public"."bank_account_number_seq" INCREMENT BY 1 MINVALUE 100000000000 MAXVALUE 999999999999 START WITH 100000000000 CACHE 1;--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_number" text DEFAULT nextval('public.bank_account_number_seq')::text NOT NULL,
	"customer_id" uuid NOT NULL,
	"creation_key" uuid NOT NULL,
	"type" "account_type" NOT NULL,
	"status" "account_status" DEFAULT 'PENDING' NOT NULL,
	"balance_poisha" bigint DEFAULT 0 NOT NULL,
	"transfer_limit_poisha" bigint DEFAULT 5000000 NOT NULL,
	"daily_transfer_limit_poisha" bigint DEFAULT 20000000 NOT NULL,
	"business_name" text,
	"business_registration_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	CONSTRAINT "bank_accounts_account_number_unique" UNIQUE("account_number"),
	CONSTRAINT "bank_accounts_customer_creation_key" UNIQUE("customer_id","creation_key"),
	CONSTRAINT "bank_accounts_number_format" CHECK ("bank_accounts"."account_number" ~ '^[0-9]{12}$'),
	CONSTRAINT "bank_accounts_nonnegative_balance" CHECK ("bank_accounts"."balance_poisha" >= 0),
	CONSTRAINT "bank_accounts_nonnegative_limits" CHECK ("bank_accounts"."transfer_limit_poisha" >= 0 AND "bank_accounts"."daily_transfer_limit_poisha" >= 0),
	CONSTRAINT "bank_accounts_business_metadata" CHECK ("bank_accounts"."type" = 'BUSINESS' OR ("bank_accounts"."business_name" IS NULL AND "bank_accounts"."business_registration_reference" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_customer_id_customer_profiles_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer_profiles"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION "public"."prevent_bank_account_number_change"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.account_number IS DISTINCT FROM OLD.account_number THEN
    RAISE EXCEPTION 'Bank account numbers are immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'bank_accounts_immutable_number';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "bank_accounts_immutable_number"
BEFORE UPDATE OF "account_number" ON "public"."bank_accounts"
FOR EACH ROW EXECUTE FUNCTION "public"."prevent_bank_account_number_change"();
