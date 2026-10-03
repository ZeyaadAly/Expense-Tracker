"use client";

import { useCallback, useRef, useState } from "react";
import { createApiClient } from "@/lib/api/client";
import { useApiRead } from "@/lib/api/use-api-read";
import { DEFAULT_FILTERS, matchesFilters, type Filters, type Transaction, type TransactionInput } from "@/lib/transactions";
import { FeedbackBanner, type Feedback } from "../ui/feedback";
import { TransactionDialog } from "../transactions/transaction-dialog";
import { DeleteConfirmation } from "../transactions/delete-confirmation";
import { editableValues, newTransactionValues } from "../transactions/transaction-form";
import { TransactionPanel } from "../transactions/transaction-panel";
import { DashboardHeader } from "./dashboard-header";
import { SummarySection } from "./summary";

const api = createApiClient();
type OpenDialog = { mode: "add" | "edit"; values: TransactionInput } | { mode: "delete"; transaction: Transaction };
export function Dashboard() {
  const [filters,setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [dialog,setDialog] = useState<OpenDialog | null>(null);
  const [pending,setPending] = useState(false);
  const [feedback,setFeedback] = useState<Feedback | null>(null);
  const [savedRefresh,setSavedRefresh] = useState(false);
  const writeLock = useRef(false);
  const loadList = useCallback((signal:AbortSignal) => api.list(filters,signal),[filters]);
  const loadSummary = useCallback((signal:AbortSignal) => api.summary(signal),[]);
  const list = useApiRead(`${filters.type}:${filters.category}`,loadList);
  const summary = useApiRead("summary",loadSummary);
  const readFailure = list.status === "error" || summary.status === "error";
  const savedRefreshFailed = savedRefresh && readFailure;
  const bothFailed = list.status === "error" && summary.status === "error";
  async function refreshBoth() { const results = await Promise.all([list.reload(),summary.reload()]); return results.every(Boolean); }
  async function retryFailed() {
    await Promise.all([...(list.status === "error" ? [list.reload()] : []),...(summary.status === "error" ? [summary.reload()] : [])]);
  }
  function closeDialog() { if (!pending) setDialog(null); }
  async function save(values:TransactionInput) {
    if (writeLock.current) return;
    writeLock.current = true; setPending(true);
    try {
      const saved = await api.create(values);
      setDialog(null);
      setFeedback({tone:"success",message:`Transaction added.${matchesFilters(saved,filters) ? "" : " It is hidden by your current filters."}`});
      setSavedRefresh(true);
      if (await refreshBoth()) setSavedRefresh(false);
    } finally { setPending(false); writeLock.current = false; }
  }
  return <main className="mx-auto flex min-h-screen w-full max-w-content flex-col gap-6 px-4 py-6 md:gap-8 md:px-6 md:py-8 lg:px-8 lg:py-12">
    <DashboardHeader onAdd={() => setDialog({mode:"add",values:newTransactionValues()})} />
    {feedback ? <FeedbackBanner {...feedback} onDismiss={() => setFeedback(null)} action={feedback.message.includes("hidden") ? {label:"Reset Filters",onClick:() => setFilters(DEFAULT_FILTERS)} : undefined} /> : null}
    {savedRefreshFailed ? <FeedbackBanner tone="warning" message="Saved, but the dashboard could not refresh." action={{label:"Retry",onClick:() => void retryFailed()}} /> : bothFailed ? <FeedbackBanner tone="error" message="The dashboard could not load. Please try again." action={{label:"Retry all",onClick:() => void refreshBoth()}} /> : null}
    <SummarySection summary={summary.data} loading={summary.loading && !summary.data} updating={summary.loading && !!summary.data} error={summary.status === "error" && !summary.data} stale={summary.status === "error" && !!summary.data} errorMessage={summary.error?.message} onRetry={() => void summary.reload()} />
    <TransactionPanel transactions={list.data?.data ?? []} count={list.data?.meta.count} overallCount={summary.status === "success" ? summary.data?.transactionCount : undefined} filters={filters} loading={list.loading} error={list.status === "error" && !list.loading} errorMessage={list.error?.message} onFilterChange={setFilters} onAdd={() => setDialog({mode:"add",values:newTransactionValues()})} onEdit={transaction => setDialog({mode:"edit",values:editableValues(transaction)})} onDelete={transaction => setDialog({mode:"delete",transaction})} onRetry={() => void list.reload()} />
    <p className="text-sm leading-5 text-muted">Edit and Delete are previews only. Changes to existing transactions are not saved yet.</p>
    {dialog?.mode === "delete" ? <DeleteConfirmation transaction={dialog.transaction} pending={false} feedback={{tone:"info",message:"Deletion is not available yet. This preview will not change the saved transaction."}} onConfirm={() => setFeedback({tone:"info",message:"Deletion is not available yet. No transaction was deleted."})} onCancel={closeDialog} /> : dialog ? <TransactionDialog mode={dialog.mode} initialValues={dialog.values} pending={pending} scenario="normal" onSubmit={dialog.mode === "add" ? save : async () => { throw new Error("Editing is not available yet. No transaction was changed."); }} onClose={closeDialog} onRefresh={async () => { if(!await refreshBoth()) throw new Error("Read failed"); }} readOnly={dialog.mode === "edit"} /> : null}
  </main>;
}
