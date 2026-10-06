BEGIN;

-- T11 stage B: no defaults, backfill, typmod changes or V1 trigger replacement.
ALTER TABLE expense_tracker.transactions
    ADD COLUMN user_id uuid,
    ADD COLUMN account_id uuid,
    ADD COLUMN category_id uuid,
    ADD COLUMN recurring_transaction_id uuid,
    ADD COLUMN recurring_occurrence_date date,
    ADD CONSTRAINT transactions_user_fk FOREIGN KEY (user_id)
        REFERENCES auth.users(id) ON DELETE RESTRICT,
    ADD CONSTRAINT transactions_account_fk FOREIGN KEY (account_id)
        REFERENCES expense_tracker.accounts(id) ON DELETE RESTRICT,
    ADD CONSTRAINT transactions_category_fk FOREIGN KEY (category_id)
        REFERENCES expense_tracker.categories(id) ON DELETE RESTRICT,
    ADD CONSTRAINT transactions_recurring_fk FOREIGN KEY (recurring_transaction_id)
        REFERENCES expense_tracker.recurring_transactions(id) ON DELETE RESTRICT;

-- T15: reconciled NOT NULL ownership, composite owner FKs, category compatibility,
-- active-parent/ownership immutability and account-lock enforcement.
-- T32: paired recurring fields, generated-pair uniqueness/occurrence FK/link checks.
-- Keep legacy category NOT NULL/check, transaction_date, and every V1 check/index.
COMMIT;
