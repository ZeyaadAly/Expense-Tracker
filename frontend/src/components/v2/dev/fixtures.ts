import type {
  AccountFixture,
  RecurringFixture,
  TransactionFixture,
} from "../finance";

export const longAccount =
  "National Bank Savings and Emergency Reserve Account";
export const longCategory = "Professional Education and Certification Expenses";
export const stressDescription =
  "Professional certification resources, exam fees and study materials for the upcoming financial planning programme; includes course access and reference books. "
    .repeat(2)
    .slice(0, 200);
export const stressError =
  "Amount must contain no more than two decimal places.\nSelect an active account and a category matching the transaction type.\nYour draft is preserved; nothing has been saved.";
export const accounts: AccountFixture[] = [
  { id: "cash", name: "Main Account", type: "cash", balance: "5200.00" },
  { id: "bank", name: "CIB Bank", type: "bank", balance: "18400.00" },
  {
    id: "savings",
    name: longAccount,
    type: "savings",
    balance: "999999999.99",
  },
  {
    id: "card",
    name: "Everyday card",
    type: "credit_card",
    balance: "2400.00",
  },
  {
    id: "credit",
    name: "Overpaid card",
    type: "credit_card",
    balance: "-150.00",
  },
  {
    id: "wallet",
    name: "Mobile wallet",
    type: "mobile_wallet",
    balance: "680.00",
  },
  {
    id: "other",
    name: "Travel reserve",
    type: "other",
    balance: "0.00",
    archived: true,
  },
];
export const transactions: TransactionFixture[] = [
  {
    id: "salary",
    date: "2026-10-06",
    description: "October salary",
    account: "CIB Bank",
    category: "Salary",
    type: "income",
    amount: "15000.00",
  },
  {
    id: "groceries",
    date: "2026-10-06",
    description: "Groceries and household essentials",
    account: "Main Account",
    category: "Food",
    type: "expense",
    amount: "850.00",
  },
  {
    id: "stress",
    date: "2026-10-06",
    description: stressDescription,
    account: longAccount,
    category: longCategory,
    type: "expense",
    amount: "999999999.99",
    historical: true,
  },
];
export const recurring: RecurringFixture[] = [
  {
    name: "Monthly salary",
    amount: "15000.00",
    type: "income",
    frequency: "Monthly",
    status: "Active",
    date: "2026-11-01",
    account: "CIB Bank",
  },
  {
    name: "Rent",
    amount: "5000.00",
    type: "expense",
    frequency: "Monthly",
    status: "Active",
    date: "2026-11-02",
    account: "CIB Bank",
  },
  {
    name: "Study subscription",
    amount: "200.00",
    type: "expense",
    frequency: "Weekly",
    status: "Paused",
    date: null,
    account: "Main Account",
  },
  {
    name: "Archived membership",
    amount: "800.00",
    type: "expense",
    frequency: "Yearly",
    status: "Archived",
    date: null,
    account: "Travel reserve",
  },
];
