import { CATEGORY_LABELS, displayDate, formatMoney, type Transaction, type TransactionType } from "@/lib/transactions";
import { Button } from "../ui/button";

export function TypeBadge({ type }: { type: TransactionType }) {
  return <span className={`inline-block max-w-full rounded-full px-2 py-1 text-sm leading-5 font-medium whitespace-nowrap ${type === "income" ? "bg-success-surface text-income" : "bg-danger-surface text-expense"}`}>{type === "income" ? "Income" : "Expense"}</span>;
}

export function MoneyDisplay({ amount, type }: { amount: string; type: TransactionType }) {
  return <span className={`font-semibold tabular-nums wrap-anywhere ${type === "income" ? "text-income" : "text-expense"}`}><span>{type === "income" ? "+" : "−"}{formatMoney(amount)}</span>{" "}<span>EGP</span></span>;
}

type RecordProps = { transaction: Transaction; onEdit: (transaction: Transaction) => void; onDelete: (transaction: Transaction) => void };

function TransactionActions({ transaction, onEdit, onDelete }: RecordProps) {
  return <div className="flex flex-wrap gap-1">
    <Button variant="text" aria-label={`Edit ${transaction.description}`} onClick={() => onEdit(transaction)}>Edit</Button>
    <Button variant="danger-text" aria-label={`Delete ${transaction.description}`} onClick={() => onDelete(transaction)}>Delete</Button>
  </div>;
}

export function TransactionRow(props: RecordProps) {
  const { transaction } = props;
  return <tr className="border-t border-border">
    <td><time dateTime={transaction.date}>{displayDate(transaction.date)}</time></td>
    <td className="wrap-anywhere">{transaction.description}</td>
    <td className="wrap-anywhere">{CATEGORY_LABELS[transaction.category]}</td>
    <td><TypeBadge type={transaction.type} /></td>
    <td className="text-right"><MoneyDisplay amount={transaction.amount} type={transaction.type} /></td>
    <td><TransactionActions {...props} /></td>
  </tr>;
}

export function TransactionCard(props: RecordProps) {
  const { transaction } = props;
  return <li className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><TypeBadge type={transaction.type} /><MoneyDisplay amount={transaction.amount} type={transaction.type} /></div>
    <p className="font-medium wrap-anywhere">{transaction.description}</p>
    <p className="text-sm text-muted"><span className="sr-only">Category: </span>{CATEGORY_LABELS[transaction.category]} <span aria-hidden="true">·</span> <span className="sr-only">Date: </span><time dateTime={transaction.date}>{displayDate(transaction.date)}</time></p>
    <TransactionActions {...props} />
  </li>;
}

export function TransactionList({ transactions, onEdit, onDelete }: { transactions: Transaction[]; onEdit: RecordProps["onEdit"]; onDelete: RecordProps["onDelete"] }) {
  return <>
    <div className="hidden rounded-card border border-border bg-surface md:block">
      <table className="transaction-table w-full table-fixed text-left text-sm leading-5">
        <caption className="sr-only">Transactions, newest transaction dates first</caption>
        <colgroup><col className="w-[15%] lg:w-[12%]" /><col className="w-[22%] lg:w-[30%]" /><col className="w-[14%]" /><col className="w-[13%] lg:w-[12%]" /><col className="w-[19%] lg:w-[18%]" /><col className="w-[17%] lg:w-[14%]" /></colgroup>
        <thead className="bg-surface-muted text-muted"><tr>{["Date", "Description", "Category", "Type", "Amount", "Actions"].map((label) => <th key={label} scope="col" className={label === "Amount" ? "text-right" : ""}>{label}</th>)}</tr></thead>
        <tbody>{transactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} onEdit={onEdit} onDelete={onDelete} />)}</tbody>
      </table>
    </div>
    <ul aria-label="Transactions" className="space-y-3 md:hidden">{transactions.map((transaction) => <TransactionCard key={transaction.id} transaction={transaction} onEdit={onEdit} onDelete={onDelete} />)}</ul>
  </>;
}
