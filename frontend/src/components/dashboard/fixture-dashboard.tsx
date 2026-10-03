"use client";

import { useRef, useState } from "react";
import { fixtureSummary, fixtureTransactions, type PreviewScene } from "@/lib/fixtures";
import { DEFAULT_FILTERS, matchesFilters, normalizeAmount, sortTransactions, type Filters, type Transaction, type TransactionInput } from "@/lib/transactions";
import { FeedbackBanner, type Feedback } from "../ui/feedback";
import { TransactionDialog } from "../transactions/transaction-dialog";
import { DeleteConfirmation } from "../transactions/delete-confirmation";
import { editableValues, newTransactionValues, type FormScenario } from "../transactions/transaction-form";
import { TransactionPanel } from "../transactions/transaction-panel";
import { DashboardHeader } from "./dashboard-header";
import { SummarySection } from "./summary";

type OpenDialog = { mode: "add" | "edit"; values: TransactionInput; transaction?: Transaction; scenario: FormScenario } | { mode: "delete"; transaction: Transaction };

function initialDialog(scene: PreviewScene): OpenDialog | null {
  const record = fixtureTransactions("populated")[0];
  if (scene === "delete-pending" || scene === "delete-error") return { mode: "delete", transaction: record };
  if (scene === "edit-missing") return { mode: "edit", values: editableValues(record), transaction: record, scenario: scene };
  if (scene === "validation") return { mode: "add", values: { type: "expense", amount: "1.234", category: "", date: "2099-01-01", description: "" }, scenario: scene };
  if (scene === "submitting" || scene === "save-error" || scene === "uncertain") return { mode: "add", values: editableValues(record), scenario: scene };
  return null;
}

function initialFeedback(scene: PreviewScene): Feedback | null {
  if (scene === "success") return { tone: "success", message: "Transaction added. This is a temporary preview; no data was saved to a server." };
  if (scene === "stale") return { tone: "warning", message: "Saved, but the dashboard could not refresh. Showing previously loaded totals." };
  return null;
}

export function FixtureDashboard({ initialScene = "populated" }: { initialScene?: PreviewScene }) {
  const [scene, setScene] = useState(initialScene);
  const [transactions, setTransactions] = useState(() => fixtureTransactions(initialScene));
  const [filters, setFilters] = useState<Filters>(() => initialScene === "no-results" ? { type: "expense", category: "bills" } : DEFAULT_FILTERS);
  const [dialog, setDialog] = useState<OpenDialog | null>(() => initialDialog(initialScene));
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(() => initialFeedback(initialScene));
  const mutationLock = useRef(false);
  const summary = fixtureSummary(transactions);
  if (scene === "stress") summary.totalIncome = "999999999999999999999.99";
  const loading = scene === "loading";
  const summaryError = scene === "error" || scene === "summary-error";
  const listError = scene === "error" || scene === "list-error";
  const visible = sortTransactions(transactions.filter((transaction) => matchesFilters(transaction, filters)));
  const dialogPending = pending || scene === "submitting" || scene === "delete-pending";

  function resetPreviewStatus() { setScene("populated"); setFeedback(null); }
  function openAdd() { setDialog({ mode: "add", values: newTransactionValues(), scenario: "normal" }); }
  function closeDialog() { if (!dialogPending) { setDialog(null); setScene("populated"); } }

  async function savePreview(values: TransactionInput) {
    if (!dialog || dialog.mode === "delete" || mutationLock.current) return;
    mutationLock.current = true;
    setPending(true);
    try {
      // A local delay makes pending/duplicate-action behavior reviewable. No HTTP call.
      await new Promise<void>((resolve) => setTimeout(resolve, 450));
      const timestamp = new Date().toISOString();
      const saved: Transaction = {
        ...values, amount: normalizeAmount(values.amount), category: values.category as Transaction["category"], description: values.description.trim(),
        id: dialog.transaction?.id ?? crypto.randomUUID(), currency: "EGP", createdAt: dialog.transaction?.createdAt ?? timestamp, updatedAt: timestamp,
      };
      setTransactions((current) => dialog.mode === "edit" ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]);
      setFeedback({ tone: "success", message: `Transaction ${dialog.mode === "edit" ? "updated" : "added"} in this preview.${matchesFilters(saved, filters) ? "" : " It is hidden by your current filters."}` });
      setScene("populated");
      setDialog(null);
    } finally { setPending(false); mutationLock.current = false; }
  }

  async function deletePreview() {
    if (!dialog || dialog.mode !== "delete" || mutationLock.current) return;
    mutationLock.current = true;
    setPending(true);
    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 450));
      setTransactions((current) => current.filter((item) => item.id !== dialog.transaction.id));
      setFeedback({ tone: "success", message: "Transaction deleted from this preview." });
      setScene("populated");
      setDialog(null);
    } finally { setPending(false); mutationLock.current = false; }
  }

  return <main className="mx-auto flex min-h-screen w-full max-w-content flex-col gap-6 px-4 py-6 md:gap-8 md:px-6 md:py-8 lg:px-8 lg:py-12">
    <DashboardHeader onAdd={openAdd} />
    {feedback ? <FeedbackBanner {...feedback} onDismiss={() => setFeedback(null)} action={feedback.tone === "warning" ? { label: "Retry", onClick: resetPreviewStatus } : feedback.message.includes("hidden") ? { label: "Reset Filters", onClick: () => setFilters(DEFAULT_FILTERS) } : undefined} /> : null}
    <SummarySection summary={summary} loading={loading} error={summaryError} stale={scene === "stale"} onRetry={resetPreviewStatus} />
    <TransactionPanel transactions={visible} overallCount={summaryError ? undefined : transactions.length} filters={filters} loading={loading} error={listError} onFilterChange={setFilters} onAdd={openAdd} onEdit={(transaction) => setDialog({ mode: "edit", values: editableValues(transaction), transaction, scenario: "normal" })} onDelete={(transaction) => setDialog({ mode: "delete", transaction })} onRetry={resetPreviewStatus} />
    <p className="text-sm leading-5 text-muted">Preview data. Changes are temporary and reset when you reload.</p>
    {dialog?.mode === "delete" ? <DeleteConfirmation transaction={dialog.transaction} pending={dialogPending} feedback={scene === "delete-error" ? { tone: "error", message: "The transaction could not be deleted. Try again." } : undefined} onConfirm={() => void deletePreview()} onCancel={closeDialog} /> : dialog ? <TransactionDialog mode={dialog.mode} initialValues={dialog.values} pending={dialogPending} scenario={dialog.scenario} onSubmit={savePreview} onClose={closeDialog} onRefresh={() => { setFeedback({ tone: "info", message: "Preview dashboard refreshed. Your form entries have been kept." }); setScene("populated"); }} /> : null}
  </main>;
}
