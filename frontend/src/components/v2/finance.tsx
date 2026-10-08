import type { ReactNode } from "react";
import { Icon } from "./icon";
import {
  ArchivedState,
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
  StaleIndicator,
} from "./primitives";

export type MoneyKind = "income" | "expense" | "transfer" | "balance" | "debt";
// Presentation only: never parse a financial decimal through Number/parseFloat.
export function formatDecimal(value: string) {
  if (!/^-?(0|[1-9]\d*)(\.\d{1,2})?$/.test(value))
    throw new Error(
      "MoneyDisplay requires a plain decimal string with at most two decimals",
    );
  const negative = value.startsWith("-");
  const [integer, fraction = ""] = (negative ? value.slice(1) : value).split(
    ".",
  );
  return {
    magnitude: `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0")}`,
    negative,
    zero: integer === "0" && !/[1-9]/.test(fraction),
  };
}
export function MoneyDisplay({
  value,
  kind = "balance",
  currency = "EGP",
  size = "normal",
}: {
  value: string;
  kind?: MoneyKind;
  currency?: string;
  size?: "normal" | "large" | "hero";
}) {
  const money = formatDecimal(value);
  const semantic = money.zero
    ? "zero"
    : kind === "balance" && money.negative
      ? "negative"
      : kind;
  const sign = money.zero
    ? ""
    : money.negative || kind === "expense"
      ? "−"
      : kind === "income"
        ? "+"
        : "";
  const label =
    kind === "debt"
      ? money.negative
        ? "Credit balance"
        : "Amount owed"
      : kind === "transfer"
        ? "Transfer"
        : kind === "income"
          ? "Income"
          : kind === "expense"
            ? "Expense"
            : money.negative
              ? "Negative balance"
              : "Balance";
  return (
    <span className={`v2-money v2-money--${semantic} v2-money--${size}`}>
      <span className="v2-money-value">
        <span className="v2-sr-only">{label}: </span>
        {sign}
        {money.magnitude}
      </span>
      <span className="v2-currency">{currency}</span>
      {kind === "debt" || kind === "transfer" ? (
        <span className="v2-money-label">{label}</span>
      ) : null}
    </span>
  );
}
export function TypeBadge({
  type,
}: {
  type: "income" | "expense" | "transfer";
}) {
  return (
    <span className={`v2-badge v2-badge--${type}`}>
      <Icon
        name={type === "transfer" ? "arrow" : type === "income" ? "up" : "down"}
      />
      {type[0].toUpperCase() + type.slice(1)}
    </span>
  );
}
export function TransferBadge() {
  return <TypeBadge type="transfer" />;
}
export type AsyncState = "loaded" | "loading" | "stale" | "unavailable";
export function SummaryCard({
  label,
  value,
  kind = "balance",
  state = "loaded",
  emphasis = false,
  caption,
}: {
  label: string;
  value: string;
  kind?: MoneyKind;
  state?: AsyncState;
  emphasis?: boolean;
  caption?: string;
}) {
  return (
    <section
      className={`v2-metric ${emphasis ? "v2-metric--emphasis" : ""}`}
      aria-label={label}
      aria-busy={state === "loading"}
    >
      <h3>{label}</h3>
      {state === "loading" ? (
        <Skeleton variant="metric" />
      ) : state === "unavailable" ? (
        <p className="v2-secondary">Unavailable · refresh this section</p>
      ) : (
        <MoneyDisplay
          value={value}
          kind={kind}
          size={emphasis ? "hero" : "large"}
        />
      )}
      {caption ? <p className="v2-helper">{caption}</p> : null}
      {state === "stale" ? <StaleIndicator /> : null}
    </section>
  );
}
export type AccountType =
  "cash" | "bank" | "savings" | "credit_card" | "mobile_wallet" | "other";
const accountLabels: Record<AccountType, string> = {
  cash: "Cash",
  bank: "Bank",
  savings: "Savings",
  credit_card: "Credit card",
  mobile_wallet: "Mobile wallet",
  other: "Other",
};
export type AccountFixture = {
  id: string;
  name: string;
  type: AccountType;
  balance: string;
  archived?: boolean;
};
export function AccountTypeBadge({ type }: { type: AccountType }) {
  return <span className="v2-badge">{accountLabels[type]}</span>;
}
export function AccountCard({ account }: { account: AccountFixture }) {
  return (
    <article
      className={`v2-account ${account.type === "credit_card" ? "v2-account--debt" : ""}`}
    >
      <header>
        <AccountTypeBadge type={account.type} />
        {account.archived ? <ArchivedState /> : <span className="v2-badge">Active</span>}
      </header>
      <h3>{account.name}</h3>
      <MoneyDisplay
        value={account.balance}
        kind={account.type === "credit_card" ? "debt" : "balance"}
        size="large"
      />
      <p className="v2-helper">
        {account.type === "credit_card"
          ? "Payments use Transfer; avoid a second expense."
          : "Current balance · all history"}
      </p>
    </article>
  );
}
export function AccountRow({ account }: { account: AccountFixture }) {
  return (
    <div className="v2-data-row">
      <div>
        <strong>{account.name}</strong>
        <div className="v2-helper">
          {accountLabels[account.type]}
          {account.archived ? " · Archived" : " · Active"}
        </div>
      </div>
      <MoneyDisplay
        value={account.balance}
        kind={account.type === "credit_card" ? "debt" : "balance"}
      />
    </div>
  );
}

export type TransactionFixture = {
  id: string;
  date: string;
  description: string;
  account: string;
  category: string;
  type: "income" | "expense";
  amount: string;
  historical?: boolean;
  generated?: boolean;
};
function dateLabel(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}
export function TransactionActions({
  description,
  onEdit,
  onDelete,
}: {
  description: string;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="v2-actions">
      <Button
        variant="text"
        onClick={onEdit}
        aria-label={`Edit ${description}`}
      >
        Edit
      </Button>
      <Button
        variant="text"
        onClick={onDelete}
        aria-label={`Delete ${description}`}
      >
        Delete
      </Button>
    </div>
  );
}
export function TransactionTableHeader() {
  return (
    <thead>
      <tr>
        {[
          "Date",
          "Description",
          "Account",
          "Category",
          "Type",
          "Amount",
          "Actions",
        ].map((label) => (
          <th key={label} scope="col">
            {label}
          </th>
        ))}
      </tr>
    </thead>
  );
}
export function TransactionRow({
  transaction,
  onEdit,
  onDelete,
}: {
  transaction: TransactionFixture;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <tr>
      <td>
        <time dateTime={transaction.date}>{dateLabel(transaction.date)}</time>
      </td>
      <td>
        <strong>{transaction.description}</strong>
        {transaction.generated && <span className="v2-helper">Generated transaction</span>}
        {transaction.historical ? (
          <span className="v2-helper">
            Archived account/category · historical record
          </span>
        ) : null}
      </td>
      <td>{transaction.account}</td>
      <td>{transaction.category}</td>
      <td>
        <TypeBadge type={transaction.type} />
      </td>
      <td>
        <MoneyDisplay value={transaction.amount} kind={transaction.type} />
      </td>
      <td>
        <TransactionActions
          description={transaction.description}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </td>
    </tr>
  );
}
export function TransactionCard({
  transaction,
  onEdit,
  onDelete,
}: {
  transaction: TransactionFixture;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <article className="v2-transaction-card">
      <header>
        <TypeBadge type={transaction.type} />
        <time dateTime={transaction.date}>{dateLabel(transaction.date)}</time>
      </header>
      <h3>{transaction.description}</h3>
      {transaction.generated && <p className="v2-helper">Generated transaction</p>}
      <p className="v2-helper">
        {transaction.category} · {transaction.account}
        {transaction.historical ? " · Archived history" : ""}
      </p>
      <MoneyDisplay value={transaction.amount} kind={transaction.type} />
      <TransactionActions
        description={transaction.description}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </article>
  );
}
export function TransactionDateGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="v2-date-group">
      <h3 className="v2-eyebrow">{label}</h3>
      {children}
    </section>
  );
}

export type Frequency = "Daily" | "Weekly" | "Monthly" | "Yearly";
export type RecurringStatus = "Active" | "Paused" | "Archived";
export type RecurringFixture = {
  name: string;
  amount: string;
  type: "income" | "expense";
  frequency: Frequency;
  status: RecurringStatus;
  date: string | null;
  account: string;
};
export function FrequencyBadge({ frequency }: { frequency: Frequency }) {
  return <span className="v2-badge">{frequency}</span>;
}
export function RecurringStatusBadge({ status }: { status: RecurringStatus }) {
  return (
    <span
      className={`v2-badge ${status === "Active" ? "v2-badge--income" : ""}`}
    >
      {status}
    </span>
  );
}
export function UpcomingItem({ item }: { item: RecurringFixture }) {
  return (
    <div className="v2-upcoming">
      <span className="v2-timeline-point" aria-hidden="true" />
      <div>
        <time dateTime={item.date ?? undefined}>
          {item.date ? dateLabel(item.date) : "No upcoming date"}
        </time>
        <strong>{item.name}</strong>
        <span className="v2-helper">
          {item.account} · Expected {item.type}
        </span>
      </div>
      <MoneyDisplay value={item.amount} kind={item.type} />
    </div>
  );
}
export function RecurringRow({ item }: { item: RecurringFixture }) {
  return (
    <div className="v2-data-row">
      <div>
        <strong>{item.name}</strong>
        <p className="v2-helper">
          {item.account} ·{" "}
          {item.date
            ? `Next ${dateLabel(item.date)}`
            : "Next occurrence paused"}
        </p>
        <div className="v2-actions">
          <FrequencyBadge frequency={item.frequency} />
          <RecurringStatusBadge status={item.status} />
        </div>
      </div>
      <MoneyDisplay value={item.amount} kind={item.type} />
    </div>
  );
}
export function RecurringCard({ item }: { item: RecurringFixture }) {
  return (
    <article className="v2-recurring-card">
      <RecurringRow item={item} />
      <p className="v2-helper">
        Expected schedule · posted actuals remain separate
      </p>
    </article>
  );
}

export type BudgetState = "normal" | "near_limit" | "exceeded";
// Percentages are server/fixture decimal strings. The bar is visual geometry only.
function visualPercent(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return 0;
  return Math.min(100, Number(value));
}
export function BudgetStatus({ status }: { status: BudgetState }) {
  return (
    <span className={`v2-badge v2-budget-status--${status}`}>
      {status === "near_limit"
        ? "Near limit"
        : status === "exceeded"
          ? "Over budget"
          : "Within budget"}
    </span>
  );
}
export function BudgetProgress({
  percent,
  status,
  label,
}: {
  percent: string;
  status: BudgetState;
  label: string;
}) {
  return (
    <div
      className={`v2-progress v2-progress--${status}`}
      role="progressbar"
      aria-label={label}
      aria-valuenow={visualPercent(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${percent}% used`}
    >
      <span style={{ width: `${visualPercent(percent)}%` }} />
    </div>
  );
}
export function BudgetRow({
  name,
  allocated,
  spent,
  remaining,
  percent,
  status,
}: {
  name: string;
  allocated: string;
  spent: string;
  remaining: string;
  percent: string;
  status: BudgetState;
}) {
  return (
    <article className="v2-planning-row">
      <header>
        <h3>{name}</h3>
        <BudgetStatus status={status} />
      </header>
      <div className="v2-data-row v2-no-border">
        <div>
          <span className="v2-helper">Spent / allocated</span>
          <MoneyDisplay value={spent} />
          <span className="v2-helper">
            of {formatDecimal(allocated).magnitude} EGP
          </span>
        </div>
        <strong className="v2-tabular">{percent}%</strong>
      </div>
      <BudgetProgress
        percent={percent}
        status={status}
        label={`${name} budget usage`}
      />
      <p className="v2-helper">
        <MoneyDisplay value={remaining} />{" "}
        {remaining.startsWith("-") ? "over budget" : "remaining"}
      </p>
    </article>
  );
}
export function GoalProgress({
  percent,
  name,
}: {
  percent: string;
  name: string;
}) {
  return (
    <div
      className="v2-progress v2-progress--goal"
      role="progressbar"
      aria-label={`${name} savings progress`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={visualPercent(percent)}
      aria-valuetext={`${percent}% saved; manual progress`}
    >
      <span style={{ width: `${visualPercent(percent)}%` }} />
    </div>
  );
}
export function GoalCard({
  name,
  saved,
  target,
  percent,
  date,
  status = "Active",
  canComplete = false,
  onComplete,
}: {
  name: string;
  saved: string;
  target: string;
  percent: string;
  date?: string;
  status?: "Active" | "Completed" | "Archived";
  canComplete?: boolean;
  onComplete?: () => void;
}) {
  return (
    <article className="v2-goal">
      <header>
        <h3>{name}</h3>
        <span className="v2-badge">{status}</span>
      </header>
      <MoneyDisplay value={saved} size="large" />
      <p className="v2-helper">
        of {formatDecimal(target).magnitude} EGP · manually maintained
      </p>
      <GoalProgress name={name} percent={percent} />
      <div className="v2-data-row v2-no-border">
        <strong className="v2-tabular">{percent}% saved</strong>
        {date ? (
          <time dateTime={date}>Target {dateLabel(date)}</time>
        ) : (
          <span>No target date</span>
        )}
      </div>
      {canComplete && status === "Active" && onComplete ? (
        <Button variant="secondary" onClick={onComplete}>
          Mark complete
        </Button>
      ) : null}
      <p className="v2-helper">
        Linked account is reference only. Completion is explicit.
      </p>
    </article>
  );
}
export function ChartShell({
  title,
  period,
  legend,
  summary,
  state = "loaded",
  children,
  onRetry,
}: {
  title: string;
  period: string;
  legend?: { label: string; tone: "income" | "expense" | "transfer" }[];
  summary: string;
  state?: "loaded" | "loading" | "empty" | "error";
  children?: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <section className="v2-chart" aria-label={title}>
      <header>
        <h3>{title}</h3>
        <p className="v2-helper">{period}</p>
      </header>
      {legend ? (
        <ul className="v2-legend">
          {legend.map((item) => (
            <li key={item.label} className={`v2-legend--${item.tone}`}>
              <span aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}
      {state === "loading" ? (
        <Skeleton variant="chart" />
      ) : state === "error" ? (
        <ErrorState onRetry={onRetry} />
      ) : state === "empty" ? (
        <EmptyState
          title="No activity in this period"
          description="Choose another range or record your first transaction."
        />
      ) : (
        <div className="v2-chart-canvas">
          {children ?? (
            <p>
              Chart plot reserved for T04+
              <br />
              <span className="v2-helper">
                Accessible summary stays available below.
              </span>
            </p>
          )}
        </div>
      )}
      <div className="v2-chart-summary">
        <strong>Text summary</strong>
        <p>{summary}</p>
      </div>
    </section>
  );
}
