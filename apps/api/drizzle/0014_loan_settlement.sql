CREATE TABLE "loan_settlements" (
	"loan_id" uuid PRIMARY KEY NOT NULL,
	"transaction_id" uuid NOT NULL,
	"principal_minor" bigint NOT NULL,
	"scheduled_interest_minor" bigint NOT NULL,
	"overdue_interest_minor" bigint NOT NULL,
	CONSTRAINT "loan_settlements_transaction_id_unique" UNIQUE("transaction_id"),
	CONSTRAINT "loan_settlements_valid_amounts" CHECK ("loan_settlements"."principal_minor" > 0 and "loan_settlements"."scheduled_interest_minor" >= 0 and "loan_settlements"."overdue_interest_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "loan_settlements" ADD CONSTRAINT "loan_settlements_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_settlements" ADD CONSTRAINT "loan_settlements_transaction_loan_fk" FOREIGN KEY ("transaction_id","loan_id") REFERENCES "public"."transactions"("id","loan_id") ON DELETE no action ON UPDATE no action;