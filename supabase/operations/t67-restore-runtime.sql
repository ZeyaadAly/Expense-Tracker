-- Reviewed T67 transient grant restoration, not an automatic migration.
-- Run only after committed read-only release guard and stale-deployment denial.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
DO $$ BEGIN
 IF current_database()<>'postgres' OR current_user<>'postgres' THEN RAISE EXCEPTION 'T67_TARGET_MISMATCH'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='expense_tracker_app' AND (rolsuper OR rolinherit OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls)) THEN RAISE EXCEPTION 'T67_RUNTIME_ROLE_MISMATCH'; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND has_schema_privilege(oid,'expense_tracker','USAGE')) THEN RAISE EXCEPTION 'T67_BROWSER_ACCESS'; END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE connamespace='expense_tracker'::regnamespace AND NOT convalidated) THEN RAISE EXCEPTION 'T67_UNVALIDATED_CONSTRAINT'; END IF;
 IF (SELECT md5(jsonb_agg(jsonb_build_array(id,type,amount::text,description,category,transaction_date::text,created_at::text,updated_at::text) ORDER BY id)::text) FROM expense_tracker.transactions) IS DISTINCT FROM 'f2cf23efb7eeb698c20e6cfd89c99064' THEN RAISE EXCEPTION 'T67_ORIGINAL_BASELINE_CHANGED'; END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON
    expense_tracker.profiles, expense_tracker.accounts, expense_tracker.categories,
    expense_tracker.transactions, expense_tracker.transfers,
    expense_tracker.recurring_transactions, expense_tracker.budgets, expense_tracker.goals
    TO expense_tracker_app;
GRANT SELECT, INSERT, UPDATE ON expense_tracker.recurring_occurrences TO expense_tracker_app;
COMMIT;
