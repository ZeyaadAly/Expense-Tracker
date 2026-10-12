-- T12 reference data only. Apply after T11 with the privileged migration operator.
-- Fixed UUID literals are the cross-environment identity contract for T14 mapping.
-- Never upsert updates: existing rows (including timestamps) and custom rows stay intact.
-- A conflicting name with a different ID intentionally fails rather than hiding drift.
BEGIN;
INSERT INTO expense_tracker.categories (id, name, kind, icon, color, status, is_system, user_id)
VALUES
  ('c1200000-0000-4000-8000-000000000001', 'Salary', 'income', NULL, NULL, 'active', true, NULL),
  ('c1200000-0000-4000-8000-000000000002', 'Freelance', 'income', NULL, NULL, 'active', true, NULL),
  ('c1200000-0000-4000-8000-000000000003', 'Gift', 'income', NULL, NULL, 'active', true, NULL),
  ('c1200000-0000-4000-8000-000000000004', 'Food', 'expense', NULL, NULL, 'active', true, NULL),
  ('c1200000-0000-4000-8000-000000000005', 'Transport', 'expense', NULL, NULL, 'active', true, NULL),
  ('c1200000-0000-4000-8000-000000000006', 'Shopping', 'expense', NULL, NULL, 'active', true, NULL),
  ('c1200000-0000-4000-8000-000000000007', 'Bills', 'expense', NULL, NULL, 'active', true, NULL),
  ('c1200000-0000-4000-8000-000000000008', 'Entertainment', 'expense', NULL, NULL, 'active', true, NULL),
  ('c1200000-0000-4000-8000-000000000009', 'Other', 'both', NULL, NULL, 'active', true, NULL)
ON CONFLICT (id) DO NOTHING;
COMMIT;
