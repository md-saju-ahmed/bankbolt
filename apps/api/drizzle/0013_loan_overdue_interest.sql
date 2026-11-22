ALTER TABLE "loan_installments" DROP CONSTRAINT "loan_installments_payment_fields";--> statement-breakpoint
ALTER TABLE "loan_installments" ADD COLUMN "paid_overdue_interest_minor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "loan_installments" ADD CONSTRAINT "loan_installments_payment_fields" CHECK ((
    "loan_installments"."paid_at" is null and "loan_installments"."paid_amount_minor" is null and "loan_installments"."repayment_transaction_id" is null and "loan_installments"."paid_overdue_interest_minor" = 0
  ) or (
    "loan_installments"."paid_at" is not null and "loan_installments"."paid_amount_minor" is not null and "loan_installments"."repayment_transaction_id" is not null
    and "loan_installments"."paid_overdue_interest_minor" >= 0
    and "loan_installments"."paid_amount_minor" = "loan_installments"."principal_minor" + "loan_installments"."interest_minor" + "loan_installments"."paid_overdue_interest_minor"
  ));