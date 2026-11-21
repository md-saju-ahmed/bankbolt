CREATE FUNCTION "public"."prevent_transaction_reference_change"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.reference IS DISTINCT FROM OLD.reference THEN
    RAISE EXCEPTION 'Transaction references are immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'transactions_immutable_reference';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "transactions_immutable_reference"
BEFORE UPDATE OF "reference" ON "public"."transactions"
FOR EACH ROW EXECUTE FUNCTION "public"."prevent_transaction_reference_change"();
