BEGIN;

REVOKE ALL ON SCHEMA expense_tracker FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA expense_tracker FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA expense_tracker FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA expense_tracker FROM PUBLIC, anon, authenticated;

-- Schema-specific defaults for this executor only; explicit revokes above are
-- authoritative (schema defaults cannot undo an executor's global defaults).
ALTER DEFAULT PRIVILEGES IN SCHEMA expense_tracker REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA expense_tracker REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA expense_tracker REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;

REVOKE CREATE ON SCHEMA expense_tracker FROM expense_tracker_app;
GRANT USAGE ON SCHEMA expense_tracker TO expense_tracker_app;
REVOKE ALL ON ALL TABLES IN SCHEMA expense_tracker FROM expense_tracker_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
    expense_tracker.profiles, expense_tracker.accounts, expense_tracker.categories,
    expense_tracker.transactions, expense_tracker.transfers,
    expense_tracker.recurring_transactions, expense_tracker.budgets, expense_tracker.goals
    TO expense_tracker_app;
GRANT SELECT, INSERT, UPDATE ON expense_tracker.recurring_occurrences TO expense_tracker_app;
GRANT EXECUTE ON FUNCTION expense_tracker.set_v2_timestamps(),
    expense_tracker.validate_transfer_date(), expense_tracker.validate_transaction_write()
    TO expense_tracker_app;

-- No auth.users/schema grants, role alteration, passwords, RLS or Data API changes.
-- No blanket default runtime grants: later objects require an explicit review.
COMMIT;
