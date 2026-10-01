BEGIN;

CREATE SCHEMA expense_tracker;

CREATE TABLE expense_tracker.transactions (
    id uuid PRIMARY KEY,
    type text NOT NULL,
    amount numeric NOT NULL,
    description text NOT NULL,
    category text NOT NULL,
    transaction_date date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),

    CONSTRAINT transactions_type_check
        CHECK (type IN ('income', 'expense')),
    CONSTRAINT transactions_amount_range_check
        CHECK (amount >= 0.01 AND amount <= 999999999.99),
    CONSTRAINT transactions_amount_scale_check
        CHECK (scale(amount) <= 2),
    CONSTRAINT transactions_description_check
        CHECK (
            char_length(description) BETWEEN 1 AND 200
            AND description !~ '^[[:space:]]'
            AND description !~ '[[:space:]]$'
        ),
    CONSTRAINT transactions_category_check
        CHECK (
            (type = 'income' AND category IN
                ('salary', 'freelance', 'gift', 'other'))
            OR
            (type = 'expense' AND category IN
                ('food', 'transport', 'shopping', 'bills',
                 'entertainment', 'other'))
        ),
    CONSTRAINT transactions_date_min_check
        CHECK (transaction_date >= DATE '1900-01-01')
);

CREATE FUNCTION expense_tracker.validate_transaction_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
    IF NEW.transaction_date >
        (statement_timestamp() AT TIME ZONE 'Africa/Cairo')::date THEN
        RAISE EXCEPTION 'Transaction date cannot be in the future'
            USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.created_at := statement_timestamp();
    ELSE
        IF NEW.id IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'Transaction identifier cannot be changed'
                USING ERRCODE = '23514';
        END IF;
        NEW.created_at := OLD.created_at;
    END IF;
    NEW.updated_at := statement_timestamp();
    RETURN NEW;
END;
$$;

CREATE TRIGGER transactions_validate_write
BEFORE INSERT OR UPDATE ON expense_tracker.transactions
FOR EACH ROW
EXECUTE FUNCTION expense_tracker.validate_transaction_write();

CREATE INDEX transactions_order_idx
ON expense_tracker.transactions
    (transaction_date DESC, created_at DESC, id DESC);

REVOKE ALL ON SCHEMA expense_tracker FROM PUBLIC;
REVOKE ALL ON TABLE expense_tracker.transactions FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION
    expense_tracker.validate_transaction_write() FROM PUBLIC;

COMMIT;
