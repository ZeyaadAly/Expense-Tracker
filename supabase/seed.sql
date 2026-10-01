-- Local development sample data. Safe to run repeatedly against the V1 schema.
-- Keep sample data separate from the migration; do not apply this to retained user data.
INSERT INTO expense_tracker.transactions
    (id, type, amount, description, category, transaction_date)
VALUES
    ('bb664829-eddd-4a27-bddc-076e8c3bf6fe', 'income', 1000.00,
     'Freelance payment', 'freelance', DATE '2026-09-29'),
    ('986c7255-fb0a-4085-8d6a-69aecfb17cff', 'expense', 250.50,
     'Grocery shopping', 'food', DATE '2026-09-30'),
    ('cd086964-7030-475f-935a-bd257dfb582d', 'expense', 45.75,
     'Taxi fare', 'transport', DATE '2026-09-28')
ON CONFLICT (id) DO NOTHING;
