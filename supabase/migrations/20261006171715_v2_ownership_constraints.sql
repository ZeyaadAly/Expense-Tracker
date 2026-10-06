BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- T15 stage E. Apply only after maintenance, T14 backfill and reconciliation.
-- One atomic versioned migration; no financial UPDATE or timestamp suppression.
LOCK TABLE expense_tracker.profiles, expense_tracker.accounts,
    expense_tracker.categories, expense_tracker.transactions,
    expense_tracker.transfers, expense_tracker.recurring_transactions,
    expense_tracker.recurring_occurrences, expense_tracker.budgets,
    expense_tracker.goals IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE problem record;
BEGIN
    FOR problem IN
        SELECT 'transactions.null_user' AS rule, count(*) AS failures FROM expense_tracker.transactions WHERE user_id IS NULL
        UNION ALL SELECT 'transactions.null_account', count(*) FROM expense_tracker.transactions WHERE account_id IS NULL
        UNION ALL SELECT 'transactions.null_category', count(*) FROM expense_tracker.transactions WHERE category_id IS NULL
        UNION ALL SELECT 'transactions.account_owner', count(*) FROM expense_tracker.transactions t LEFT JOIN expense_tracker.accounts a ON (a.id,a.user_id)=(t.account_id,t.user_id) WHERE a.id IS NULL
        UNION ALL SELECT 'transactions.category', count(*) FROM expense_tracker.transactions t LEFT JOIN expense_tracker.categories c ON c.id=t.category_id WHERE c.id IS NULL OR NOT (c.is_system OR c.user_id=t.user_id) OR c.kind NOT IN (t.type,'both')
        UNION ALL SELECT 'transactions.recurring_owner', count(*) FROM expense_tracker.transactions t LEFT JOIN expense_tracker.recurring_transactions r ON (r.id,r.user_id)=(t.recurring_transaction_id,t.user_id) WHERE t.recurring_transaction_id IS NOT NULL AND r.id IS NULL
        UNION ALL SELECT 'transfers.account_owner', count(*) FROM expense_tracker.transfers t LEFT JOIN expense_tracker.accounts a ON (a.id,a.user_id)=(t.source_account_id,t.user_id) LEFT JOIN expense_tracker.accounts b ON (b.id,b.user_id)=(t.destination_account_id,t.user_id) WHERE a.id IS NULL OR b.id IS NULL
        UNION ALL SELECT 'recurring.account_owner', count(*) FROM expense_tracker.recurring_transactions r LEFT JOIN expense_tracker.accounts a ON (a.id,a.user_id)=(r.account_id,r.user_id) WHERE a.id IS NULL
        UNION ALL SELECT 'recurring.category', count(*) FROM expense_tracker.recurring_transactions r LEFT JOIN expense_tracker.categories c ON c.id=r.category_id WHERE c.id IS NULL OR NOT (c.is_system OR c.user_id=r.user_id) OR c.kind NOT IN (r.type,'both')
        UNION ALL SELECT 'occurrences.definition_owner', count(*) FROM expense_tracker.recurring_occurrences o LEFT JOIN expense_tracker.recurring_transactions r ON (r.id,r.user_id)=(o.recurring_transaction_id,o.user_id) WHERE r.id IS NULL
        UNION ALL SELECT 'occurrences.generated_owner', count(*) FROM expense_tracker.recurring_occurrences o LEFT JOIN expense_tracker.transactions t ON (t.id,t.user_id)=(o.generated_transaction_id,o.user_id) WHERE o.generated_transaction_id IS NOT NULL AND t.id IS NULL
        UNION ALL SELECT 'budgets.category', count(*) FROM expense_tracker.budgets b LEFT JOIN expense_tracker.categories c ON c.id=b.category_id WHERE c.id IS NULL OR NOT (c.is_system OR c.user_id=b.user_id) OR c.kind NOT IN ('expense','both')
        UNION ALL SELECT 'goals.account_owner', count(*) FROM expense_tracker.goals g LEFT JOIN expense_tracker.accounts a ON (a.id,a.user_id)=(g.linked_account_id,g.user_id) WHERE g.linked_account_id IS NOT NULL AND a.id IS NULL
        UNION ALL SELECT 'categories.integrity', count(*) FROM expense_tracker.categories WHERE NOT ((is_system AND user_id IS NULL) OR (NOT is_system AND user_id IS NOT NULL)) OR kind NOT IN ('income','expense','both') OR status NOT IN ('active','archived')
        UNION ALL SELECT 'accounts.activity_lock', count(*) FROM expense_tracker.accounts a WHERE NOT opening_balance_locked AND (EXISTS (SELECT 1 FROM expense_tracker.transactions t WHERE t.account_id=a.id) OR EXISTS (SELECT 1 FROM expense_tracker.transfers t WHERE a.id IN (t.source_account_id,t.destination_account_id)))
    LOOP
        IF problem.failures > 0 THEN
            RAISE EXCEPTION 'T15_PREFLIGHT: % has % invalid rows', problem.rule, problem.failures USING ERRCODE='23514';
        END IF;
    END LOOP;
END;
$$;

ALTER TABLE expense_tracker.transactions
    ALTER COLUMN user_id SET NOT NULL,
    ALTER COLUMN account_id SET NOT NULL,
    ALTER COLUMN category_id SET NOT NULL,
    ALTER COLUMN category DROP NOT NULL,
    DROP CONSTRAINT transactions_category_check,
    DROP CONSTRAINT transactions_account_fk,
    DROP CONSTRAINT transactions_recurring_fk,
    ADD CONSTRAINT transactions_id_user_unique UNIQUE (id,user_id),
    ADD CONSTRAINT transactions_account_owner_fk FOREIGN KEY (account_id,user_id)
        REFERENCES expense_tracker.accounts(id,user_id) ON DELETE RESTRICT,
    ADD CONSTRAINT transactions_recurring_owner_fk FOREIGN KEY (recurring_transaction_id,user_id)
        REFERENCES expense_tracker.recurring_transactions(id,user_id) ON DELETE RESTRICT;

ALTER TABLE expense_tracker.recurring_occurrences
    DROP CONSTRAINT recurring_occurrences_generated_transaction_id_fkey,
    ADD CONSTRAINT occurrences_generated_owner_fk FOREIGN KEY (generated_transaction_id,user_id)
        REFERENCES expense_tracker.transactions(id,user_id)
        ON DELETE SET NULL (generated_transaction_id);

CREATE FUNCTION expense_tracker.preserve_v2_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $$
BEGIN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'Record ownership is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION expense_tracker.validate_v2_category()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $$
DECLARE chosen expense_tracker.categories%ROWTYPE; required_kind text;
BEGIN
    IF NEW.category_id IS NULL OR NEW.user_id IS NULL THEN RETURN NEW; END IF;
    -- SHARE conflicts with category UPDATE, including kind changes. Keep the
    -- parent locked until commit so an insert cannot race a kind reassignment.
    SELECT * INTO chosen FROM expense_tracker.categories WHERE id=NEW.category_id FOR SHARE;
    required_kind := CASE WHEN TG_TABLE_NAME='budgets' THEN 'expense' ELSE to_jsonb(NEW)->>'type' END;
    IF NOT FOUND OR NOT (chosen.is_system OR chosen.user_id=NEW.user_id)
        OR chosen.kind NOT IN (required_kind,'both') THEN
        RAISE EXCEPTION 'Category ownership or kind is incompatible' USING ERRCODE='23514';
    END IF;
    -- Status intentionally belongs to the service boundary; history remains valid.
    RETURN NEW;
END;
$$;

CREATE FUNCTION expense_tracker.protect_v2_category()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'Categories must be archived' USING ERRCODE='23514';
    END IF;
    IF OLD.is_system OR NEW.is_system IS DISTINCT FROM OLD.is_system
        OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'System categories and category ownership are immutable' USING ERRCODE='23514';
    END IF;
    IF NEW.kind IS DISTINCT FROM OLD.kind AND (
        EXISTS (SELECT 1 FROM expense_tracker.transactions WHERE category_id=OLD.id)
        OR EXISTS (SELECT 1 FROM expense_tracker.recurring_transactions WHERE category_id=OLD.id)
        OR EXISTS (SELECT 1 FROM expense_tracker.budgets WHERE category_id=OLD.id)) THEN
        RAISE EXCEPTION 'Referenced category kind is immutable' USING ERRCODE='23514';
    END IF;
    IF OLD.status='active' AND NEW.status='archived' THEN
        UPDATE expense_tracker.recurring_transactions SET status='paused',next_occurrence=NULL
            WHERE category_id=OLD.id AND status='active';
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION expense_tracker.protect_v2_account()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'Accounts must be archived' USING ERRCODE='23514';
    END IF;
    IF OLD.opening_balance_locked AND (NOT NEW.opening_balance_locked
        OR NEW.opening_balance IS DISTINCT FROM OLD.opening_balance
        OR (NEW.type='credit_card') IS DISTINCT FROM (OLD.type='credit_card')) THEN
        RAISE EXCEPTION 'Posted account opening balance and semantics are locked' USING ERRCODE='23514';
    END IF;
    IF OLD.status='active' AND NEW.status='archived' THEN
        UPDATE expense_tracker.recurring_transactions SET status='paused',next_occurrence=NULL
            WHERE account_id=OLD.id AND status='active';
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION expense_tracker.validate_v2_account_use()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $$
DECLARE ids uuid[]; chosen record; n integer := 0; posted boolean;
BEGIN
    posted := TG_TABLE_NAME IN ('transactions','transfers');
    IF TG_TABLE_NAME='transfers' THEN
        ids := ARRAY[NEW.source_account_id,NEW.destination_account_id];
    ELSIF TG_TABLE_NAME='goals' THEN
        IF NEW.linked_account_id IS NULL OR (TG_OP='UPDATE' AND NEW.linked_account_id IS NOT DISTINCT FROM OLD.linked_account_id) THEN RETURN NEW; END IF;
        ids := ARRAY[NEW.linked_account_id];
    ELSE
        IF TG_TABLE_NAME='recurring_transactions' THEN
            IF TG_OP='UPDATE' AND NEW.status<>'active'
                AND NEW.account_id IS NOT DISTINCT FROM OLD.account_id THEN RETURN NEW; END IF;
        END IF;
        ids := ARRAY[NEW.account_id];
    END IF;
    IF array_position(ids,NULL) IS NOT NULL OR NEW.user_id IS NULL THEN RETURN NEW; END IF;
    -- Deterministic locking of both transfer accounts, before posting or archiving.
    FOR chosen IN SELECT id,user_id,status,opening_balance_locked FROM expense_tracker.accounts
        WHERE id=ANY(ids) ORDER BY id FOR UPDATE
    LOOP
        n := n+1;
        IF chosen.user_id IS DISTINCT FROM NEW.user_id OR chosen.status<>'active' THEN
            RAISE EXCEPTION 'Account must be owned and active' USING ERRCODE='23514';
        END IF;
        IF posted AND NOT chosen.opening_balance_locked THEN
            UPDATE expense_tracker.accounts SET opening_balance_locked=true WHERE id=chosen.id;
        END IF;
    END LOOP;
    IF n <> cardinality(ids) THEN
        RAISE EXCEPTION 'Account references must exist and be distinct' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['profiles','accounts','categories','transactions','transfers','recurring_transactions','recurring_occurrences','budgets','goals'] LOOP
        EXECUTE format('CREATE TRIGGER v2_owner_immutable BEFORE UPDATE ON expense_tracker.%I FOR EACH ROW EXECUTE FUNCTION expense_tracker.preserve_v2_owner()',table_name);
    END LOOP;
END;
$$;

CREATE TRIGGER v2_category_integrity BEFORE INSERT OR UPDATE OF category_id,user_id,type ON expense_tracker.transactions FOR EACH ROW EXECUTE FUNCTION expense_tracker.validate_v2_category();
CREATE TRIGGER v2_category_integrity BEFORE INSERT OR UPDATE OF category_id,user_id,type ON expense_tracker.recurring_transactions FOR EACH ROW EXECUTE FUNCTION expense_tracker.validate_v2_category();
CREATE TRIGGER v2_category_integrity BEFORE INSERT OR UPDATE OF category_id,user_id ON expense_tracker.budgets FOR EACH ROW EXECUTE FUNCTION expense_tracker.validate_v2_category();
CREATE TRIGGER v2_category_protect BEFORE UPDATE OR DELETE ON expense_tracker.categories FOR EACH ROW EXECUTE FUNCTION expense_tracker.protect_v2_category();
CREATE TRIGGER v2_account_protect BEFORE UPDATE OR DELETE ON expense_tracker.accounts FOR EACH ROW EXECUTE FUNCTION expense_tracker.protect_v2_account();
CREATE TRIGGER v2_account_use BEFORE INSERT OR UPDATE ON expense_tracker.transactions FOR EACH ROW EXECUTE FUNCTION expense_tracker.validate_v2_account_use();
CREATE TRIGGER v2_account_use BEFORE INSERT OR UPDATE ON expense_tracker.transfers FOR EACH ROW EXECUTE FUNCTION expense_tracker.validate_v2_account_use();
CREATE TRIGGER v2_account_use BEFORE INSERT OR UPDATE OF account_id,status ON expense_tracker.recurring_transactions FOR EACH ROW EXECUTE FUNCTION expense_tracker.validate_v2_account_use();
CREATE TRIGGER v2_account_use BEFORE INSERT OR UPDATE OF linked_account_id ON expense_tracker.goals FOR EACH ROW EXECUTE FUNCTION expense_tracker.validate_v2_account_use();

REVOKE EXECUTE ON FUNCTION expense_tracker.preserve_v2_owner(),expense_tracker.validate_v2_category(),expense_tracker.protect_v2_category(),expense_tracker.protect_v2_account(),expense_tracker.validate_v2_account_use() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION expense_tracker.preserve_v2_owner(),expense_tracker.validate_v2_category(),expense_tracker.protect_v2_category(),expense_tracker.protect_v2_account(),expense_tracker.validate_v2_account_use() TO expense_tracker_app;
-- Do not restore suspended financial DML here. Production must retire V1 first.
COMMIT;
