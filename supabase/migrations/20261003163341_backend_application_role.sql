BEGIN;

-- Password provisioning is separate and never stored in migration history.
CREATE ROLE expense_tracker_app LOGIN NOINHERIT NOSUPERUSER NOCREATEDB
    NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE postgres TO expense_tracker_app;
GRANT USAGE ON SCHEMA expense_tracker TO expense_tracker_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON expense_tracker.transactions
    TO expense_tracker_app;
GRANT EXECUTE ON FUNCTION expense_tracker.validate_transaction_write()
    TO expense_tracker_app;

-- UUIDs are supplied by Express; this schema has no sequences.
-- No schema CREATE, table TRUNCATE, REFERENCES, or TRIGGER privileges are granted.
COMMIT;
