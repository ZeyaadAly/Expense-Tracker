"use client";

import { useState, type ReactNode } from "react";
import { PageHeader, V2AppShell } from "../app-shell";
import { Icon } from "../icon";
import {
  AccountCard,
  AccountRow,
  BudgetRow,
  ChartShell,
  FrequencyBadge,
  GoalCard,
  MoneyDisplay,
  RecurringCard,
  RecurringRow,
  SummaryCard,
  TransactionCard,
  TransactionDateGroup,
  TransactionRow,
  TransactionTableHeader,
  UpcomingItem,
} from "../finance";
import {
  AddAccountForm,
  ArchiveAccountConfirmation,
  BudgetForm,
  CategoryForm,
  CategoryRow,
  ClearFilters,
  CompleteGoalConfirmation,
  DateRangeField,
  EditAccountForm,
  FilterChip,
  FilterSelect,
  GoalForm,
  MobileFilterSheet,
  ProfileForm,
  RecurringForm,
  SearchBar,
  SettingsNav,
  SettingsSection,
  TransferForm,
  TransferSummary,
} from "../forms";
import {
  Button,
  Checkbox,
  ConfirmationDialog,
  DateInput,
  DialogShell,
  Drawer,
  EmptyState,
  ErrorState,
  FeedbackBanner,
  FormField,
  MobileFullScreenDialog,
  MoneyInput,
  Pagination,
  PasswordInput,
  SegmentedControl,
  Select,
  Skeleton,
  StaleIndicator,
  Textarea,
  TextInput,
  Toggle,
  type DialogState,
} from "../primitives";
import {
  accounts,
  longAccount,
  longCategory,
  recurring,
  stressError,
  transactions,
} from "./fixtures";

type Overlay =
  | "confirmation"
  | "form"
  | "drawer"
  | "mobile"
  | "filters"
  | "archive"
  | "goal"
  | null;
const palette = [
  "canvas",
  "surface",
  "surface-secondary",
  "sidebar",
  "text-primary",
  "text-secondary",
  "border",
  "primary",
  "income",
  "expense",
  "warning",
  "transfer",
];
function Specimen({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="v2-specimen" id={id}>
      <header className="v2-specimen-header">
        <span className="v2-eyebrow">{number}</span>
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  );
}

export function DesignSystemShowcase() {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [dialogState, setDialogState] = useState<DialogState>("default");
  const [feedback, setFeedback] = useState("");
  const [segment, setSegment] = useState("Expense");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [page, setPage] = useState(0);
  const [filterState, setFilterState] = useState("idle");
  const [settings, setSettings] = useState("Profile");
  const [chartState, setChartState] = useState<
    "loaded" | "loading" | "empty" | "error"
  >("loaded");
  const [goalComplete, setGoalComplete] = useState(false);
  const filtered = transactions.filter(
    (t) =>
      (filter === "All" || t.type === filter.toLowerCase()) &&
      `${t.description} ${t.account} ${t.category}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const announce = () =>
    setFeedback(
      "Fixture interaction previewed. No API request was made; nothing was saved.",
    );
  const close = () => setOverlay(null);
  const finish = () => {
    announce();
    close();
  };
  const formContent = (
    <>
      <fieldset className="v2-form-group" disabled={dialogState === "pending"}>
        <TransferForm onSubmit={finish} />
      </fieldset>
      <p className="v2-helper">
        Escape closes; Tab stays inside; focus returns to the trigger.
      </p>
    </>
  );
  const filterControls = (
    <>
      <FilterSelect
        label="Transaction type"
        options={["All", "Income", "Expense"]}
        value={filter}
        onChange={(v) => {
          setFilter(v);
          setPage(0);
        }}
      />
      <DateRangeField />
      <Checkbox label="Include archived history" defaultChecked />
    </>
  );

  return (
    <V2AppShell>
      <div id="showcase-top">
        <PageHeader
          title="A considered financial workspace"
          eyebrow="T03 / Foundations & components"
          description="Browser design system · static fixtures · no API or authentication"
          actions={
            <Button
              variant="secondary"
              onClick={() => {
                setDialogState("default");
                setOverlay("form");
              }}
            >
              <Icon name="plus" />
              Preview a form
            </Button>
          }
        />
        <h2 className="v2-sr-only">Financial metric specimens</h2>
        <div className="v2-asymmetric" id="metrics">
          <div>
            <SummaryCard
              label="Net Position"
              value="21200.00"
              emphasis
              caption="Current all-history net worth · archived accounts included"
            />
            <div className="v2-metric-strip">
              <SummaryCard label="Income" value="15000.00" kind="income" />
              <SummaryCard label="Expenses" value="8240.00" kind="expense" />
              <SummaryCard label="Net savings" value="6760.00" />
            </div>
            <p className="v2-specimen-note">
              Metric specimens, not a dashboard prototype. Cash flow and account
              balances use distinct periods.
            </p>
          </div>
          <aside
            className="v2-showcase-rail"
            aria-label="Account row specimens"
          >
            <h3>Account rail</h3>
            <AccountRow account={accounts[1]} />
            <AccountRow account={accounts[3]} />
            <AccountRow account={accounts[6]} />
          </aside>
        </div>
        {feedback ? (
          <FeedbackBanner tone="success" title="Preview feedback">
            {feedback}
            <Button variant="text" onClick={() => setFeedback("")}>
              Dismiss feedback
            </Button>
          </FeedbackBanner>
        ) : null}

        <Specimen id="foundations" number="01" title="Foundations">
          <div className="v2-token-grid">
            {palette.map((token) => (
              <div className="v2-token" key={token}>
                <i style={{ background: `var(--v2-${token})` }} />
                <div>
                  <strong>{token}</strong>
                  <code>--v2-{token}</code>
                </div>
              </div>
            ))}
          </div>
          <div className="v2-typography">
            <p style={{ fontSize: "var(--v2-title)", letterSpacing: "-.03em" }}>
              Page title / 30
            </p>
            <h3>Section hierarchy / 21 · 16</h3>
            <p>Body / 15 · Dense information with room to breathe.</p>
            <p className="v2-secondary">
              Secondary / 13 · Periods, context and supporting detail.
            </p>
            <p className="v2-eyebrow">Caption / 12 · LABEL</p>
            <MoneyDisplay value="999999999.99" size="large" />
          </div>
          <p className="v2-specimen-note">
            4–64px spacing scale · 6 / 8 / 12 / 16px radii · borders before
            shadows · local sans-serif, no external font request.
          </p>
        </Specimen>

        <Specimen id="controls" number="02" title="Controls with intent">
          <div className="v2-button-states">
            {(["primary", "secondary", "danger", "ghost", "text"] as const).map(
              (variant) => (
                <div className="v2-actions" key={variant}>
                  <Button variant={variant} onClick={announce}>
                    {variant[0].toUpperCase() + variant.slice(1)}
                  </Button>
                  <Button variant={variant} disabled>
                    Disabled
                  </Button>
                  <Button variant={variant} loading>
                    Processing
                  </Button>
                </div>
              ),
            )}
          </div>
          <p className="v2-specimen-note">
            Hover, pressed and focus-visible are real CSS states. Every button
            has a 44px minimum target.
          </p>
          <div className="v2-specimen-grid" style={{ marginTop: 24 }}>
            <div className="v2-form">
              <FormField
                label="Description"
                id="ds-text"
                hint="Visible labels remain when fields are filled."
              >
                <TextInput
                  id="ds-text"
                  defaultValue="Monthly essentials"
                  aria-describedby="ds-text-hint"
                />
              </FormField>
              <FormField
                label="Money"
                id="ds-money"
                hint="Plain decimal input; display separators are not input values."
              >
                <MoneyInput
                  id="ds-money"
                  defaultValue="999999999.99"
                  aria-describedby="ds-money-hint"
                />
              </FormField>
              <FormField label="Password" id="ds-password">
                <PasswordInput
                  id="ds-password"
                  autoComplete="new-password"
                  defaultValue="fixture-password"
                />
              </FormField>
              <FormField label="Date" id="ds-date">
                <DateInput id="ds-date" defaultValue="2026-10-06" />
              </FormField>
              <FormField label="Account" id="ds-select">
                <Select id="ds-select">
                  <option>{longAccount}</option>
                  <option>Main Account</option>
                </Select>
              </FormField>
            </div>
            <div className="v2-form">
              <FormField
                label="Invalid description"
                id="ds-invalid"
                error={stressError}
              >
                <Textarea
                  id="ds-invalid"
                  aria-invalid="true"
                  aria-describedby="ds-invalid-error"
                  defaultValue="Preserved draft"
                  rows={3}
                />
              </FormField>
              <FormField
                label="Disabled preference"
                id="ds-disabled"
                hint="Fixed for P0."
              >
                <TextInput
                  id="ds-disabled"
                  defaultValue="Africa/Cairo"
                  disabled
                  aria-describedby="ds-disabled-hint"
                />
              </FormField>
              <Checkbox label="Include archived history" defaultChecked />
              <Checkbox label="Unavailable option" disabled />
              <Toggle label="Preview compact density" />
              <SegmentedControl
                label="Transaction type"
                value={segment}
                options={["Income", "Expense"]}
                onChange={setSegment}
              />
            </div>
          </div>
        </Specimen>

        <Specimen id="money" number="03" title="Exact values. Clear meaning.">
          <div className="v2-specimen-grid">
            {(
              [
                { value: "15000.00", kind: "income" },
                { value: "850.00", kind: "expense" },
                { value: "2000.00", kind: "transfer" },
                { value: "25480.00", kind: "balance" },
                { value: "-250.00", kind: "balance" },
                { value: "2400.00", kind: "debt" },
                { value: "-150.00", kind: "debt" },
                { value: "0.00", kind: "balance" },
              ] as const
            ).map((item, i) => (
              <div className="v2-data-row" key={i}>
                <span className="v2-badge">
                  {item.kind === "debt"
                    ? "Credit card"
                    : item.kind[0].toUpperCase() + item.kind.slice(1)}
                </span>
                <MoneyDisplay {...item} size="large" />
              </div>
            ))}
          </div>
          <div className="v2-specimen-grid" style={{ marginTop: 24 }}>
            <SummaryCard
              label="Last loaded balance"
              value="21200.00"
              state="stale"
            />
            <SummaryCard
              label="Unavailable metric"
              value="0.00"
              state="unavailable"
            />
            <SummaryCard label="Loading metric" value="0.00" state="loading" />
          </div>
        </Specimen>

        <Specimen
          id="accounts"
          number="04"
          title="Accounts, assets & obligations"
        >
          <div className="v2-account-grid">
            {accounts.map((account) => (
              <AccountCard key={account.id} account={account} />
            ))}
          </div>
          <div className="v2-actions" style={{ marginTop: 20 }}>
            <Button variant="secondary" onClick={() => setOverlay("archive")}>
              Preview archive confirmation
            </Button>
          </div>
          <details style={{ marginTop: 24 }}>
            <summary>Account form specimens</summary>
            <div className="v2-specimen-grid" style={{ marginTop: 16 }}>
              <AddAccountForm onSubmit={announce} />
              <EditAccountForm onSubmit={announce} />
            </div>
          </details>
        </Specimen>

        <Specimen id="ledger" number="05" title="The financial ledger">
          <FilterSelect
            label="Filter specimen state"
            options={["idle", "loading", "error"]}
            value={filterState}
            onChange={setFilterState}
          />
          <SearchBar
            pending={filterState === "loading"}
            value={search}
            onChange={setSearch}
            onSearch={() => {
              setQuery(search.trim());
              setPage(0);
            }}
          />
          {filterState === "error" ? (
            <ErrorState
              title="Filters could not refresh"
              description="Last loaded fixture rows remain visible."
              onRetry={() => setFilterState("idle")}
            />
          ) : null}
          <div className="v2-filter-desktop v2-filters">{filterControls}</div>
          <div className="v2-actions" style={{ marginTop: 16 }}>
            <Button
              variant="secondary"
              className="v2-mobile-filter-trigger"
              onClick={() => setOverlay("filters")}
            >
              Filters
            </Button>
            {filter !== "All" ? (
              <FilterChip label={filter} onRemove={() => setFilter("All")} />
            ) : null}
            {query ? (
              <FilterChip
                label={query}
                onRemove={() => {
                  setQuery("");
                  setSearch("");
                }}
              />
            ) : null}
            <ClearFilters
              onClick={() => {
                setSearch("");
                setQuery("");
                setFilter("All");
                setPage(0);
              }}
            />
          </div>
          {filtered.length ? (
            <>
              <div className="v2-ledger-desktop">
                <table className="v2-ledger">
                  <caption>06 OCT · desktop ledger specimens</caption>
                  <TransactionTableHeader />
                  <tbody>
                    {filtered.map((transaction) => (
                      <TransactionRow
                        key={transaction.id}
                        transaction={transaction}
                        onEdit={announce}
                        onDelete={() => {
                          setDialogState("default");
                          setOverlay("confirmation");
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="v2-ledger-mobile">
                <TransactionDateGroup label="06 OCT / Activity">
                  {filtered.map((transaction) => (
                    <TransactionCard
                      key={transaction.id}
                      transaction={transaction}
                      onEdit={announce}
                      onDelete={() => {
                        setDialogState("default");
                        setOverlay("confirmation");
                      }}
                    />
                  ))}
                </TransactionDateGroup>
              </div>
            </>
          ) : (
            <EmptyState
              title="No matching transactions"
              description="Try a different description, account or category."
            />
          )}
          <Pagination
            pending={filterState === "loading"}
            hasPrevious={page > 0}
            hasNext={page === 0}
            onPrevious={() => setPage(0)}
            onNext={() => setPage(1)}
          />
          <p className="v2-helper">
            Pagination control specimen: frontend keeps Previous history; no
            cursor values or invented page totals. The fixture rows stay the
            same.
          </p>
        </Specimen>

        <Specimen id="transfer" number="06" title="Movement, not spending">
          <div className="v2-asymmetric">
            <TransferForm onSubmit={announce} />
            <TransferSummary
              from="CIB Bank"
              to="Everyday card"
              amount="2000.00"
            />
          </div>
        </Specimen>

        <Specimen
          id="recurring"
          number="07"
          title="Recurring finance as a schedule"
        >
          <div className="v2-asymmetric">
            <div>
              <h3>Upcoming / expected</h3>
              {recurring.slice(0, 2).map((item) => (
                <UpcomingItem key={item.name} item={item} />
              ))}
              <p className="v2-helper">
                Daily posting · expected amounts never merge into posted
                actuals.
              </p>
            </div>
            <div>
              <RecurringCard item={recurring[2]} />
              <RecurringRow item={recurring[3]} />
              <div className="v2-actions" style={{ marginTop: 16 }}>
                {(["Daily", "Weekly", "Monthly", "Yearly"] as const).map(
                  (frequency) => (
                    <FrequencyBadge key={frequency} frequency={frequency} />
                  ),
                )}
              </div>
            </div>
          </div>
          <details style={{ marginTop: 24 }}>
            <summary>Recurring form specimen</summary>
            <RecurringForm onSubmit={announce} />
          </details>
        </Specimen>

        <Specimen
          id="planning"
          number="08"
          title="Budgets with useful boundaries"
        >
          <div className="v2-specimen-grid">
            <div>
              <BudgetRow
                name="Food"
                allocated="3000.00"
                spent="2260.00"
                remaining="740.00"
                percent="75.33"
                status="normal"
              />
              <BudgetRow
                name="Transport"
                allocated="1500.00"
                spent="1380.00"
                remaining="120.00"
                percent="92.00"
                status="near_limit"
              />
              <BudgetRow
                name={longCategory}
                allocated="3000.00"
                spent="3240.00"
                remaining="-240.00"
                percent="108.00"
                status="exceeded"
              />
            </div>
            <BudgetForm onSubmit={announce} />
          </div>
        </Specimen>

        <Specimen id="goals" number="09" title="A quieter kind of progress">
          <div className="v2-specimen-grid">
            <div>
              <GoalCard
                name="Emergency reserve"
                saved="32000.00"
                target="60000.00"
                percent="53.33"
                date="2027-03-01"
              />
              <GoalCard
                name="Certification fund"
                canComplete
                saved="10500.00"
                target="10000.00"
                percent="105.00"
                status={goalComplete ? "Completed" : "Active"}
                onComplete={() => setOverlay("goal")}
              />
            </div>
            <GoalForm onSubmit={announce} />
          </div>
        </Specimen>

        <Specimen
          id="charts"
          number="10"
          title="Chart shells with accessible context"
        >
          <div className="v2-actions">
            <FilterSelect
              label="Chart specimen state"
              options={["loaded", "loading", "empty", "error"]}
              value={chartState}
              onChange={(v) => setChartState(v as typeof chartState)}
            />
          </div>
          <ChartShell
            title="Income vs expenses"
            period="01–06 Oct 2026 · month-to-date"
            legend={[
              { label: "Income", tone: "income" },
              { label: "Expenses", tone: "expense" },
            ]}
            summary="Fixture income: 15,000.00 EGP. Expenses: 8,240.00 EGP. Net savings: 6,760.00 EGP. Savings rate: 45.07%."
            state={chartState}
            onRetry={() => setChartState("loaded")}
          />
          <details>
            <summary>Other chart container specimens</summary>
            <div className="v2-specimen-grid">
              {[
                "Spending by category",
                "Income sources",
                "Savings trend",
                "Account activity",
                "Recurring commitments",
              ].map((title) => (
                <ChartShell
                  key={title}
                  title={title}
                  period="October 2026 · fixture scope"
                  summary={
                    title === "Recurring commitments"
                      ? "Projected anchored occurrences only; no weekly/yearly monthly normalization. Actuals remain separate."
                      : "Text/table equivalent reserved here; use exact backend strings when integrated."
                  }
                  state="empty"
                />
              ))}
            </div>
          </details>
        </Specimen>

        <Specimen
          id="settings"
          number="11"
          title="Settings & category ownership"
        >
          <SettingsNav active={settings} onChange={setSettings} />
          {settings === "Profile" ? (
            <SettingsSection title="Profile form specimen">
              <ProfileForm onSubmit={announce} />
            </SettingsSection>
          ) : settings === "Categories" ? (
            <div className="v2-specimen-grid">
              <div>
                <CategoryRow name="Salary" system />
                <CategoryRow name={longCategory} onEdit={announce} />
                <CategoryRow
                  name="Archived learning"
                  archived
                  onEdit={announce}
                />
              </div>
              <CategoryForm onSubmit={announce} />
            </div>
          ) : (
            <SettingsSection title="Security specimen">
              <p className="v2-secondary">
                No real session or authentication connection exists in T03.
              </p>
              <Button variant="secondary" onClick={announce}>
                Preview password recovery action
              </Button>
            </SettingsSection>
          )}
        </Specimen>

        <Specimen id="dialogs" number="12" title="Dialogs, drawers & recovery">
          <div className="v2-actions">
            <FilterSelect
              label="Dialog state"
              options={["default", "pending", "error", "uncertain"]}
              value={dialogState}
              onChange={(v) => setDialogState(v as DialogState)}
            />
            <Button
              variant="secondary"
              onClick={() => setOverlay("confirmation")}
            >
              Open confirmation
            </Button>
            <Button variant="secondary" onClick={() => setOverlay("drawer")}>
              Open drawer
            </Button>
            <Button variant="secondary" onClick={() => setOverlay("mobile")}>
              Open mobile dialog
            </Button>
          </div>
          <p className="v2-specimen-note">
            Native modal dialog provides inert background. Pending actions
            prevent Escape/close; use the local “Finish pending preview” control
            to exit. Error and uncertain states preserve context.
          </p>
        </Specimen>

        <Specimen id="states" number="13" title="Feedback without ambiguity">
          <div className="v2-specimen-grid">
            <div>
              <FeedbackBanner tone="success" title="Change confirmed">
                Refresh authoritative values after real integration.
              </FeedbackBanner>
              <FeedbackBanner tone="warning" title="Check the latest records">
                The outcome is uncertain; avoid a duplicate submission.
              </FeedbackBanner>
              <FeedbackBanner tone="error" title="Check the highlighted fields">
                {stressError}
              </FeedbackBanner>
              <FeedbackBanner tone="info" title="Verification required">
                Fixture message only. Check your email before signing in.
              </FeedbackBanner>
              <ErrorState onRetry={announce} />
              <StaleIndicator />
            </div>
            <div>
              <EmptyState
                title="No accounts yet"
                description="Create your first account to begin tracking money."
                action={
                  <Button variant="secondary" onClick={announce}>
                    Add account
                  </Button>
                }
              />
              {[
                "No transactions yet",
                "No recurring items",
                "No budgets this month",
                "No savings goals",
                "Insufficient analytics data",
              ].map((title) => (
                <details key={title}>
                  <summary>{title}</summary>
                  <EmptyState
                    title={title}
                    description="This reusable empty state offers a scoped next step."
                  />
                </details>
              ))}
            </div>
          </div>
          <div className="v2-specimen-grid" style={{ marginTop: 24 }}>
            {(
              [
                "metric",
                "account",
                "transaction",
                "chart",
                "budget",
                "goal",
              ] as const
            ).map((variant) => (
              <div key={variant}>
                <p className="v2-state-caption">{variant} skeleton</p>
                <Skeleton variant={variant} />
              </div>
            ))}
          </div>
        </Specimen>
        <footer className="v2-showcase-foot">
          T03 component review only. All data is fictional and resets on reload.
          No P1 notifications, reports, projections or suggestions. T04 full
          pages have not started.
        </footer>
      </div>
      {overlay === "confirmation" ? (
        <ConfirmationDialog
          title="Delete fixture transaction?"
          description="Hard deletion removes this transaction's balance effect. A generated occurrence marker would remain posted to prevent replay."
          state={dialogState}
          onClose={close}
          onConfirm={finish}
          confirmLabel="Delete transaction"
          pendingPreview={finish}
        />
      ) : null}
      {overlay === "form" ? (
        <DialogShell
          title="Transfer form specimen"
          description="Move money between accounts; no request will be sent."
          state={dialogState}
          onClose={close}
        >
          {formContent}
        </DialogShell>
      ) : null}
      {overlay === "drawer" ? (
        <Drawer
          title="Drawer specimen"
          description="Scoped content and focus management."
          state={dialogState}
          onClose={close}
        >
          {formContent}
          {dialogState === "pending" ? (
            <Button onClick={finish}>Finish pending preview</Button>
          ) : null}
        </Drawer>
      ) : null}
      {overlay === "mobile" ? (
        <MobileFullScreenDialog
          title="Mobile form specimen"
          description="Full screen below 768px; centered dialog above."
          state={dialogState}
          onClose={close}
        >
          {formContent}
          {dialogState === "pending" ? (
            <Button onClick={finish}>Finish pending preview</Button>
          ) : null}
        </MobileFullScreenDialog>
      ) : null}
      {overlay === "filters" ? (
        <MobileFilterSheet onClose={close}>{filterControls}</MobileFilterSheet>
      ) : null}
      {overlay === "archive" ? (
        <ArchiveAccountConfirmation onClose={close} onConfirm={finish} />
      ) : null}
      {overlay === "goal" ? (
        <CompleteGoalConfirmation
          onClose={close}
          onConfirm={() => {
            setGoalComplete(true);
            close();
          }}
        />
      ) : null}
    </V2AppShell>
  );
}
