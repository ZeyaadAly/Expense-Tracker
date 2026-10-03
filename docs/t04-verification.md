# T04 verification — 2026-10-03

Status: Completed. T05 has not started.

## Remote baseline and history

The repository link, Supabase connector, and CLI 2.119.0 identify project
`kpbyvbgcfwavcsgtcdws` (`expense-tracker`), reported ACTIVE_HEALTHY on PostgreSQL 17.
The CLI confirmed baseline version `20261001144302` was already applied; no baseline
repair, schema recreation, `db pull`, or `db push` was performed.

Catalog inspection verified all eight transaction columns and types, required/nullability
and timestamp defaults, the primary key plus six check constraints, primary-key and
descending-order indexes, BEFORE INSERT OR UPDATE trigger, and matching function body.
The function is SECURITY INVOKER with pg_catalog search_path. PUBLIC schema/table/function
grants are revoked. Neither anon nor authenticated has schema usage or transaction access.
Local config excludes expense_tracker from Data API exposed schemas. The connector did
not report a remote exposed-schema list; verified privilege denial prevents those Data API
roles from accessing these objects regardless of that setting.

## Limited role and connection

New CLI-generated migration `20261003163341_backend_application_role.sql` was executed
once, then recorded as applied with CLI migration repair. Final CLI history agrees with
both local migration versions. The existing baseline is unchanged.

`expense_tracker_app` has LOGIN, database CONNECT, application schema USAGE, transaction
SELECT/INSERT/UPDATE/DELETE, and trigger-function EXECUTE. It has no memberships, superuser,
CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS, schema CREATE, table TRUNCATE, or table TRIGGER
privileges. There are no application sequences, so no sequence grants are needed.
Default PostgreSQL PUBLIC privileges outside this application are not globally modified.

A randomly generated password was provisioned using a SCRAM verifier and saved only in
ignored backend/.env. Login through the Session Pooler returned current_user
expense_tracker_app and an authorized TLS socket. Backend pool TLS checks certificates
and hostname; it never uses rejectUnauthorized:false. pg_stat_ssl describes the pooler's
upstream database connection, not the application's TLS socket, so the latter was checked
directly.

Public CA source (downloaded over HTTPS):
https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

See [Supabase SSL guidance](https://supabase.com/docs/guides/platform/ssl-enforcement)
and [PostgreSQL role guidance](https://supabase.com/docs/guides/database/postgres/roles).

## Executed checks

- Backend lint, TypeScript check, and production build passed.
- Production backend started at localhost:4000 using the limited role.
- GET /api/v1/health returned HTTP 200, exact documented success JSON, and no-store.
- A separate backend connected to an unavailable loopback port returned HTTP 503,
  exact DATABASE_UNAVAILABLE JSON with empty details, and no-store; no internals leaked.
- Portable PostgreSQL 17.11, isolated on loopback port 55404, applied both migrations
  successfully to a fresh cluster; no Docker or remote sample seeding was used.
- Seed ran twice and retained three records: income 1000.00, expenses 296.25,
  balance 703.75 EGP.
- Limited-role SELECT/INSERT/UPDATE/DELETE and write trigger execution passed locally.
- Invalid amount range/precision/special values, type/category, descriptions, null fields,
  past/future/impossible dates, and changed identifiers were rejected.
- Creation timestamps were preserved; update timestamps were database-managed.
- Numeric 0.10 + 0.20 equaled exactly 0.30.
- Limited-role schema creation and TRUNCATE attempts were denied.

Verification scripts are in backend/scripts/. The disposable server was stopped after
verification. Remote transaction data was not seeded or modified.
