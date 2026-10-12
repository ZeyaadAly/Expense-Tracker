BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE expense_tracker.transactions, expense_tracker.recurring_occurrences IN ACCESS EXCLUSIVE MODE;

-- Fail closed on inconsistent history; never silently repair financial rows.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM expense_tracker.transactions WHERE (recurring_transaction_id IS NULL) <> (recurring_occurrence_date IS NULL))
    OR EXISTS (SELECT 1 FROM expense_tracker.transactions t WHERE t.recurring_transaction_id IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM expense_tracker.recurring_occurrences o WHERE (o.recurring_transaction_id,o.occurrence_date,o.user_id)=(t.recurring_transaction_id,t.recurring_occurrence_date,t.user_id)))
    OR EXISTS (SELECT 1 FROM expense_tracker.recurring_occurrences o JOIN expense_tracker.transactions t ON t.id=o.generated_transaction_id
      WHERE (t.user_id,t.recurring_transaction_id,t.recurring_occurrence_date) IS DISTINCT FROM (o.user_id,o.recurring_transaction_id,o.occurrence_date))
  THEN RAISE EXCEPTION 'T32 occurrence identity preflight failed' USING ERRCODE='23514'; END IF;
END $$;

ALTER TABLE expense_tracker.transactions
  ADD CONSTRAINT transactions_generated_pair_check CHECK ((recurring_transaction_id IS NULL) = (recurring_occurrence_date IS NULL)),
  ADD CONSTRAINT transactions_occurrence_fk FOREIGN KEY (recurring_transaction_id,recurring_occurrence_date)
    REFERENCES expense_tracker.recurring_occurrences(recurring_transaction_id,occurrence_date) ON DELETE RESTRICT;
CREATE UNIQUE INDEX transactions_generated_pair_unique ON expense_tracker.transactions(recurring_transaction_id,recurring_occurrence_date)
  WHERE recurring_transaction_id IS NOT NULL;

CREATE FUNCTION expense_tracker.guard_occurrence_history() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Occurrence history cannot be deleted' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.status='failed' AND NEW.status='posted' THEN
      RAISE EXCEPTION 'Failed occurrence requires explicit pending recovery' USING ERRCODE='23514';
    END IF;
    IF (NEW.id,NEW.user_id,NEW.recurring_transaction_id,NEW.occurrence_date) IS DISTINCT FROM
       (OLD.id,OLD.user_id,OLD.recurring_transaction_id,OLD.occurrence_date) THEN
      RAISE EXCEPTION 'Occurrence identity is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.status IN ('posted','skipped') THEN
      IF (NEW.status,NEW.processed_at,NEW.failure_code) IS DISTINCT FROM (OLD.status,OLD.processed_at,OLD.failure_code)
        OR (NEW.generated_transaction_id IS DISTINCT FROM OLD.generated_transaction_id AND NOT
          (OLD.status='posted' AND OLD.generated_transaction_id IS NOT NULL AND NEW.generated_transaction_id IS NULL AND NOT EXISTS
            (SELECT 1 FROM expense_tracker.transactions WHERE id=OLD.generated_transaction_id))) THEN
        RAISE EXCEPTION 'Terminal occurrence is immutable' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  IF NEW.status='posted' AND NEW.generated_transaction_id IS NULL AND (TG_OP='INSERT' OR OLD.status<>'posted') THEN
    RAISE EXCEPTION 'Posting requires a generated transaction' USING ERRCODE='23514';
  END IF;
  IF NEW.generated_transaction_id IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM expense_tracker.transactions t WHERE t.id=NEW.generated_transaction_id AND
      (t.user_id,t.recurring_transaction_id,t.recurring_occurrence_date)=(NEW.user_id,NEW.recurring_transaction_id,NEW.occurrence_date)) THEN
    RAISE EXCEPTION 'Generated transaction identity mismatch' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.status,NEW.generated_transaction_id,NEW.processed_at,NEW.failure_code) IS NOT DISTINCT FROM
    (OLD.status,OLD.generated_transaction_id,OLD.processed_at,OLD.failure_code) THEN RETURN NULL; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION expense_tracker.guard_generated_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE occurrence_status text;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (NEW.recurring_transaction_id,NEW.recurring_occurrence_date) IS DISTINCT FROM (OLD.recurring_transaction_id,OLD.recurring_occurrence_date) THEN
      RAISE EXCEPTION 'Generated identity is immutable' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.recurring_transaction_id IS NOT NULL THEN
    SELECT status INTO occurrence_status FROM expense_tracker.recurring_occurrences
      WHERE recurring_transaction_id=NEW.recurring_transaction_id AND occurrence_date=NEW.recurring_occurrence_date AND user_id=NEW.user_id FOR UPDATE;
    IF occurrence_status IS DISTINCT FROM 'pending' THEN
      RAISE EXCEPTION 'Generated posting requires a pending owned occurrence' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER aa_occurrence_history BEFORE INSERT OR UPDATE OR DELETE ON expense_tracker.recurring_occurrences
  FOR EACH ROW EXECUTE FUNCTION expense_tracker.guard_occurrence_history();
CREATE TRIGGER zz_generated_identity BEFORE INSERT OR UPDATE ON expense_tracker.transactions
  FOR EACH ROW EXECUTE FUNCTION expense_tracker.guard_generated_identity();
ALTER TABLE expense_tracker.recurring_occurrences ADD CONSTRAINT occurrences_safe_failure_code_check
  CHECK (failure_code IS NULL OR failure_code ~ '^[A-Z][A-Z0-9_]{0,39}$');

CREATE FUNCTION expense_tracker.check_generated_completion() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM expense_tracker.transactions t WHERE t.id=NEW.id AND t.recurring_transaction_id IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM expense_tracker.recurring_occurrences o WHERE o.recurring_transaction_id=t.recurring_transaction_id
      AND o.occurrence_date=t.recurring_occurrence_date AND o.user_id=t.user_id AND o.status='posted' AND o.generated_transaction_id=t.id)) THEN
    RAISE EXCEPTION 'Generated transaction must complete its occurrence atomically' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER generated_completion AFTER INSERT ON expense_tracker.transactions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION expense_tracker.check_generated_completion();
REVOKE EXECUTE ON FUNCTION expense_tracker.guard_occurrence_history(),expense_tracker.guard_generated_identity() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION expense_tracker.check_generated_completion() FROM PUBLIC,anon,authenticated;
-- Invoker triggers use the existing runtime table grants. No new privileges.
COMMIT;
