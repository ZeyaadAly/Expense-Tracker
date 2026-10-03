import type { TransactionInput } from "@/lib/transactions";
import { DialogShell } from "../ui/dialog-shell";
import { TransactionForm, type FormScenario } from "./transaction-form";

export function TransactionDialog({ mode, initialValues, pending, scenario, readOnly, onSubmit, onClose, onRefresh }: { mode: "add" | "edit"; initialValues: TransactionInput; pending: boolean; scenario: FormScenario; readOnly?: boolean; onSubmit: (values: TransactionInput) => Promise<void>; onClose: () => void; onRefresh: () => void | Promise<void> }) {
  return <DialogShell title={mode === "add" ? "Add transaction" : "Edit transaction"} description="All fields are required. Amounts are in EGP." pending={pending} fullScreenMobile onClose={onClose}>
    <TransactionForm mode={mode} initialValues={initialValues} pending={pending} scenario={scenario} readOnly={readOnly} onSubmit={onSubmit} onCancel={onClose} onRefresh={onRefresh} />
  </DialogShell>;
}
