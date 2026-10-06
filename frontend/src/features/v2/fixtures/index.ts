import type {
  AccountFixture,
  RecurringFixture,
  TransactionFixture,
} from "../../../components/v2/finance";

// Fictional, development-only review data. Never import into V1 or a service.
import { cents, decimal } from "../money";
export const user = { displayName: "Nour Hassan", email: "nour@example.test" };
export const accounts: AccountFixture[] = [
  { id: "cash", name: "Daily cash", type: "cash", balance: "5200.00" },
  { id: "bank", name: "CIB Bank", type: "bank", balance: "18400.00" },
  {
    id: "savings",
    name: "National Bank Savings and Emergency Reserve Account",
    type: "savings",
    balance: "32000.00",
  },
  {
    id: "card",
    name: "Everyday card",
    type: "credit_card",
    balance: "2400.00",
  },
  {
    id: "wallet",
    name: "Mobile wallet",
    type: "mobile_wallet",
    balance: "680.00",
  },
  {
    id: "old",
    name: "Travel reserve",
    type: "other",
    balance: "0.00",
    archived: true,
  },
];
export type Category = {
  id: string;
  name: string;
  kind: string;
  system: boolean;
  archived: boolean;
};
export const categories: Category[] = [
  ...[
    "Salary",
    "Freelance",
    "Food",
    "Transport",
    "Bills",
    "Entertainment",
    "Other",
  ].map((name, i) => ({
    id: `cat-${i}`,
    name,
    kind: i < 2 ? "income" : name === "Other" ? "both" : "expense",
    system: true,
    archived: false,
  })),
  {
    id: "education",
    name: "Professional Education and Certification Expenses",
    kind: "expense",
    system: false,
    archived: false,
  },
  {
    id: "old-category",
    name: "Travel",
    kind: "expense",
    system: false,
    archived: true,
  },
];
export const transactions: TransactionFixture[] = (
  [
    ...[
      ["2026-05-01", "16000.00", "10500.00"],
      ["2026-06-01", "18000.00", "12500.00"],
      ["2026-07-01", "17500.00", "11500.00"],
      ["2026-08-01", "19000.00", "12800.00"],
      ["2026-09-01", "18000.00", "12000.00"],
    ].flatMap(([date, income, expense], i): TransactionFixture[] => [
      {
        id: `history-income-${i}`,
        date,
        description: "Monthly income summary",
        account: "CIB Bank",
        category: "Salary",
        type: "income",
        amount: income,
      },
      {
        id: `history-expense-${i}`,
        date,
        description: "Monthly spending summary",
        account: "CIB Bank",
        category: "Other",
        type: "expense",
        amount: expense,
      },
    ]),
    {
      id: "salary",
      date: "2026-10-01",
      description: "October salary",
      account: "CIB Bank",
      category: "Salary",
      type: "income",
      amount: "15000.00",
    },
    {
      id: "freelance",
      date: "2026-10-03",
      description: "Editorial design project",
      account: "CIB Bank",
      category: "Freelance",
      type: "income",
      amount: "5000.00",
    },
    {
      id: "rent",
      date: "2026-10-02",
      description: "October rent",
      account: "CIB Bank",
      category: "Bills",
      type: "expense",
      amount: "5000.00",
    },
    ...Array.from({ length: 28 }, (_, i): TransactionFixture => ({
      id: `expense-${i}`,
      date: `2026-10-${String(6 - (i % 6)).padStart(2, "0")}`,
      description: [
        "Groceries and household essentials",
        "Metro and taxi fares",
        "Internet and phone",
        "Coffee with friends",
      ][i % 4],
      account: ["Daily cash", "Mobile wallet", "Everyday card"][i % 3],
      category: ["Food", "Transport", "Bills", "Entertainment"][i % 4],
      type: "expense",
      amount: (i >= 24
        ? ["322.84", "197.16", "311.42", "154.26"]
        : ["322.86", "197.14", "311.43", "154.29"])[i % 4],
    })),
  ] satisfies TransactionFixture[]
).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
export type Transfer = {
  id: string;
  source: string;
  destination: string;
  amount: string;
  date: string;
  description: string;
};
export const transfers: Transfer[] = [
  {
    id: "payment",
    source: "CIB Bank",
    destination: "Everyday card",
    amount: "2000.00",
    date: "2026-10-05",
    description: "Card payment",
  },
];
export type Schedule = RecurringFixture & {
  id: string;
  category: string;
  start: string;
  end: string;
};
export const recurring: Schedule[] = [
  {
    id: "salary",
    name: "Monthly salary",
    amount: "15000.00",
    type: "income",
    frequency: "Monthly",
    status: "Active",
    date: "2026-11-01",
    account: "CIB Bank",
    category: "Salary",
    start: "2026-10-01",
    end: "",
  },
  {
    id: "rent",
    name: "Rent",
    amount: "5000.00",
    type: "expense",
    frequency: "Monthly",
    status: "Active",
    date: "2026-11-02",
    account: "CIB Bank",
    category: "Bills",
    start: "2026-10-02",
    end: "",
  },
  {
    id: "transport",
    name: "Weekly transport",
    amount: "300.00",
    type: "expense",
    frequency: "Weekly",
    status: "Active",
    date: "2026-10-08",
    account: "Daily cash",
    category: "Transport",
    start: "2026-10-01",
    end: "",
  },
  {
    id: "allowance",
    name: "Daily allowance",
    amount: "50.00",
    type: "income",
    frequency: "Daily",
    status: "Active",
    date: "2026-10-07",
    account: "Daily cash",
    category: "Other",
    start: "2026-10-01",
    end: "",
  },
  {
    id: "membership",
    name: "Annual membership",
    amount: "800.00",
    type: "expense",
    frequency: "Yearly",
    status: "Paused",
    date: null,
    account: "Everyday card",
    category: "Entertainment",
    start: "2026-10-01",
    end: "",
  },
];
export type Budget = {
  id: string;
  name: string;
  allocated: string;
  spent: string;
  month: string;
  threshold: string;
};
export const budgets: Budget[] = [
  {
    id: "food",
    name: "Food",
    allocated: "3000.00",
    spent: "2260.00",
    month: "2026-10",
    threshold: "90",
  },
  {
    id: "transport",
    name: "Transport",
    allocated: "1500.00",
    spent: "1380.00",
    month: "2026-10",
    threshold: "90",
  },
  {
    id: "fun",
    name: "Entertainment",
    allocated: "1000.00",
    spent: "1080.00",
    month: "2026-10",
    threshold: "90",
  },
];
export type Goal = {
  id: string;
  name: string;
  saved: string;
  target: string;
  date: string;
  linkedAccount: string;
  status: "Active" | "Completed" | "Archived";
};
export const goals: Goal[] = [
  {
    id: "reserve",
    name: "Emergency reserve",
    saved: "32000.00",
    target: "60000.00",
    date: "2027-06-30",
    linkedAccount: accounts[2].name,
    status: "Active",
  },
  {
    id: "laptop",
    name: "New laptop",
    saved: "31500.00",
    target: "30000.00",
    date: "2026-12-31",
    linkedAccount: "None",
    status: "Active",
  },
];
export const analytics = [
  { label: "May", income: "16000.00", expense: "10500.00", savings: "5500.00" },
  { label: "Jun", income: "18000.00", expense: "12500.00", savings: "5500.00" },
  { label: "Jul", income: "17500.00", expense: "11500.00", savings: "6000.00" },
  { label: "Aug", income: "19000.00", expense: "12800.00", savings: "6200.00" },
  { label: "Sep", income: "18000.00", expense: "12000.00", savings: "6000.00" },
  { label: "Oct", income: "20000.00", expense: "11900.00", savings: "8100.00" },
];
export const openingBalances = Object.fromEntries(
  accounts.map((account) => {
    const transactionDelta = transactions
      .filter((t) => t.account === account.name)
      .reduce(
        (sum, t) =>
          sum +
          cents(t.amount) * (t.type === "income" ? BigInt(1) : -BigInt(1)),
        BigInt(0),
      );
    const transferDelta = transfers.reduce(
      (sum, t) =>
        sum +
        (t.destination === account.name ? cents(t.amount) : BigInt(0)) -
        (t.source === account.name ? cents(t.amount) : BigInt(0)),
      BigInt(0),
    );
    return [
      account.id,
      decimal(
        cents(account.balance) -
          (transactionDelta + transferDelta) *
            (account.type === "credit_card" ? -BigInt(1) : BigInt(1)),
      ),
    ];
  }),
);
