import { CATEGORY_LABELS, displayDate, type Transaction } from "@/lib/transactions";
import { Button } from "../ui/button";
import { DialogShell } from "../ui/dialog-shell";
import { FeedbackBanner, type Feedback } from "../ui/feedback";
import { MoneyDisplay, TypeBadge } from "./transaction-list";

export function DeleteConfirmation({ transaction, pending, feedback, onConfirm, onCancel }: { transaction: Transaction; pending: boolean; feedback?: Feedback; onConfirm: () => void; onCancel: () => void }) {
  return <DialogShell title="Delete transaction?" description="This permanently removes the transaction. You cannot undo this." pending={pending} initialFocus='[data-cancel="true"]' onClose={onCancel}>
    <div className="mt-6 space-y-3 rounded-card border border-border bg-surface-muted p-4">
      <p className="font-medium wrap-anywhere">{transaction.description}</p>
      <TypeBadge type={transaction.type} />
      <p><MoneyDisplay amount={transaction.amount} type={transaction.type} /></p>
      <dl className="space-y-2 text-sm"><div className="flex flex-wrap gap-2"><dt className="text-muted">Category:</dt><dd>{CATEGORY_LABELS[transaction.category]}</dd></div><div className="flex flex-wrap gap-2"><dt className="text-muted">Date:</dt><dd><time dateTime={transaction.date}>{displayDate(transaction.date)}</time></dd></div></dl>
    </div>
    {feedback ? <div className="mt-4"><FeedbackBanner {...feedback} /></div> : null}
    <div className="mt-6 flex flex-col gap-3 md:flex-row md:justify-end">
      <Button variant="secondary" data-cancel="true" disabled={pending} onClick={onCancel}>Cancel</Button>
      <Button variant="danger" pending={pending} onClick={onConfirm}>{pending ? "Deleting…" : "Delete transaction"}</Button>
    </div>
  </DialogShell>;
}
