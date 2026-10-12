"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { PageHeader } from "../../components/v2/app-shell";
import {
  AccountCard,
  AccountRow,
  BudgetRow,
  GoalCard,
  MoneyDisplay,
  RecurringRow,
  SummaryCard,
  TransactionCard,
  TransactionRow,
  TransactionTableHeader,
  TypeBadge,
  UpcomingItem,
  type AccountType,
  type TransactionFixture,
} from "../../components/v2/finance";
import {
  Button,
  ConfirmationDialog,
  DateInput,
  EmptyState,
  ErrorState,
  FeedbackBanner,
  FormField,
  SegmentedControl,
  Select,
  Skeleton,
  StaleIndicator,
  TextInput,
} from "../../components/v2/primitives";
import {
  ClearFilters,
  FilterChip,
  FilterSelect,
  SearchBar,
} from "../../components/v2/forms";
import { usePrototype } from "./prototype-context";
import { PrototypeShell } from "./shell";
import { Editor, type FieldSpec } from "./editor";
import {
  analytics,
  type Budget,
  type Goal,
  type Schedule,
  type Transfer,
} from "./fixtures";
import { cents, decimal, percent, validMoney } from "./money";
import { CategoryChart, FlowChart } from "./charts";
import { periodBounds, periodRows, totals } from "./periods";

export type AppRoute =
  | "dashboard"
  | "transactions"
  | "accounts"
  | "recurring"
  | "analytics"
  | "budgets"
  | "goals"
  | "settings";
const titles = {
  dashboard: "Your money, in perspective",
  transactions: "Transactions",
  accounts: "Accounts",
  recurring: "Recurring",
  analytics: "A closer look",
  budgets: "Budgets",
  goals: "Goals",
  settings: "Settings",
};
const descriptions = {
  dashboard: "A clear view of today. A thoughtful plan for tomorrow.",
  transactions: "Every movement, with its place in the story.",
  accounts: "Where your money lives — and what you owe.",
  recurring: "A rhythm for the money that repeats.",
  analytics: "Understand the patterns behind your numbers.",
  budgets: "Give your spending a little direction.",
  goals: "Make steady progress toward what matters.",
  settings: "Your workspace, your details.",
};
type Edit = {
  title: string;
  fields: FieldSpec[];
  initial: Record<string, string>;
  save: (values: Record<string, string>) => void;
  transfer?: boolean;
  validate?: (values: Record<string, string>) => Record<string, string>;
};
const field = (
  name: string,
  label: string,
  kind?: FieldSpec["kind"],
  options?: string[],
  required = true,
): FieldSpec => ({ name, label, kind, options, required });
function Panel({
  title,
  children,
  link,
}: {
  title: string;
  children: ReactNode;
  link?: string;
}) {
  return (
    <section className="p4-panel">
      <header className="p4-section-heading">
        <h2>{title}</h2>
        {link && (
          <Link className="v2-button v2-button--text" href={link}>
            View all
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}
function budgetProps(item: Budget) {
  const used = percent(item.spent, item.allocated);
  return {
    name: item.name,
    allocated: item.allocated,
    spent: item.spent,
    remaining: decimal(cents(item.allocated) - cents(item.spent)),
    percent: used,
    status:
      cents(item.spent) > cents(item.allocated)
        ? ("exceeded" as const)
        : Number(used) >= Number(item.threshold)
          ? ("near_limit" as const)
          : ("normal" as const),
  };
}
function Ledger({
  rows,
  edit,
  remove,
}: {
  rows: TransactionFixture[];
  edit: (row: TransactionFixture) => void;
  remove: (id: string) => void;
}) {
  return (
    <>
      <div className="v2-ledger-desktop">
        <table className="v2-ledger">
          <caption>Recorded income and expenses</caption>
          <TransactionTableHeader />
          <tbody>
            {rows.map((row) => (
              <TransactionRow
                key={row.id}
                transaction={row}
                onEdit={() => edit(row)}
                onDelete={() => remove(row.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="v2-ledger-mobile">
        {rows.map((row) => (
          <TransactionCard
            key={row.id}
            transaction={row}
            onEdit={() => edit(row)}
            onDelete={() => remove(row.id)}
          />
        ))}
      </div>
    </>
  );
}
export function PrototypePage({
  route,
  initialState = "populated",
}: {
  route: AppRoute;
  initialState?: string;
}) {
  const p = usePrototype();
  const [state, setState] = useState(initialState);
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<Edit | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    action: () => void;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    type: "All",
    account: "All",
    category: "All",
    from: "",
    to: "",
  });
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState("All");
  const [range, setRange] = useState("30 days");
  const [month, setMonth] = useState("2026-10");
  const [custom, setCustom] = useState({
    from: "2026-10-01",
    to: "2026-10-06",
  });
  const activeAccounts = p.accounts
    .filter((a) => !a.archived)
    .map((a) => a.name);
  const activeCategories = (type: string) =>
    p.categories
      .filter((c) => !c.archived && (c.kind === type || c.kind === "both"))
      .map((c) => c.name);
  const id = () => `local-${crypto.randomUUID()}`;
  function saved() {
    setNotice("Changes applied to this preview. Nothing is persisted.");
    setState("populated");
  }
  function adjustAccounts(changes: { account: string; amount: bigint }[]) {
    p.setLockedAccounts((previous) =>
      Array.from(
        new Set([
          ...previous,
          ...p.accounts
            .filter((account) =>
              changes.some((change) => change.account === account.name),
            )
            .map((account) => account.id),
        ]),
      ),
    );
    p.setAccounts((items) =>
      items.map((account) => {
        const delta = changes
          .filter((change) => change.account === account.name)
          .reduce((sum, change) => sum + change.amount, BigInt(0));
        return {
          ...account,
          balance: decimal(
            cents(account.balance) +
              delta * (account.type === "credit_card" ? -BigInt(1) : BigInt(1)),
          ),
        };
      }),
    );
  }
  function ask(title: string, description: string, action: () => void) {
    setConfirm({ title, description, action });
  }
  function editTransaction(row?: TransactionFixture) {
    setEditor({
      title: row ? "Edit transaction" : "Add transaction",
      fields: [
        field("type", "Type", "select", ["expense", "income"]),
        field("account", "Account", "select", activeAccounts),
        field("amount", "Amount", "money"),
        field(
          "category",
          "Category",
          "select",
          p.categories.filter((c) => !c.archived).map((c) => c.name),
        ),
        field("date", "Date", "date"),
        field("description", "Description", "textarea"),
      ],
      initial: row
        ? {
            type: row.type,
            account: row.account,
            amount: row.amount,
            category: row.category,
            date: row.date,
            description: row.description,
          }
        : {
            type: "expense",
            account: activeAccounts[0],
            amount: "",
            category: "Food",
            date: "2026-10-06",
            description: "",
          },
      validate: (v) => {
        const errors: Record<string, string> = {};
        if (!activeCategories(v.type).includes(v.category))
          errors.category =
            "Choose an active category matching this transaction type.";
        if (v.date > "2026-10-06")
          errors.date = "Recorded transactions cannot be in the future.";
        return errors;
      },
      save: (v) => {
        const next: TransactionFixture = {
          id: row?.id ?? id(),
          type: v.type as "income" | "expense",
          account: v.account,
          amount: decimal(cents(v.amount)),
          category: v.category,
          date: v.date,
          description: v.description,
        };
        adjustAccounts([
          ...(row
            ? [
                {
                  account: row.account,
                  amount:
                    cents(row.amount) *
                    (row.type === "income" ? -BigInt(1) : BigInt(1)),
                },
              ]
            : []),
          {
            account: next.account,
            amount:
              cents(next.amount) *
              (next.type === "income" ? BigInt(1) : -BigInt(1)),
          },
        ]);
        p.setTransactions((items) =>
          (row
            ? items.map((item) => (item.id === row.id ? next : item))
            : [next, ...items]
          ).sort(
            (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
          ),
        );
        saved();
      },
    });
  }
  function deleteTransaction(key: string) {
    ask(
      "Delete transaction?",
      "This removes this recorded entry from the preview ledger. This action cannot be undone within the preview.",
      () => {
        const row = p.transactions.find((t) => t.id === key);
        if (row)
          adjustAccounts([
            {
              account: row.account,
              amount:
                cents(row.amount) *
                (row.type === "income" ? -BigInt(1) : BigInt(1)),
            },
          ]);
        p.setTransactions((items) => items.filter((item) => item.id !== key));
        saved();
      },
    );
  }
  function editAccount(row?: (typeof p.accounts)[number]) {
    const locked = !!row && p.lockedAccounts.includes(row.id);
    setEditor({
      title: row ? "Edit account" : "Add account",
      fields: [
        field("name", "Account name"),
        {
          ...field(
            "type",
            "Account type",
            "select",
            [
              "cash",
              "bank",
              "savings",
              "credit_card",
              "mobile_wallet",
              "other",
            ].filter(
              (type) =>
                !locked ||
                row?.type === "credit_card" ||
                type !== "credit_card",
            ),
          ),
          disabled: locked && row?.type === "credit_card",
          hint: locked
            ? "Switching between asset and credit-card semantics locks after posted activity."
            : undefined,
        },
        {
          ...field(
            "balance",
            locked ? "Opening balance (locked)" : "Opening balance",
            "money",
          ),
          signed: true,
          zero: true,
          disabled: locked,
          hint: "Positive card balance means debt. Opening balance locks permanently after first posted activity.",
        },
      ],
      initial: row
        ? {
            name: row.name,
            type: row.type,
            balance: p.openingBalances[row.id] ?? row.balance,
          }
        : { name: "", type: "bank", balance: "0.00" },
      validate: (v) => {
        const errors: Record<string, string> = {};
        if (
          p.accounts.some(
            (a) =>
              a.id !== row?.id &&
              a.name.toLowerCase() === v.name.trim().toLowerCase(),
          )
        )
          errors.name = "Choose a unique account name.";
        return errors;
      },
      save: (v) => {
        const nextId = row?.id ?? id();
        if (!locked)
          p.setOpeningBalances((previous) => ({
            ...previous,
            [nextId]: decimal(cents(v.balance)),
          }));
        p.setAccounts((items) =>
          row
            ? items.map((item) =>
                item.id === row.id
                  ? {
                      ...item,
                      name: v.name,
                      type: v.type as AccountType,
                      ...(!locked
                        ? { balance: decimal(cents(v.balance)) }
                        : {}),
                    }
                  : item,
              )
            : [
                ...items,
                {
                  id: nextId,
                  name: v.name,
                  type: v.type as AccountType,
                  balance: decimal(cents(v.balance)),
                },
              ],
        );
        if (row && row.name !== v.name) {
          p.setGoals((items) =>
            items.map((item) =>
              item.linkedAccount === row.name
                ? { ...item, linkedAccount: v.name }
                : item,
            ),
          );
          p.setTransactions((items) =>
            items.map((item) =>
              item.account === row.name ? { ...item, account: v.name } : item,
            ),
          );
          p.setRecurring((items) =>
            items.map((item) =>
              item.account === row.name ? { ...item, account: v.name } : item,
            ),
          );
          p.setTransfers((items) =>
            items.map((item) => ({
              ...item,
              source: item.source === row.name ? v.name : item.source,
              destination:
                item.destination === row.name ? v.name : item.destination,
            })),
          );
        }
        saved();
      },
    });
  }
  function editTransfer(row?: Transfer) {
    setEditor({
      title: row ? "Edit transfer" : "New transfer",
      transfer: true,
      fields: [
        field("source", "From account", "select", activeAccounts),
        field("destination", "To account", "select", activeAccounts),
        field("amount", "Amount", "money"),
        field("date", "Date", "date"),
        field(
          "description",
          "Description (optional)",
          "textarea",
          undefined,
          false,
        ),
      ],
      initial: row
        ? { ...row }
        : {
            source: activeAccounts[1] ?? activeAccounts[0],
            destination: activeAccounts[0],
            amount: "",
            date: "2026-10-06",
            description: "",
          },
      validate: (v): Record<string, string> =>
        v.date > "2026-10-06"
          ? { date: "Transfer date cannot be in the future." }
          : {},
      save: (v) => {
        const next: Transfer = {
          id: row?.id ?? id(),
          source: v.source,
          destination: v.destination,
          amount: decimal(cents(v.amount)),
          date: v.date,
          description: v.description,
        };
        adjustAccounts([
          ...(row
            ? [
                { account: row.source, amount: cents(row.amount) },
                { account: row.destination, amount: -cents(row.amount) },
              ]
            : []),
          { account: next.source, amount: -cents(next.amount) },
          { account: next.destination, amount: cents(next.amount) },
        ]);
        p.setTransfers((items) =>
          row
            ? items.map((item) => (item.id === row.id ? next : item))
            : [next, ...items],
        );
        saved();
      },
    });
  }
  function editRecurring(row?: Schedule) {
    setEditor({
      title: row ? "Edit recurring" : "Add recurring",
      fields: [
        field("name", "Description"),
        field("type", "Type", "select", ["expense", "income"]),
        field("account", "Account", "select", activeAccounts),
        field(
          "category",
          "Category",
          "select",
          p.categories.filter((c) => !c.archived).map((c) => c.name),
        ),
        field("amount", "Amount", "money"),
        field("frequency", "Frequency", "select", [
          "Daily",
          "Weekly",
          "Monthly",
          "Yearly",
        ]),
        {
          ...field("start", "Start date", "date"),
          hint: "Past starts do not import history. Month-end dates clamp without drift; February 29 uses February 28 in non-leap years.",
        },
        field("end", "End date (optional)", "date", undefined, false),
      ],
      initial: row
        ? {
            name: row.name,
            type: row.type,
            account: row.account,
            category: row.category,
            amount: row.amount,
            frequency: row.frequency,
            start: row.start,
            end: row.end,
          }
        : {
            name: "",
            type: "expense",
            account: activeAccounts[0],
            category: "Bills",
            amount: "",
            frequency: "Monthly",
            start: "2026-10-07",
            end: "",
          },
      validate: (v): Record<string, string> =>
        activeCategories(v.type).includes(v.category)
          ? {}
          : { category: "Choose a category matching this schedule type." },
      save: (v) => {
        const next: Schedule = {
          id: row?.id ?? id(),
          name: v.name,
          type: v.type as Schedule["type"],
          account: v.account,
          category: v.category,
          amount: decimal(cents(v.amount)),
          frequency: v.frequency as Schedule["frequency"],
          status: row?.status ?? "Active",
          date:
            (row?.status ?? "Active") === "Active"
              ? v.start < "2026-10-07"
                ? "2026-10-07"
                : v.start
              : null,
          start: v.start,
          end: v.end,
        };
        p.setRecurring((items) =>
          row
            ? items.map((item) => (item.id === row.id ? next : item))
            : [...items, next],
        );
        saved();
      },
    });
  }
  function editBudget(row?: Budget) {
    setEditor({
      title: row ? "Edit budget" : "Create budget",
      fields: [
        field(
          "name",
          "Expense category",
          "select",
          activeCategories("expense"),
        ),
        field("allocated", "Allocated amount", "money"),
        field("month", "Month", "month"),
        {
          ...field("threshold", "Warning threshold (%)"),
          hint: "Whole number from 1 to 100.",
        },
      ],
      initial: row
        ? {
            name: row.name,
            allocated: row.allocated,
            month: row.month,
            threshold: row.threshold,
          }
        : { name: "Food", allocated: "", month, threshold: "90" },
      validate: (v) => {
        const errors: Record<string, string> = {};
        if (!/^(100|[1-9]\d?)$/.test(v.threshold))
          errors.threshold = "Enter a whole number from 1 to 100.";
        if (
          p.budgets.some(
            (b) => b.id !== row?.id && b.name === v.name && b.month === v.month,
          )
        )
          errors.name = "This category already has a budget for this month.";
        return errors;
      },
      save: (v) => {
        const next: Budget = {
          id: row?.id ?? id(),
          name: v.name,
          allocated: decimal(cents(v.allocated)),
          spent: row?.spent ?? "0.00",
          month: v.month,
          threshold: v.threshold,
        };
        p.setBudgets((items) =>
          row
            ? items.map((item) => (item.id === row.id ? next : item))
            : [...items, next],
        );
        saved();
      },
    });
  }
  function editGoal(row?: Goal) {
    if (row?.status === "Archived") return;
    setEditor({
      title: row ? "Edit goal" : "Create goal",
      fields: [
        field("name", "Goal name"),
        ...(row?.status === "Completed"
          ? [field("status", "Goal status", "select", ["Completed", "Active"])]
          : []),
        field("target", "Target amount", "money"),
        { ...field("saved", "Saved amount (manual)", "money"), zero: true },
        field("date", "Target date (optional)", "date", undefined, false),
        {
          ...field(
            "linkedAccount",
            "Linked account (optional)",
            "select",
            ["None", ...activeAccounts],
            false,
          ),
          hint: "Reference only. No money moves when you update or complete a goal.",
        },
      ],
      initial: row
        ? { ...row }
        : {
            name: "",
            target: "",
            saved: "0.00",
            date: "",
            linkedAccount: "None",
          },
      validate: (v) => {
        const errors: Record<string, string> = {};
        if (
          (v.status ?? row?.status) === "Completed" &&
          validMoney(v.saved, false, true) &&
          validMoney(v.target) &&
          cents(v.saved) < cents(v.target)
        )
          errors.saved =
            "A completed goal must meet its target. Change Goal status to Active to reopen it before reducing progress.";
        return errors;
      },
      save: (v) => {
        const next: Goal = {
          id: row?.id ?? id(),
          name: v.name,
          target: decimal(cents(v.target)),
          saved: decimal(cents(v.saved)),
          date: v.date,
          linkedAccount: v.linkedAccount,
          status: (v.status ?? row?.status ?? "Active") as Goal["status"],
        };
        p.setGoals((items) =>
          row
            ? items.map((item) => (item.id === row.id ? next : item))
            : [...items, next],
        );
        saved();
      },
    });
  }
  function editCategory(row?: (typeof p.categories)[number]) {
    setEditor({
      title: row ? "Edit category" : "Add custom category",
      fields: [
        field("name", "Category name"),
        {
          ...field("kind", "Applies to", "select", [
            "expense",
            "income",
            "both",
          ]),
          disabled: !!row,
          hint: "Applicability locks once referenced.",
        },
      ],
      initial: row
        ? { name: row.name, kind: row.kind }
        : { name: "", kind: "expense" },
      save: (v) => {
        p.setCategories((items) =>
          row
            ? items.map((item) =>
                item.id === row.id ? { ...item, name: v.name } : item,
              )
            : [
                ...items,
                {
                  id: id(),
                  name: v.name,
                  kind: v.kind,
                  system: false,
                  archived: false,
                },
              ],
        );
        if (row) {
          p.setTransactions((items) =>
            items.map((item) =>
              item.category === row.name ? { ...item, category: v.name } : item,
            ),
          );
          p.setRecurring((items) =>
            items.map((item) =>
              item.category === row.name ? { ...item, category: v.name } : item,
            ),
          );
          p.setBudgets((items) =>
            items.map((item) =>
              item.name === row.name ? { ...item, name: v.name } : item,
            ),
          );
        }
        saved();
      },
    });
  }
  const primary =
    route === "transactions"
      ? () => editTransaction()
      : route === "accounts"
        ? () => editAccount()
        : route === "recurring"
          ? () => editRecurring()
          : route === "budgets"
            ? () => editBudget()
            : route === "goals"
              ? () => editGoal()
              : undefined;
  const primaryLabel = {
    transactions: "Add transaction",
    accounts: "Add account",
    recurring: "Add recurring",
    budgets: "Create budget",
    goals: "Create goal",
  };
  const net = decimal(
    p.accounts.reduce(
      (sum, a) =>
        sum +
        cents(a.balance) * (a.type === "credit_card" ? -BigInt(1) : BigInt(1)),
      BigInt(0),
    ),
  );
  const stress = state === "stress";
  const visibleBudgets = p.budgets.map((budget) => ({
    ...budget,
    spent: decimal(
      p.transactions
        .filter(
          (t) =>
            t.type === "expense" &&
            t.category === budget.name &&
            t.date.startsWith(budget.month),
        )
        .reduce((sum, t) => sum + cents(t.amount), BigInt(0)),
    ),
  }));
  const bounds = periodBounds(range, custom);
  const rangeInvalid = !bounds.from || !bounds.to || bounds.from > bounds.to;
  const difference =
    Math.floor((Date.parse(bounds.to) - Date.parse(bounds.from)) / 86400000) +
    1;
  const periodDays =
    Number.isFinite(difference) && difference > 0 ? difference : 1;
  const selectedRows = periodRows(p.transactions, bounds).filter(
    (t) => state !== "zero-income" || t.type !== "income",
  );
  const selectedTotals = totals(selectedRows);
  const chartData = analytics
    .filter((row) => {
      const monthIndex =
        ["May", "Jun", "Jul", "Aug", "Sep", "Oct"].indexOf(row.label) + 5;
      const first = `2026-${String(monthIndex).padStart(2, "0")}-01`;
      const last = `2026-${String(monthIndex).padStart(2, "0")}-31`;
      return first <= bounds.to && last >= bounds.from;
    })
    .map((row) => {
      const monthIndex =
        ["May", "Jun", "Jul", "Aug", "Sep", "Oct"].indexOf(row.label) + 5;
      return {
        label: row.label,
        ...totals(
          selectedRows.filter((t) =>
            t.date.startsWith(`2026-${String(monthIndex).padStart(2, "0")}`),
          ),
        ),
      };
    });
  const stressRows: TransactionFixture[] = stress
    ? [
        {
          ...p.transactions[0],
          id: "stress",
          amount: "999999999.99",
          description:
            "Professional certification resources, exam fees and study materials for the upcoming financial planning programme; includes course access and reference books. "
              .repeat(2)
              .slice(0, 200),
          category: "Professional Education and Certification Expenses",
          account: p.accounts[2].name,
        },
      ]
    : [];
  const changeFilter = (key: keyof typeof filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(0);
  };
  const filtered = [...stressRows, ...p.transactions].filter(
    (t) =>
      (!search ||
        `${t.description} ${t.account} ${t.category}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (filters.type === "All" || t.type === filters.type) &&
      (filters.account === "All" || t.account === filters.account) &&
      (filters.category === "All" || t.category === filters.category) &&
      (!filters.from || t.date >= filters.from) &&
      (!filters.to || t.date <= filters.to),
  );
  const lastPage = Math.max(0, Math.ceil(filtered.length / 25) - 1);
  const currentPage = Math.min(page, lastPage);
  const rows = filtered
    .slice(currentPage * 25, (currentPage + 1) * 25)
    .map((row) => ({
      ...row,
      historical:
        p.accounts.some((a) => a.name === row.account && a.archived) ||
        p.categories.some((c) => c.name === row.category && c.archived),
    }));
  let content: ReactNode;
  if (route === "dashboard")
    content = (
      <>
        <div className="p4-overview">
          <div>
            <p className="v2-eyebrow">Financial position · all history</p>
            <SummaryCard
              label="Net position"
              value={stress ? "-999999999.99" : net}
              emphasis
              caption="Assets less card debt · archived balances included"
            />
            <div className="v2-metric-strip">
              <SummaryCard
                label="Income"
                value={selectedTotals.income}
                kind="income"
              />
              <SummaryCard
                label="Expenses"
                value={stress ? "28000.00" : selectedTotals.expense}
                kind="expense"
              />
              <SummaryCard
                label="Net savings"
                value={stress ? "-8000.00" : selectedTotals.savings}
              />
            </div>
            <p className="v2-helper">
              Posted actuals · {bounds.from} — {bounds.to} · selected period:{" "}
              {range}
            </p>
            <FlowChart data={chartData} />
          </div>
          <Panel title="Your accounts" link="/v2/accounts">
            {p.accounts
              .filter((a) => !a.archived)
              .map((a) => (
                <AccountRow
                  key={a.id}
                  account={
                    stress && a.type === "credit_card"
                      ? { ...a, balance: "-150.00" }
                      : a
                  }
                />
              ))}
          </Panel>
        </div>
        <div className="p4-columns">
          <Panel title="Recent activity" link="/v2/transactions">
            {[...stressRows, ...p.transactions].slice(0, 4).map((t) => (
              <div className="v2-data-row" key={t.id}>
                <div>
                  <strong>{t.description}</strong>
                  <p className="v2-helper">
                    {t.date} · {t.category}
                  </p>
                </div>
                <MoneyDisplay value={t.amount} kind={t.type} />
              </div>
            ))}
          </Panel>
          <Panel title="Coming up" link="/v2/recurring">
            {p.recurring
              .filter((r) => r.status === "Active")
              .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
              .slice(0, 3)
              .map((r) => (
                <UpcomingItem key={r.id} item={r} />
              ))}
            <p className="v2-helper">
              Expected activity · not included in posted actuals
            </p>
          </Panel>
          <Panel title="Budget watch" link="/v2/budgets">
            {visibleBudgets.slice(0, 2).map((b) => (
              <BudgetRow key={b.id} {...budgetProps(b)} />
            ))}
          </Panel>
          <Panel title="Looking ahead" link="/v2/goals">
            {p.goals.slice(0, 1).map((g) => (
              <GoalCard
                key={g.id}
                {...g}
                percent={percent(g.saved, g.target)}
              />
            ))}
          </Panel>
        </div>
      </>
    );
  else if (route === "transactions")
    content = (
      <>
        <section className="p4-panel">
          <SearchBar
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(0);
            }}
            onSearch={() => setPage(0)}
          />
          <div className="p4-filters">
            <FilterSelect
              label="Type"
              value={filters.type}
              options={["All", "income", "expense", "transfer"]}
              onChange={(v) => changeFilter("type", v)}
            />
            <FilterSelect
              label="Account"
              value={filters.account}
              options={["All", ...p.accounts.map((a) => a.name)]}
              onChange={(v) => changeFilter("account", v)}
            />
            <FilterSelect
              label="Category"
              value={filters.category}
              options={["All", ...p.categories.map((c) => c.name)]}
              onChange={(v) => changeFilter("category", v)}
            />
            {["from", "to"].map((key) => (
              <FormField
                key={key}
                id={`filter-${key}`}
                label={key === "from" ? "From date" : "To date"}
              >
                <DateInput
                  id={`filter-${key}`}
                  value={filters[key as "from" | "to"]}
                  onChange={(e) =>
                    changeFilter(key as "from" | "to", e.target.value)
                  }
                />
              </FormField>
            ))}
          </div>
          <div className="v2-actions">
            {search && (
              <FilterChip label={search} onRemove={() => setSearch("")} />
            )}{" "}
            {Object.entries(filters)
              .filter(([, v]) => v && v !== "All")
              .map(([key, v]) => (
                <FilterChip
                  key={key}
                  label={`${key}: ${v}`}
                  onRemove={() =>
                    changeFilter(
                      key as keyof typeof filters,
                      key === "from" || key === "to" ? "" : "All",
                    )
                  }
                />
              ))}
            <ClearFilters
              onClick={() => {
                setSearch("");
                setFilters({
                  type: "All",
                  account: "All",
                  category: "All",
                  from: "",
                  to: "",
                });
                setPage(0);
              }}
            />
          </div>
          {filters.from && filters.to && filters.from > filters.to && (
            <FeedbackBanner tone="error" title="Choose a valid date range">
              From date must be on or before To date.
            </FeedbackBanner>
          )}
        </section>
        {filters.type !== "transfer" &&
          (rows.length ? (
            <Ledger
              rows={rows}
              edit={editTransaction}
              remove={deleteTransaction}
            />
          ) : (
            <EmptyState
              title="No matching transactions"
              description="Try a different search or clear your filters."
            />
          ))}
        <nav className="v2-pagination" aria-label="Transaction pagination">
          <span className="v2-helper">
            {filtered.length} records · 25 per page · page {currentPage + 1}
          </span>
          <div className="v2-actions">
            <Button
              variant="secondary"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={currentPage >= lastPage}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </Button>
          </div>
        </nav>
        {(filters.type === "All" || filters.type === "transfer") && (
          <Panel title="Transfers">
            <p className="v2-helper">
              Neutral movements · excluded from income and expenses
            </p>
            {p.transfers
              .filter(
                (t) =>
                  (!search ||
                    `${t.description} ${t.source} ${t.destination}`
                      .toLowerCase()
                      .includes(search.toLowerCase())) &&
                  (filters.account === "All" ||
                    t.source === filters.account ||
                    t.destination === filters.account) &&
                  filters.category === "All" &&
                  (!filters.from || t.date >= filters.from) &&
                  (!filters.to || t.date <= filters.to),
              )
              .map((t) => (
                <div className="v2-data-row" key={t.id}>
                  <div>
                    <TypeBadge type="transfer" />
                    <strong>{t.description}</strong>
                    <p className="v2-helper">
                      {t.source} → {t.destination} · {t.date}
                    </p>
                  </div>
                  <MoneyDisplay value={t.amount} kind="transfer" />
                  <Button variant="text" onClick={() => editTransfer(t)}>
                    Edit
                  </Button>
                </div>
              ))}
          </Panel>
        )}
      </>
    );
  else if (route === "accounts")
    content = (
      <>
        <SummaryCard
          label="Net position"
          value={stress ? "-999999999.99" : net}
          emphasis
          caption="Positive credit-card balance is debt; negative card balance is a credit."
        />
        <SegmentedControl
          label="Account status"
          options={["All", "Active", "Archived"]}
          value={tab}
          onChange={setTab}
        />
        <div className="p4-account-grid">
          {p.accounts
            .filter(
              (a) =>
                tab === "All" ||
                (tab === "Archived" ? a.archived : !a.archived),
            )
            .map((a) => (
              <div key={a.id}>
                <AccountCard
                  account={
                    stress
                      ? {
                          ...a,
                          balance:
                            a.type === "credit_card"
                              ? "-150.00"
                              : "999999999.99",
                        }
                      : a
                  }
                />
                <div className="v2-actions">
                  <Button variant="text" onClick={() => editAccount(a)}>
                    Edit
                  </Button>
                  <Button
                    variant="text"
                    onClick={() => {
                      if (a.archived) {
                        p.setAccounts((items) =>
                          items.map((item) =>
                            item.id === a.id
                              ? { ...item, archived: false }
                              : item,
                          ),
                        );
                        saved();
                      } else {
                        const count = p.recurring.filter(
                          (r) => r.account === a.name && r.status === "Active",
                        ).length;
                        ask(
                          `Archive ${a.name}?`,
                          `${count} active recurring schedules will pause. Historical balances stay included. Restore will not resume schedules automatically.`,
                          () => {
                            p.setAccounts((items) =>
                              items.map((item) =>
                                item.id === a.id
                                  ? { ...item, archived: true }
                                  : item,
                              ),
                            );
                            p.setRecurring((items) =>
                              items.map((r) =>
                                r.account === a.name && r.status === "Active"
                                  ? { ...r, status: "Paused", date: null }
                                  : r,
                              ),
                            );
                            saved();
                          },
                        );
                      }
                    }}
                  >
                    {a.archived ? "Restore" : "Archive"}
                  </Button>
                </div>
              </div>
            ))}
        </div>
        <Panel title="Transfers">
          <Button
            onClick={() => editTransfer()}
            disabled={activeAccounts.length < 2}
          >
            New transfer
          </Button>
          {p.transfers.map((t) => (
            <div className="v2-data-row" key={t.id}>
              <div>
                <strong>{t.description || "Transfer"}</strong>
                <p className="v2-helper">
                  {t.source} → {t.destination} · {t.date}
                </p>
              </div>
              <MoneyDisplay value={t.amount} kind="transfer" />
              <div className="v2-actions">
                <Button variant="text" onClick={() => editTransfer(t)}>
                  Edit
                </Button>
                <Button
                  variant="text"
                  onClick={() =>
                    ask(
                      "Delete transfer?",
                      "Remove this neutral account movement from the preview.",
                      () => {
                        adjustAccounts([
                          { account: t.source, amount: cents(t.amount) },
                          { account: t.destination, amount: -cents(t.amount) },
                        ]);
                        p.setTransfers((items) =>
                          items.filter((item) => item.id !== t.id),
                        );
                        saved();
                      },
                    )
                  }
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </Panel>
      </>
    );
  else if (route === "recurring")
    content = (
      <>
        <div className="v2-metric-strip">
          <SummaryCard
            label="Expected income · next occurrences"
            value={decimal(
              p.recurring
                .filter((r) => r.status === "Active" && r.type === "income")
                .reduce((s, r) => s + cents(r.amount), BigInt(0)),
            )}
            kind="income"
          />
          <SummaryCard
            label="Expected expenses · next occurrences"
            value={decimal(
              p.recurring
                .filter((r) => r.status === "Active" && r.type === "expense")
                .reduce((s, r) => s + cents(r.amount), BigInt(0)),
            )}
            kind="expense"
          />
        </div>
        <p className="v2-helper">
          Forecast only · each next occurrence counted once · no transactions
          generated in this prototype
        </p>
        <SegmentedControl
          label="Schedule view"
          options={["All", "Income", "Expenses", "Upcoming"]}
          value={tab}
          onChange={setTab}
        />
        <div className="p4-overview">
          <Panel title="Schedules">
            {p.recurring
              .filter((r) =>
                tab === "Income"
                  ? r.type === "income"
                  : tab === "Expenses"
                    ? r.type === "expense"
                    : tab === "Upcoming"
                      ? r.status === "Active"
                      : true,
              )
              .map((r) => (
                <article key={r.id}>
                  <RecurringRow item={r} />
                  <div className="v2-actions">
                    <Button
                      variant="text"
                      disabled={r.status === "Archived"}
                      onClick={() => editRecurring(r)}
                    >
                      Edit
                    </Button>
                    {r.status !== "Archived" && (
                      <>
                        <Button
                          variant="text"
                          disabled={
                            r.status === "Paused" &&
                            (!activeAccounts.includes(r.account) ||
                              !activeCategories(r.type).includes(r.category))
                          }
                          onClick={() =>
                            ask(
                              r.status === "Active"
                                ? "Pause schedule?"
                                : "Resume schedule?",
                              "Existing posted transactions remain unchanged. Resume uses a future preview occurrence.",
                              () => {
                                p.setRecurring((items) =>
                                  items.map((item) =>
                                    item.id === r.id
                                      ? {
                                          ...item,
                                          status:
                                            r.status === "Active"
                                              ? "Paused"
                                              : "Active",
                                          date:
                                            r.status === "Active"
                                              ? null
                                              : "2026-10-07",
                                        }
                                      : item,
                                  ),
                                );
                                saved();
                              },
                            )
                          }
                        >
                          {r.status === "Active" ? "Pause" : "Resume"}
                        </Button>
                        <Button
                          variant="text"
                          onClick={() =>
                            ask(
                              "Archive schedule?",
                              "Future occurrences stop. Existing transactions stay in your history.",
                              () => {
                                p.setRecurring((items) =>
                                  items.map((item) =>
                                    item.id === r.id
                                      ? {
                                          ...item,
                                          status: "Archived",
                                          date: null,
                                        }
                                      : item,
                                  ),
                                );
                                saved();
                              },
                            )
                          }
                        >
                          Archive
                        </Button>
                      </>
                    )}
                  </div>
                </article>
              ))}
          </Panel>
          <Panel title="Upcoming occurrences">
            {p.recurring
              .filter((r) => r.status === "Active")
              .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
              .map((r) => (
                <UpcomingItem key={r.id} item={r} />
              ))}
            <p className="v2-helper">
              Paused and archived schedules have no upcoming occurrence.
            </p>
          </Panel>
        </div>
      </>
    );
  else if (route === "analytics") {
    const data = chartData;
    const income = selectedTotals.income;
    const expenses = selectedTotals.expense;
    const saving = decimal(cents(income) - cents(expenses));
    content = (
      <>
        <section className="p4-narrative">
          <p className="v2-eyebrow">The story of your money · {range}</p>
          <h2>
            {state === "zero-income" || cents(income) === BigInt(0)
              ? "Savings rate is not applicable without income."
              : cents(saving) < BigInt(0)
                ? `Spending exceeded income by ${decimal(-cents(saving))} EGP in this period.`
                : `You kept ${percent(saving, income)}% of your income in this period.`}
          </h2>
          <p>Small decisions add up. Transfers are excluded from this view.</p>
        </section>
        <div className="v2-metric-strip">
          <SummaryCard
            label="Income"
            value={state === "zero-income" ? "0.00" : income}
            kind="income"
          />
          <SummaryCard label="Expenses" value={expenses} kind="expense" />
          <SummaryCard
            label="Net savings"
            value={state === "zero-income" ? decimal(-cents(expenses)) : saving}
          />
        </div>
        <div className="p4-columns">
          <FlowChart data={data} />
          <CategoryChart
            rows={selectedRows}
            period={`${bounds.from} — ${bounds.to}`}
          />
          <FlowChart data={data} savings title="Savings trend" />
          <Panel title="Account activity">
            <p className="v2-helper">Posted records · transfers excluded</p>
            {p.accounts
              .filter((a) => !a.archived)
              .map((a) => (
                <div className="v2-data-row" key={a.id}>
                  <strong>{a.name}</strong>
                  <span>
                    {selectedRows.filter((t) => t.account === a.name).length}{" "}
                    recorded entries
                  </span>
                </div>
              ))}
          </Panel>
          <Panel title="Recurring commitments">
            <p className="v2-helper">
              Expected next occurrences · separate from posted actuals
            </p>
            {p.recurring
              .filter((r) => r.status === "Active")
              .map((r) => (
                <RecurringRow key={r.id} item={r} />
              ))}
          </Panel>
          <Panel title="Income sources">
            {Array.from(
              new Set(
                selectedRows
                  .filter((t) => t.type === "income")
                  .map((t) => t.category),
              ),
            ).map((category) => (
              <div className="v2-data-row" key={category}>
                <strong>{category}</strong>
                <MoneyDisplay
                  value={
                    totals(selectedRows.filter((t) => t.category === category))
                      .income
                  }
                  kind="income"
                />
              </div>
            ))}
            <p className="v2-helper">
              Average daily spending:{" "}
              {decimal(cents(expenses) / BigInt(periodDays))} EGP · calendar
              days in selected range
            </p>
          </Panel>
        </div>
      </>
    );
  } else if (route === "budgets")
    content = (
      <>
        <FormField id="budget-month" label="Budget month">
          <TextInput
            id="budget-month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </FormField>
        <div className="p4-planning-list">
          {visibleBudgets
            .filter((b) => b.month === month)
            .map((b) => (
              <div key={b.id}>
                <BudgetRow {...budgetProps(b)} />
                <div className="v2-actions">
                  <Button variant="text" onClick={() => editBudget(b)}>
                    Edit
                  </Button>
                  <Button
                    variant="text"
                    onClick={() =>
                      ask(
                        "Delete budget?",
                        "Your recorded expenses stay unchanged. Only this spending limit is removed.",
                        () => {
                          p.setBudgets((items) =>
                            items.filter((item) => item.id !== b.id),
                          );
                          saved();
                        },
                      )
                    }
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
        </div>
        {!visibleBudgets.some((b) => b.month === month) && (
          <EmptyState
            title="A fresh month"
            description="Set your first category budget for this month."
            action={<Button onClick={() => editBudget()}>Create budget</Button>}
          />
        )}
      </>
    );
  else if (route === "goals")
    content = (
      <div className="p4-columns">
        {p.goals.map((g) => (
          <div key={g.id}>
            <GoalCard
              {...g}
              percent={percent(g.saved, g.target)}
              canComplete={cents(g.saved) >= cents(g.target)}
              onComplete={() =>
                ask(
                  "Mark goal complete?",
                  "Completion is explicit. This does not move money between accounts.",
                  () => {
                    p.setGoals((items) =>
                      items.map((item) =>
                        item.id === g.id
                          ? { ...item, status: "Completed" }
                          : item,
                      ),
                    );
                    saved();
                  },
                )
              }
            />
            <div className="v2-actions">
              <Button
                variant="text"
                disabled={g.status === "Archived"}
                onClick={() => editGoal(g)}
              >
                Edit
              </Button>
              {g.status !== "Archived" && (
                <Button
                  variant="text"
                  onClick={() =>
                    ask(
                      "Archive goal?",
                      "Keep the goal as an archived reference. Your account balances will not change.",
                      () => {
                        p.setGoals((items) =>
                          items.map((item) =>
                            item.id === g.id
                              ? { ...item, status: "Archived" }
                              : item,
                          ),
                        );
                        saved();
                      },
                    )
                  }
                >
                  Archive
                </Button>
              )}
            </div>
            <p className="v2-helper">Linked account: {g.linkedAccount}</p>
          </div>
        ))}
      </div>
    );
  else
    content = (
      <div className="p4-settings">
        <Panel title="Profile">
          <form
            className="v2-form"
            onSubmit={(e) => {
              e.preventDefault();
              saved();
            }}
          >
            <FormField id="profile-name" label="Display name">
              <TextInput
                id="profile-name"
                value={p.name}
                required
                onChange={(e) => p.setName(e.target.value)}
              />
            </FormField>
            <FormField id="profile-email" label="Email">
              <TextInput
                id="profile-email"
                value="nour@example.test"
                disabled
              />
            </FormField>
            <Button type="submit">Save profile</Button>
          </form>
        </Panel>
        <Panel title="Preferences">
          <dl className="p4-definition">
            <div>
              <dt>Currency</dt>
              <dd>EGP</dd>
            </div>
            <div>
              <dt>Financial timezone</dt>
              <dd>Africa/Cairo</dd>
            </div>
            <div>
              <dt>Language</dt>
              <dd>English (en)</dd>
            </div>
          </dl>
          <p className="v2-helper">Fixed for V2 core.</p>
        </Panel>
        <Panel title="Categories">
          <Button onClick={() => editCategory()}>Add custom category</Button>
          {p.categories.map((c) => (
            <div className="v2-data-row" key={c.id}>
              <div>
                <strong>{c.name}</strong>
                <p className="v2-helper">
                  {c.system ? "System · read-only" : "Custom"} · {c.kind} ·{" "}
                  {c.archived ? "Archived" : "Active"}
                </p>
              </div>
              {!c.system && (
                <div className="v2-actions">
                  <Button variant="text" onClick={() => editCategory(c)}>
                    Edit
                  </Button>
                  <Button
                    variant="text"
                    onClick={() => {
                      if (c.archived) {
                        p.setCategories((items) =>
                          items.map((item) =>
                            item.id === c.id
                              ? { ...item, archived: false }
                              : item,
                          ),
                        );
                        saved();
                      } else
                        ask(
                          "Archive category?",
                          "Linked active schedules pause. Historical transactions retain their category. Restoring does not resume schedules.",
                          () => {
                            p.setCategories((items) =>
                              items.map((item) =>
                                item.id === c.id
                                  ? { ...item, archived: true }
                                  : item,
                              ),
                            );
                            p.setRecurring((items) =>
                              items.map((r) =>
                                r.category === c.name && r.status === "Active"
                                  ? { ...r, status: "Paused", date: null }
                                  : r,
                              ),
                            );
                            saved();
                          },
                        );
                    }}
                  >
                    {c.archived ? "Restore" : "Archive"}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </Panel>
        <Panel title="Accounts">
          <p>Manage balances, archive accounts and move money.</p>
          <Link className="v2-button v2-button--secondary" href="/v2/accounts">
            Manage accounts
          </Link>
        </Panel>
        <Panel title="Security">
          <p>
            Password changes and session management will become available with
            real authentication.
          </p>
          <Link className="v2-button v2-button--text" href="/v2/reset-password">
            Preview password reset
          </Link>
        </Panel>
      </div>
    );
  return (
    <PrototypeShell>
      <PageHeader
        title={titles[route]}
        description={descriptions[route]}
        eyebrow="Expense Tracker / Personal workspace"
        actions={
          primary && (
            <Button onClick={primary}>
              {primaryLabel[route as keyof typeof primaryLabel]}
            </Button>
          )
        }
      />
      <div className="p4-review-controls">
        <details className="p4-review-tools">
          <summary>Prototype review</summary>
          <FormField id="page-state" label="Prototype page state">
            <Select
              id="page-state"
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              {[
                "populated",
                "loading",
                "empty",
                "error",
                "stale",
                "stress",
                ...(route === "analytics" ? ["zero-income"] : []),
                ...(route === "dashboard" ? ["partial-error"] : []),
                ...(route === "recurring"
                  ? ["exhausted", "overdue", "posting-failed"]
                  : []),
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </FormField>
          <p className="v2-helper">
            Fictional data only. Changes reset on reload.
          </p>
        </details>
        {(route === "analytics" || route === "dashboard") && (
          <FilterSelect
            label="Period"
            value={range}
            options={[
              "7 days",
              "30 days",
              "3 months",
              "6 months",
              "1 year",
              "Custom",
            ]}
            onChange={setRange}
          />
        )}
      </div>
      {range === "Custom" && (
        <div className="p4-filters">
          {["from", "to"].map((key) => (
            <FormField key={key} id={`custom-${key}`} label={`${key} date`}>
              <DateInput
                id={`custom-${key}`}
                value={custom[key as "from" | "to"]}
                onChange={(e) =>
                  setCustom({ ...custom, [key]: e.target.value })
                }
              />
            </FormField>
          ))}
          <p className="v2-helper">
            Custom fixture range: {custom.from} — {custom.to}
          </p>
        </div>
      )}
      {notice && (
        <FeedbackBanner tone="success" title="Preview updated">
          {notice}
        </FeedbackBanner>
      )}
      {range === "Custom" && rangeInvalid && (
        <FeedbackBanner tone="error" title="Choose a valid date range">
          Both dates are required. From date must be on or before To date.
        </FeedbackBanner>
      )}
      {state === "stale" && <StaleIndicator />}
      {route === "recurring" &&
        ["exhausted", "overdue", "posting-failed"].includes(state) && (
          <FeedbackBanner
            tone={state === "posting-failed" ? "error" : "warning"}
            title={
              state === "exhausted"
                ? "Schedule has reached its end date"
                : state === "overdue"
                  ? "An expected occurrence is overdue"
                  : "A scheduled posting could not be completed"
            }
          >
            {state === "exhausted"
              ? "No further occurrences are expected. Existing posted transactions remain available."
              : state === "overdue"
                ? "Expected activity remains separate from posted actuals. Review the schedule before taking action."
                : "Existing records are unchanged. A future integrated processor will provide safe retry and catch-up controls."}
          </FeedbackBanner>
        )}
      {state === "partial-error" && (
        <ErrorState
          title="Recent refresh failed"
          description="Last loaded overview remains available."
          onRetry={() => setState("populated")}
        />
      )}
      <h2 className="v2-sr-only">{route} overview</h2>
      {state === "loading" ? (
        <section aria-busy="true">
          <Skeleton variant="metric" />
          <Skeleton variant="chart" />
          <Skeleton variant="transaction" />
        </section>
      ) : state === "error" ? (
        <ErrorState onRetry={() => setState("populated")} />
      ) : state === "empty" ? (
        <EmptyState
          title={
            route === "analytics"
              ? "Not enough activity yet"
              : `Your ${route === "dashboard" ? "workspace is" : `${route} are`} ready for a fresh start`
          }
          description={
            route === "analytics"
              ? "Record activity or choose a different period to see your financial story."
              : "Start with an account, then build your financial picture one entry at a time."
          }
          action={
            <Button
              onClick={
                primary ??
                (() =>
                  route === "dashboard" ? editAccount() : setState("populated"))
              }
            >
              {primary
                ? primaryLabel[route as keyof typeof primaryLabel]
                : route === "dashboard"
                  ? "Create first account"
                  : "Return to populated preview"}
            </Button>
          }
        />
      ) : (
        content
      )}
      {editor && (
        <Editor
          {...editor}
          onSave={editor.save}
          onClose={() => setEditor(null)}
        />
      )}{" "}
      {confirm && (
        <ConfirmationDialog
          title={confirm.title}
          description={confirm.description}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            confirm.action();
            setConfirm(null);
            setTimeout(() => {
              if (document.activeElement === document.body)
                document.getElementById("v2-main")?.focus();
            }, 0);
          }}
          confirmLabel="Confirm"
        />
      )}
    </PrototypeShell>
  );
}
