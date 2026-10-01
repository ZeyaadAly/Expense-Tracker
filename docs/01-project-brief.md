# Expense Tracker — Project Brief

**Version:** 1.0  
**Date:** 2026-10-01  
**Stage:** Planning  
**Owner:** Zeyad Aly Elghazaly

## 1. Project idea

Build a simple web application for recording income and expenses, viewing transactions, and understanding the current balance.

This is a small first full-stack project. Follow a lightweight BMAD-style workflow: define the idea, write requirements, design the database and API, break the work into small tasks, then implement and verify each task.

## 2. Problem and goal

Recording transactions in scattered notes makes it difficult to see where money goes. The app will keep transactions in one place and calculate income, expenses, and balance automatically.

The learning goal is to build and understand the complete flow: a user submits a form, the frontend calls an Express API, the API validates and stores data in PostgreSQL, and the frontend displays the saved result.

## 3. Intended user

V1 is for one person tracking their own money in a local development environment. There are no accounts or separate user workspaces yet. Authentication and access controls must be considered before hosting real personal financial data.

## 4. V1 scope

| Feature | Expected behavior |
| --- | --- |
| Add transaction | Enter type, amount, description, category, and date, then save. |
| View transactions | Display saved transactions with their details, newest transaction dates first. |
| Edit transaction | Update an existing transaction and refresh the displayed results. |
| Delete transaction | Ask for confirmation, then remove the selected transaction. |
| Financial summary | Display total income, total expenses, and current balance. |
| Filter transactions | Filter by type and category; allow both filters together and provide a reset option. |
| Responsive layout | Make the main flow usable on mobile and desktop. |

### Transaction information

- **Type:** Income or Expense.
- **Amount:** A positive monetary value with at most two decimal places; type determines whether it adds to or subtracts from the balance.
- **Description:** A short explanation of the transaction.
- **Category:** A choice from a fixed list suitable for the selected type.
- **Date:** The date the transaction occurred.

### Initial assumptions

- Use one currency throughout V1. Start with EGP; currency conversion is excluded.
- Income categories: Salary, Freelance, Gift, Other.
- Expense categories: Food, Transport, Shopping, Bills, Entertainment, Other.
- Summary cards represent all saved transactions. Filters affect the transaction list only, with this behavior made clear in the interface.
- Balance = total income − total expenses. A negative balance is allowed.
- PostgreSQL stores transactions so they remain available after refreshing the page or restarting the app.
- Use exact monetary storage and calculations; avoid rounding errors from floating-point values.

These are starting decisions and can be refined in the requirements document.

## 5. Main user flow

1. Open the dashboard and see the financial summary and transaction list.
2. Select Add Transaction and complete the form.
3. Submit the form; see validation feedback if required information is invalid.
4. After a successful save, see the transaction and updated summary.
5. Filter the list, edit a transaction, or confirm a deletion when needed.

## 6. Technology stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| Frontend | Next.js + TypeScript | Build the dashboard and transaction forms. |
| Styling | Tailwind CSS | Create a consistent, responsive interface. |
| Backend | Express.js + TypeScript | Provide the REST API and enforce validation and business rules. |
| Database | PostgreSQL | Persist transaction data. |
| Version control | Git + GitHub | Track changes and document progress. |

The frontend calls Express over HTTP. Express communicates with PostgreSQL. Database credentials stay on the server.

## 7. Plugin-assisted workflow

Use ChatGPT Work plugins during the relevant project stages. Plugins assist development; they do not add extra features to the Expense Tracker itself.

| Plugin | Planned role | When to use it |
| --- | --- | --- |
| Figma | Design a simple dashboard and transaction form, then reference the design during frontend implementation. | After requirements are clear. |
| Supabase | Candidate host for PostgreSQL; assist with database setup and inspection. Express continues to own the application API. | During database setup, if selected. |
| Vercel | Help configure and deploy the Next.js frontend. | After the app works locally. |
| Notion | Optional place to organize documentation and implementation tasks. Markdown files remain the project documentation source. | When a shared planning workspace is useful. |

### Plugin decisions

- Figma, Supabase, Vercel, and Notion skills are available in this workspace. Verify account access and the required capabilities when each stage begins.
- Keep Next.js, Express, PostgreSQL, Tailwind, and TypeScript as the agreed stack.
- If Supabase is selected, use its PostgreSQL database through Express; Supabase Auth and direct browser database access are outside V1 scope.
- Decide Express hosting separately during deployment planning. Do not assume frontend hosting also provides the required backend runtime.
- Confirm hosting limitations and costs during setup. No paid services are selected by this brief.
- Use sample transactions for a hosted demo until appropriate access controls exist.

## 8. Outside V1 scope

- Sign-up, login, and multiple users.
- Charts and analytics beyond the three summary totals.
- Budgets, recurring transactions, and payment reminders.
- Bank integrations, payment processing, and receipt uploads.
- AI features, exports, and multiple currencies.
- Custom category management and a separate mobile application.

## 9. V1 completion criteria

- A valid transaction can be created, viewed, edited, and deleted through the interface.
- Saved data remains after a page refresh and application restart.
- Income, expense, and balance totals are correct and update after successful changes.
- Type and category filters work individually and together, and can be reset.
- Invalid submissions show useful messages and do not write invalid data.
- Failed API requests show a clear error without falsely reporting success.
- The interface includes loading and empty states and works on mobile and desktop.
- A README explains how to configure and run the frontend, backend, and database locally without committing secrets.

## 10. Documentation roadmap

Create these files one at a time as decisions become clear:

1. `01-project-brief.md` — idea, scope, stack, and plugin plan.
2. `02-requirements.md` — user stories, validation rules, and acceptance criteria.
3. `03-database-design.md` — tables, fields, constraints, and monetary representation.
4. `04-api-design.md` — routes, request/response formats, and error behavior.
5. `05-implementation-plan.md` — small implementation tasks and verification steps.

Design the interface in Figma after requirements, then use it while implementing the frontend. Database and hosting plugins enter the workflow when their respective tasks begin.

## 11. Next step

Write `02-requirements.md`, turning the V1 features into small user stories with clear acceptance criteria. Resolve exact field limits and category rules there before database and API design.
