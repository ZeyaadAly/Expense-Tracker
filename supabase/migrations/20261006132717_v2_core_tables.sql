BEGIN;

-- T11 stage A: structure only. No Auth provisioning, seed or production backfill.
-- Existing private schema and V1 transaction contract remain intact.
CREATE TABLE expense_tracker.profiles (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
    display_name varchar(100),
    preferred_currency char(3) NOT NULL DEFAULT 'EGP',
    locale varchar(20) NOT NULL DEFAULT 'en',
    timezone varchar(64) NOT NULL DEFAULT 'Africa/Cairo',
    created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    CONSTRAINT profiles_currency_check CHECK (preferred_currency = 'EGP'),
    CONSTRAINT profiles_locale_check CHECK (locale = 'en'),
    CONSTRAINT profiles_timezone_check CHECK (timezone = 'Africa/Cairo'),
    CONSTRAINT profiles_display_name_check CHECK (display_name IS NULL OR (
        char_length(display_name) BETWEEN 1 AND 100
        AND display_name !~ '^[[:space:]]' AND display_name !~ '[[:space:]]$'))
);

CREATE TABLE expense_tracker.accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    name varchar(100) NOT NULL,
    type varchar(32) NOT NULL,
    opening_balance numeric NOT NULL DEFAULT 0.00,
    opening_balance_locked boolean NOT NULL DEFAULT false,
    currency char(3) NOT NULL DEFAULT 'EGP',
    status varchar(16) NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    CONSTRAINT accounts_id_user_unique UNIQUE (id, user_id),
    CONSTRAINT accounts_name_check CHECK (char_length(name) BETWEEN 1 AND 100
        AND name !~ '^[[:space:]]' AND name !~ '[[:space:]]$'),
    CONSTRAINT accounts_type_check CHECK (type IN ('cash','bank','savings','credit_card','mobile_wallet','other')),
    CONSTRAINT accounts_status_check CHECK (status IN ('active','archived')),
    CONSTRAINT accounts_currency_check CHECK (currency = 'EGP'),
    CONSTRAINT accounts_opening_balance_range_check CHECK (opening_balance BETWEEN -999999999.99 AND 999999999.99),
    CONSTRAINT accounts_opening_balance_scale_check CHECK (scale(opening_balance) <= 2)
);

CREATE TABLE expense_tracker.categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
    name varchar(80) NOT NULL,
    kind varchar(16) NOT NULL,
    icon varchar(64),
    color varchar(16),
    status varchar(16) NOT NULL DEFAULT 'active',
    is_system boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    CONSTRAINT categories_name_check CHECK (char_length(name) BETWEEN 1 AND 80
        AND name !~ '^[[:space:]]' AND name !~ '[[:space:]]$'),
    CONSTRAINT categories_kind_check CHECK (kind IN ('income','expense','both')),
    CONSTRAINT categories_status_check CHECK (status IN ('active','archived')),
    CONSTRAINT categories_owner_check CHECK ((is_system AND user_id IS NULL) OR (NOT is_system AND user_id IS NOT NULL))
);

CREATE TABLE expense_tracker.transfers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    source_account_id uuid NOT NULL,
    destination_account_id uuid NOT NULL,
    amount numeric NOT NULL,
    date date NOT NULL,
    description varchar(200),
    created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    CONSTRAINT transfers_source_owner_fk FOREIGN KEY (source_account_id,user_id)
        REFERENCES expense_tracker.accounts(id,user_id) ON DELETE RESTRICT,
    CONSTRAINT transfers_destination_owner_fk FOREIGN KEY (destination_account_id,user_id)
        REFERENCES expense_tracker.accounts(id,user_id) ON DELETE RESTRICT,
    CONSTRAINT transfers_accounts_different_check CHECK (source_account_id <> destination_account_id),
    CONSTRAINT transfers_amount_range_check CHECK (amount BETWEEN 0.01 AND 999999999.99),
    CONSTRAINT transfers_amount_scale_check CHECK (scale(amount) <= 2),
    CONSTRAINT transfers_date_check CHECK (date BETWEEN DATE '1900-01-01' AND DATE '9999-12-31'),
    CONSTRAINT transfers_description_check CHECK (description IS NULL OR (
        char_length(description) BETWEEN 1 AND 200
        AND description !~ '^[[:space:]]' AND description !~ '[[:space:]]$'))
);

CREATE TABLE expense_tracker.recurring_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    account_id uuid NOT NULL,
    category_id uuid NOT NULL REFERENCES expense_tracker.categories(id) ON DELETE RESTRICT,
    type varchar(16) NOT NULL,
    amount numeric NOT NULL,
    description varchar(200) NOT NULL,
    frequency varchar(16) NOT NULL,
    start_date date NOT NULL,
    next_occurrence date,
    end_date date,
    status varchar(16) NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    CONSTRAINT recurring_id_user_unique UNIQUE (id,user_id),
    CONSTRAINT recurring_account_owner_fk FOREIGN KEY (account_id,user_id)
        REFERENCES expense_tracker.accounts(id,user_id) ON DELETE RESTRICT,
    CONSTRAINT recurring_type_check CHECK (type IN ('income','expense')),
    CONSTRAINT recurring_amount_range_check CHECK (amount BETWEEN 0.01 AND 999999999.99),
    CONSTRAINT recurring_amount_scale_check CHECK (scale(amount) <= 2),
    CONSTRAINT recurring_description_check CHECK (char_length(description) BETWEEN 1 AND 200
        AND description !~ '^[[:space:]]' AND description !~ '[[:space:]]$'),
    CONSTRAINT recurring_frequency_check CHECK (frequency IN ('daily','weekly','monthly','yearly')),
    CONSTRAINT recurring_status_check CHECK (status IN ('active','paused','archived')),
    CONSTRAINT recurring_start_date_check CHECK (start_date BETWEEN DATE '1900-01-01' AND DATE '9999-12-31'),
    CONSTRAINT recurring_end_date_check CHECK (end_date IS NULL OR (end_date BETWEEN start_date AND DATE '9999-12-31')),
    CONSTRAINT recurring_next_date_check CHECK (next_occurrence IS NULL OR (
        next_occurrence BETWEEN start_date AND DATE '9999-12-31' AND (end_date IS NULL OR next_occurrence <= end_date))),
    CONSTRAINT recurring_inactive_next_check CHECK (status = 'active' OR next_occurrence IS NULL)
    -- Anchors derive from start_date: no independent day_of_week/day_of_month in P0.
);

CREATE TABLE expense_tracker.recurring_occurrences (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    recurring_transaction_id uuid NOT NULL,
    occurrence_date date NOT NULL,
    status varchar(16) NOT NULL DEFAULT 'pending',
    generated_transaction_id uuid UNIQUE REFERENCES expense_tracker.transactions(id) ON DELETE SET NULL,
    processed_at timestamptz,
    failure_code varchar(40),
    created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    CONSTRAINT occurrences_id_user_unique UNIQUE (id,user_id),
    CONSTRAINT occurrences_definition_date_unique UNIQUE (recurring_transaction_id,occurrence_date),
    CONSTRAINT occurrences_definition_owner_fk FOREIGN KEY (recurring_transaction_id,user_id)
        REFERENCES expense_tracker.recurring_transactions(id,user_id) ON DELETE RESTRICT,
    CONSTRAINT occurrences_date_check CHECK (occurrence_date BETWEEN DATE '1900-01-01' AND DATE '9999-12-31'),
    CONSTRAINT occurrences_status_check CHECK (status IN ('pending','posted','skipped','failed')),
    CONSTRAINT occurrences_processed_check CHECK ((status = 'pending' AND processed_at IS NULL) OR (status <> 'pending' AND processed_at IS NOT NULL)),
    CONSTRAINT occurrences_link_check CHECK (status = 'posted' OR generated_transaction_id IS NULL),
    CONSTRAINT occurrences_failure_check CHECK (failure_code IS NULL OR (status = 'failed' AND failure_code ~ '^[A-Z][A-Z0-9_]{0,39}$'))
    -- T32 adds terminal-transition and generated identity/link integrity triggers.
);

CREATE TABLE expense_tracker.budgets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    category_id uuid NOT NULL REFERENCES expense_tracker.categories(id) ON DELETE RESTRICT,
    amount numeric NOT NULL,
    year smallint NOT NULL,
    month smallint NOT NULL,
    alert_threshold_percent smallint NOT NULL DEFAULT 90,
    created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    CONSTRAINT budgets_user_category_period_unique UNIQUE (user_id,category_id,year,month),
    CONSTRAINT budgets_amount_range_check CHECK (amount BETWEEN 0.01 AND 999999999.99),
    CONSTRAINT budgets_amount_scale_check CHECK (scale(amount) <= 2),
    CONSTRAINT budgets_year_check CHECK (year BETWEEN 1900 AND 9999),
    CONSTRAINT budgets_month_check CHECK (month BETWEEN 1 AND 12),
    CONSTRAINT budgets_threshold_check CHECK (alert_threshold_percent BETWEEN 1 AND 100)
);

CREATE TABLE expense_tracker.goals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    name varchar(120) NOT NULL,
    target_amount numeric NOT NULL,
    saved_amount numeric NOT NULL DEFAULT 0.00,
    target_date date,
    linked_account_id uuid,
    status varchar(16) NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    CONSTRAINT goals_linked_account_owner_fk FOREIGN KEY (linked_account_id,user_id)
        REFERENCES expense_tracker.accounts(id,user_id) ON DELETE RESTRICT,
    CONSTRAINT goals_name_check CHECK (char_length(name) BETWEEN 1 AND 120
        AND name !~ '^[[:space:]]' AND name !~ '[[:space:]]$'),
    CONSTRAINT goals_target_amount_range_check CHECK (target_amount BETWEEN 0.01 AND 999999999.99),
    CONSTRAINT goals_target_amount_scale_check CHECK (scale(target_amount) <= 2),
    CONSTRAINT goals_saved_amount_range_check CHECK (saved_amount BETWEEN 0.00 AND 999999999.99),
    CONSTRAINT goals_saved_amount_scale_check CHECK (scale(saved_amount) <= 2),
    CONSTRAINT goals_date_check CHECK (target_date IS NULL OR target_date BETWEEN DATE '1900-01-01' AND DATE '9999-12-31'),
    CONSTRAINT goals_status_check CHECK (status IN ('active','completed','archived')),
    CONSTRAINT goals_completed_check CHECK (status <> 'completed' OR saved_amount >= target_amount)
);

-- Revoke at creation, before later files grant the runtime its explicit privileges.
REVOKE ALL ON ALL TABLES IN SCHEMA expense_tracker FROM PUBLIC, anon, authenticated;
COMMIT;
