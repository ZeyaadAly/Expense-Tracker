-- Reviewed T66 maintenance operation, not an automatic migration.
-- Target independently verified as project kpbyvbgcfwavcsgtcdws / postgres.
-- Execute only after the committed maintenance artifact is hosted and verified.
-- The user explicitly waived backup/restore and required retaining the original row.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
LOCK TABLE expense_tracker.transactions IN SHARE MODE;
DO $$
DECLARE actual text;
BEGIN
  IF current_database() <> 'postgres' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'T66_TARGET_ROLE_MISMATCH';
  END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations
      WHERE version IN ('20261001144302','20261003163341','20261006132717',
        '20261006132719','20261006132721','20261006132723',
        '20261006171715','20261008135130')) <> 8 THEN
    RAISE EXCEPTION 'T66_HISTORY_MISMATCH';
  END IF;
  SELECT md5(jsonb_agg(jsonb_build_array(id,type,amount::text,description,
    category,transaction_date::text,created_at::text,updated_at::text)
    ORDER BY id)::text) INTO actual FROM expense_tracker.transactions;
  IF (SELECT count(*) FROM expense_tracker.transactions) <> 1
     OR actual IS DISTINCT FROM 'f2cf23efb7eeb698c20e6cfd89c99064' THEN
    RAISE EXCEPTION 'T66_ORIGINAL_BASELINE_CHANGED';
  END IF;
END $$;
REVOKE SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA expense_tracker FROM expense_tracker_app;
COMMIT;
