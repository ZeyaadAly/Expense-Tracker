BEGIN;

CREATE FUNCTION expense_tracker.set_v2_timestamps()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.created_at := statement_timestamp();
    ELSE
        IF (to_jsonb(NEW)->'id') IS DISTINCT FROM (to_jsonb(OLD)->'id') THEN
            RAISE EXCEPTION 'Record identifier cannot be changed' USING ERRCODE = '23514';
        END IF;
        NEW.created_at := OLD.created_at;
    END IF;
    NEW.updated_at := statement_timestamp();
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION expense_tracker.set_v2_timestamps() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION expense_tracker.validate_transfer_date()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $$
BEGIN
    IF NEW.date > (statement_timestamp() AT TIME ZONE 'Africa/Cairo')::date THEN
        RAISE EXCEPTION 'Transfer date cannot be in the future' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION expense_tracker.validate_transfer_date() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER profiles_timestamps BEFORE INSERT OR UPDATE ON expense_tracker.profiles
    FOR EACH ROW EXECUTE FUNCTION expense_tracker.set_v2_timestamps();
CREATE TRIGGER accounts_timestamps BEFORE INSERT OR UPDATE ON expense_tracker.accounts
    FOR EACH ROW EXECUTE FUNCTION expense_tracker.set_v2_timestamps();
CREATE TRIGGER categories_timestamps BEFORE INSERT OR UPDATE ON expense_tracker.categories
    FOR EACH ROW EXECUTE FUNCTION expense_tracker.set_v2_timestamps();
CREATE TRIGGER transfers_timestamps BEFORE INSERT OR UPDATE ON expense_tracker.transfers
    FOR EACH ROW EXECUTE FUNCTION expense_tracker.set_v2_timestamps();
CREATE TRIGGER transfers_date_write BEFORE INSERT OR UPDATE ON expense_tracker.transfers
    FOR EACH ROW EXECUTE FUNCTION expense_tracker.validate_transfer_date();
CREATE TRIGGER recurring_transactions_timestamps BEFORE INSERT OR UPDATE ON expense_tracker.recurring_transactions
    FOR EACH ROW EXECUTE FUNCTION expense_tracker.set_v2_timestamps();
CREATE TRIGGER recurring_occurrences_timestamps BEFORE INSERT OR UPDATE ON expense_tracker.recurring_occurrences
    FOR EACH ROW EXECUTE FUNCTION expense_tracker.set_v2_timestamps();
CREATE TRIGGER budgets_timestamps BEFORE INSERT OR UPDATE ON expense_tracker.budgets
    FOR EACH ROW EXECUTE FUNCTION expense_tracker.set_v2_timestamps();
CREATE TRIGGER goals_timestamps BEFORE INSERT OR UPDATE ON expense_tracker.goals
    FOR EACH ROW EXECUTE FUNCTION expense_tracker.set_v2_timestamps();
-- transactions retain their existing validate_transaction_write trigger exclusively.

CREATE UNIQUE INDEX accounts_user_name_unique ON expense_tracker.accounts (user_id,lower(name));
CREATE INDEX accounts_user_status_idx ON expense_tracker.accounts (user_id,status);
CREATE UNIQUE INDEX categories_system_name_unique ON expense_tracker.categories (lower(name)) WHERE is_system;
CREATE UNIQUE INDEX categories_user_name_unique ON expense_tracker.categories (user_id,lower(name)) WHERE NOT is_system;
CREATE INDEX categories_user_status_idx ON expense_tracker.categories (user_id,status);
CREATE INDEX categories_kind_status_idx ON expense_tracker.categories (kind,status);

CREATE INDEX transactions_user_order_idx ON expense_tracker.transactions (user_id,transaction_date DESC,created_at DESC,id DESC);
CREATE INDEX transactions_user_type_date_idx ON expense_tracker.transactions (user_id,type,transaction_date DESC);
CREATE INDEX transactions_user_account_date_idx ON expense_tracker.transactions (user_id,account_id,transaction_date DESC);
CREATE INDEX transactions_user_category_date_idx ON expense_tracker.transactions (user_id,category_id,transaction_date DESC);
-- Global FK indexes also support parent restrictions without a leading user filter.
CREATE INDEX transactions_account_idx ON expense_tracker.transactions (account_id) WHERE account_id IS NOT NULL;
CREATE INDEX transactions_category_idx ON expense_tracker.transactions (category_id) WHERE category_id IS NOT NULL;
CREATE INDEX transactions_recurring_idx ON expense_tracker.transactions (recurring_transaction_id) WHERE recurring_transaction_id IS NOT NULL;

CREATE INDEX transfers_user_order_idx ON expense_tracker.transfers (user_id,date DESC,created_at DESC,id DESC);
CREATE INDEX transfers_source_date_idx ON expense_tracker.transfers (source_account_id,date DESC);
CREATE INDEX transfers_destination_date_idx ON expense_tracker.transfers (destination_account_id,date DESC);
CREATE INDEX recurring_user_status_next_idx ON expense_tracker.recurring_transactions (user_id,status,next_occurrence);
CREATE INDEX recurring_due_idx ON expense_tracker.recurring_transactions (next_occurrence,id) WHERE status='active' AND next_occurrence IS NOT NULL;
CREATE INDEX recurring_account_idx ON expense_tracker.recurring_transactions (account_id);
CREATE INDEX recurring_category_idx ON expense_tracker.recurring_transactions (category_id);
CREATE INDEX occurrences_user_idx ON expense_tracker.recurring_occurrences (user_id);
CREATE INDEX occurrences_status_date_idx ON expense_tracker.recurring_occurrences (status,occurrence_date);
CREATE INDEX budgets_user_period_idx ON expense_tracker.budgets (user_id,year,month);
CREATE INDEX budgets_category_idx ON expense_tracker.budgets (category_id);
CREATE INDEX goals_user_status_idx ON expense_tracker.goals (user_id,status);
CREATE INDEX goals_linked_account_idx ON expense_tracker.goals (linked_account_id) WHERE linked_account_id IS NOT NULL;

COMMIT;
