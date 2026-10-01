# Expense Tracker — Requirements

**Version:** 1.0  
**Date:** 2026-10-01  
**Status:** V1 implementation baseline  
**Related document:** [Project brief](01-project-brief.md)

## 1. Purpose and scope

Define how the V1 features behave and how to check that they work. These requirements build on the project brief and guide interface, database, API, and implementation decisions.

V1 serves one person tracking personal expenses in EGP. It has one shared transaction collection and no authentication. A hosted demonstration uses sample data only. Sign-up, login, multiple accounts, charts, budgets, recurring transactions, custom categories, exports, bank integrations, and AI features remain outside V1.

## 2. Agreed technical constraints

- Frontend: Next.js, TypeScript, and Tailwind CSS.
- Backend: Express.js and TypeScript.
- Database: Supabase PostgreSQL.
- The frontend sends application requests to Express; Express validates and reads or writes Supabase PostgreSQL data through a server-only PostgreSQL connection.
- Monetary values must be stored and calculated exactly. The database and API documents will define their representation.
- Database credentials stay on the server. The frontend does not connect to Supabase or call its Data API.

## Access boundary

- Express is the only application API and the only application component that connects to Supabase PostgreSQL.
- V1 is unauthenticated. CORS limits browser origins but does not protect the shared collection from direct HTTP clients.
- Do not host real personal financial data until authentication and ownership controls are designed and implemented in a later version.

## 3. Transaction fields and validation

These are proposed V1 defaults, selected to make the first implementation small and consistent. Changes should be reflected here before implementation.

| Field | Required | Rule |
| --- | --- | --- |
| Type | Yes | Exactly Income or Expense. |
| Amount | Yes | Between 0.01 and 999,999,999.99 EGP, inclusive; at most two decimal places. No negative values, zero, separators, currency symbols, or exponent notation. |
| Description | Yes | Trim leading and trailing whitespace; resulting text must contain 1–200 characters. Treat it as plain text. |
| Category | Yes | Must belong to the selected type's fixed category list. |
| Date | Yes | A valid calendar date between 1900-01-01 and today in Africa/Cairo, inclusive. Future dates are excluded because V1 records transactions that have occurred. |

Amounts such as `10`, `10.5`, and `10.50` are valid and display as `10.00`, `10.50`, and `10.50` EGP. Values such as `0`, `-5`, `1.234`, and `1e3` are invalid; excess precision must be rejected rather than silently rounded.

Dates travel through the API as date-only values in `YYYY-MM-DD` format. Store and display the same calendar date without converting it into a different day through timezone handling. Display dates as `DD/MM/YYYY` with English digits.

Each saved transaction also has a unique, server-generated identifier and server-managed creation and update timestamps. Users cannot edit these fields.

### Fixed categories

| Type | Allowed categories |
| --- | --- |
| Income | Salary, Freelance, Gift, Other |
| Expense | Food, Transport, Shopping, Bills, Entertainment, Other |

Frontend validation provides immediate feedback. Express independently enforces every rule, including when requests bypass the interface. Invalid requests must not change stored data.

## 4. Functional requirements and user stories

### FR-01 — Add a transaction

**Story:** As a user, I want to record income or an expense so my financial records stay up to date.

**Acceptance criteria:**

- Add Transaction opens a form containing all five editable fields.
- Default type is Expense; default date is today in Africa/Cairo. Amount, description, and category begin empty.
- Changing type updates the category choices. Clear a selected category if it is invalid for the new type; Other may remain selected because both types allow it.
- Submitting invalid information shows a message next to each invalid field and preserves entered values.
- During submission, show progress and disable repeated submission through the form.
- A successful response closes the form, shows a success message, and refreshes the list and summary from saved data.
- If the new transaction does not match active filters, it remains saved even though it is absent from the filtered list.
- Cancel closes the form without saving.
- A rejected save retains the form values and shows the error. An uncertain network outcome must not be reported as success; ask the user to refresh and check before retrying.

### FR-02 — View transactions

**Story:** As a user, I want to view saved transactions so I can review my activity.

**Acceptance criteria:**

- On dashboard load, fetch persisted transactions and the overall summary.
- Each transaction shows type, amount with EGP, description, category, date, and Edit/Delete actions.
- Sort by transaction date descending; resolve ties by creation timestamp descending, then unique identifier in a consistent order.
- Display Income and Expense with readable labels; color alone must not communicate type.
- V1 shows all matching transactions without pagination.
- With no saved transactions, show an invitation to add the first transaction and zero-valued summary cards.
- Reloading the page or restarting the frontend/backend preserves records as long as the same persistent database is used.

### FR-03 — Edit a transaction

**Story:** As a user, I want to correct a transaction so the records and totals are accurate.

**Acceptance criteria:**

- Edit opens the form with the selected transaction's current values.
- Allow changes to type, amount, description, category, and date, applying the same validation as creation.
- Saving updates the existing record; it does not create a second transaction.
- A successful update refreshes the summary, transaction order, and filtered list. The transaction may disappear from the list if it no longer matches the filters.
- Cancel leaves the stored record unchanged.
- If the transaction no longer exists, show a clear message and reload the list.
- Failed or invalid updates do not show success. Keep the entered values available for correction or retry; handle uncertain network outcomes as in FR-01.

### FR-04 — Delete a transaction

**Story:** As a user, I want to remove a transaction I entered by mistake.

**Acceptance criteria:**

- Delete opens a confirmation showing enough details to identify the transaction, including description and amount.
- Cancel makes no database change.
- Confirm deletes only the selected transaction; prevent repeated confirmation while the request is pending.
- After confirmed success, refresh the list and summary and show a success message.
- A request failure shows an error without claiming deletion succeeded.
- If the record is already absent, explain that it is no longer available and reload the list.
- There is no undo or recycle bin in V1.

### FR-05 — Financial summary

**Story:** As a user, I want to see total income, total expenses, and balance so I understand my recorded finances.

**Acceptance criteria:**

- Show three summary cards: Total Income, Total Expenses, and Current Balance.
- Total Income is the sum of all Income amounts; Total Expenses is the sum of all Expense amounts.
- Current Balance equals Total Income minus Total Expenses; negative balances are valid.
- Summary totals use all saved transactions, independent of list filters. Label the section “All transactions” to make this clear.
- Display monetary values with two decimal places and the EGP currency label.
- With no records, all three values are 0.00 EGP.
- Refresh totals after each successful creation, update, or deletion, without requiring a page reload.
- A failed summary request shows an error or unavailable state, not invented zero totals.

### FR-06 — Filter transactions

**Story:** As a user, I want to filter by type and category so I can inspect relevant transactions.

**Acceptance criteria:**

- Provide a type selector with All, Income, and Expense, and a category selector with All and the allowed categories.
- Default both selectors to All.
- With type All, show the combined category list, with Other appearing once. Other matches both transaction types.
- With a selected type, offer only categories valid for that type.
- Changing type resets an incompatible category to All.
- Apply type and category filters together using AND logic.
- A Reset Filters action restores both selectors to All.
- Changing filters leaves summary cards unchanged.
- If no records match, show “No transactions match these filters” and a reset action. Keep this distinct from an empty database.
- Preserve active filters after successful add, edit, and delete actions. Filter persistence across page reloads is not required.

## 5. Interface and accessibility requirements

| ID | Requirement | Acceptance check |
| --- | --- | --- |
| UI-01 | One main dashboard | Summary, transaction list, filters, and Add Transaction are available from the main page. |
| UI-02 | Responsive layout | Main flows work at 360px, 768px, and 1440px viewport widths without page-level horizontal scrolling or hidden actions. |
| UI-03 | Keyboard access | Forms, filters, and actions can be reached and operated by keyboard; focus is visible. |
| UI-04 | Accessible forms | Every input has a label; validation messages are associated with their fields. |
| UI-05 | Dialog behavior | If dialogs are used, focus enters the dialog, stays inside while open, and returns to the trigger on close; Escape closes it when no submission is pending. |
| UI-06 | Loading states | Initial loads and pending changes show progress; pending duplicate actions are disabled. |
| UI-07 | Error recovery | Read failures show a Retry action. Mutation failures preserve useful context and explain the next step. |
| UI-08 | Safe text display | Descriptions render as text, including strings containing HTML-like characters. |
| UI-09 | Clear feedback | Success, error, type, and balance states use readable text as well as any visual styling. |

Use an English interface for V1. Arabic translation and right-to-left layout can be added later.

## 6. Data integrity and reliability requirements

- A successful mutation response means the database operation has completed successfully.
- Write operations must leave a complete valid record or make no change; partially written transactions are unacceptable.
- Do not calculate stored amounts or totals using floating-point arithmetic that introduces money rounding errors.
- The server must reject unknown types, invalid type/category pairs, malformed amounts, invalid dates, and oversized descriptions.
- Missing transaction identifiers must produce a clear not-found result rather than a successful update or deletion.
- After a successful write, if refreshing the dashboard fails, report “Saved, but the dashboard could not refresh” with a retry action. Do not imply that the write failed or encourage submitting it again.
- The application must distinguish empty data, loading, stale/unavailable data, and errors.
- Changing filters quickly must not allow an older response to overwrite the currently selected results.
- Repeated user clicks while an operation is pending must not trigger duplicate requests. Request-level idempotency is outside V1; do not automatically retry writes with uncertain outcomes.

## 7. Development and configuration requirements

- Use parameterized database queries or equivalent safe database access.
- Store configuration and secrets in environment variables; provide an example configuration containing placeholders only.
- Do not commit secrets or expose database credentials in browser code, documentation, or error messages.
- Return useful public error messages; keep internal database errors and stack traces server-side.
- Configure frontend/backend communication for documented development origins.
- Provide database setup instructions and a README with commands for running both applications.
- Keep the local V1 unauthenticated. Use sample data only for a hosted demo, and do not describe it as a private financial tracker.

## 8. Plugin workflow requirements

Plugins support building the project. End users do not need ChatGPT plugins to use the application.

| Stage | Planned plugin | Expected output |
| --- | --- | --- |
| Interface design | Figma | Dashboard and transaction form designs covering mobile, desktop, loading, empty, and error states. |
| Database setup | Supabase | PostgreSQL aligned with the database design; Express remains the application API. |
| Frontend deployment | Vercel | A working sample-data demo after local verification, with backend hosting decided separately. |
| Optional planning | Notion | Organized documentation/tasks that remain consistent with the Markdown files. |

Verify plugin account access when its stage begins. Provider plans, costs, and Express hosting remain setup decisions; this document does not select paid services or require creating external resources now.

## 9. V1 verification checklist

These checks will guide implementation verification; they have not been executed yet.

- [ ] Add Income of 1,000.00 EGP and Expense of 250.50 EGP. Confirm totals of 1,000.00 income, 250.50 expenses, and 749.50 balance.
- [ ] Edit the expense to 300.00 EGP. Confirm the balance becomes 700.00 EGP.
- [ ] Change that expense to Income with a valid income category. Confirm income is 1,300.00 EGP and expenses are 0.00 EGP.
- [ ] Cancel deletion and confirm no data changes; then confirm deletion and check the updated totals.
- [ ] Use amounts 0.10 and 0.20 EGP and confirm their total is exactly 0.30 EGP.
- [ ] Confirm expenses greater than income produce a negative balance.
- [ ] Reject blank descriptions, zero/negative amounts, excess decimal precision, invalid categories, impossible dates, and future dates in both the UI and direct API requests.
- [ ] Verify each filter, combined filters, reset, and unchanged all-transaction summary totals.
- [ ] Add or edit a transaction that does not match active filters; confirm correct storage and filtered-list behavior.
- [ ] Refresh the page and restart the frontend/backend; confirm records remain.
- [ ] Check initial empty data and a filtered list with no matches.
- [ ] Simulate read failures and rejected writes; confirm useful feedback, retained form values, and no false success messages.
- [ ] Verify missing-record edit/delete behavior and refresh failure after a successful save.
- [ ] Check keyboard operation and mobile/desktop layouts.

## 10. Next step

Finish T04 by pulling the existing remote schema into migration history and verifying Express database connectivity. Then proceed to T05 API foundations; do not add transaction routes during T04.
