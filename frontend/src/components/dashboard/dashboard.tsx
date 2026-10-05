"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, createApiClient, type TransactionList } from "@/lib/api/client";
import { countsConflict } from "@/lib/dashboard-state";
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
type OpenDialog = { mode: "add"; values: TransactionInput } | { mode: "edit"; id: string; values: TransactionInput } | { mode: "delete"; transaction: Transaction };
export function Dashboard() {
  const [filters,setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [dialog,setDialog] = useState<OpenDialog | null>(null);
  const [pending,setPending] = useState(false);
  const [feedback,setFeedback] = useState<Feedback | null>(null);
  const [feedbackTransaction,setFeedbackTransaction] = useState<Transaction | null>(null);
  const hiddenByFilters = feedback?.tone === "success" && feedbackTransaction !== null && !matchesFilters(feedbackTransaction,filters);
  const [savedRefresh,setSavedRefresh] = useState(false);
  const [deleteFeedback,setDeleteFeedback] = useState<Feedback & {action?: {label: string; onClick: () => void}}>();
  const [deleteBlocked,setDeleteBlocked] = useState(false);
  const [refreshVerb,setRefreshVerb] = useState("Saved");
  const writeLock = useRef(false);
  const loadList = useCallback((signal:AbortSignal) => api.list(filters,signal),[filters]);
  const loadSummary = useCallback((signal:AbortSignal) => api.summary(signal),[]);
  const list = useApiRead(`${filters.type}:${filters.category}`,loadList);
  const summary = useApiRead("summary",loadSummary);
  const conflictingCounts = list.status === "success" && summary.status === "success" && countsConflict(filters,list.data?.meta.count,summary.data?.transactionCount);
  const readFailure = list.status === "error" || summary.status === "error";
  const savedRefreshFailed = savedRefresh && readFailure;
  useEffect(() => {
    let disposed = false;
    if (savedRefresh && list.status === "success" && summary.status === "success") {
      queueMicrotask(() => { if (!disposed) setSavedRefresh(false); });
    }
    return () => { disposed = true; };
  },[savedRefresh,list.status,summary.status]);
  const bothFailed = list.status === "error" && summary.status === "error";
  async function refreshBoth(supersede = false) { const results = await Promise.all([list.reload(supersede),summary.reload(supersede)]); return results.every(Boolean); }
  async function retryFailed() {
    await Promise.all([...(list.status === "error" ? [list.reload()] : []),...(summary.status === "error" ? [summary.reload()] : [])]);
  }
  function closeDialog() { if (!pending) setDialog(null); }
  async function save(values:TransactionInput) {
    if (writeLock.current) return;
    writeLock.current = true; setPending(true);
    try {
      const editing = dialog?.mode === "edit";
      const saved = editing ? await api.updateTransaction(dialog.id,values) : await api.create(values);
      setDialog(null);
      setFeedbackTransaction(saved);
      setFeedback({tone:"success",message:`Transaction ${editing ? "updated" : "added"}.`});
      setRefreshVerb("Saved");
      setSavedRefresh(true);
      if (await refreshBoth(true)) setSavedRefresh(false);
    } finally { setPending(false); writeLock.current = false; }
  }
  async function recoverDelete(id: string) {
    if (writeLock.current) return;
    writeLock.current = true; setPending(true);
    try {
      let refreshedList: TransactionList | undefined;
      const [loaded, totals] = await Promise.all([list.reload(true,data => { refreshedList = data; }),summary.reload(true)]);
      if (!loaded || !totals || !refreshedList) throw new Error("Read failed");
      const all = refreshedList.meta.filters.type === null && refreshedList.meta.filters.category === null ? refreshedList : await api.list(DEFAULT_FILTERS);
      if (!all.data.some(row => row.id === id)) {
        setDialog(null); setFeedback({tone:"info",message:"This transaction is no longer available."});
      } else { setDeleteBlocked(false); setDeleteFeedback({tone:"info",message:"Dashboard refreshed. Check your transactions before trying again."}); }
    } catch { setDeleteFeedback({tone:"warning",message:"The dashboard could not refresh. Check before trying again.",action:{label:"Refresh dashboard",onClick:() => void recoverDelete(id)}}); }
    finally { writeLock.current = false; setPending(false); }
  }
  async function remove() {
    if (writeLock.current || deleteBlocked || dialog?.mode !== "delete") return;
    const id = dialog.transaction.id;
    writeLock.current = true; setPending(true); setDeleteFeedback(undefined);
    try {
      await api.deleteTransaction(id);
      setDialog(null); setFeedbackTransaction(null); setFeedback({tone:"success",message:"Transaction deleted."});
      setRefreshVerb("Deleted"); setSavedRefresh(true);
      if (await refreshBoth(true)) setSavedRefresh(false);
    } catch (error) {
      if (error instanceof ApiError && error.code === "TRANSACTION_NOT_FOUND" && error.status === 404) {
        setDialog(null); setFeedback({tone:"error",message:"This transaction is no longer available."}); await refreshBoth();
      } else if (!(error instanceof ApiError) || error.uncertain) {
        setDeleteBlocked(true); setDeleteFeedback({tone:"warning",message:"We could not confirm whether this transaction was deleted. Refresh and check your transactions before trying again.",action:{label:"Refresh dashboard",onClick:() => void recoverDelete(id)}});
      } else setDeleteFeedback({tone:"error",message:error.message});
    } finally { writeLock.current = false; setPending(false); }
  }
  return <main className="mx-auto flex min-h-screen w-full max-w-content flex-col gap-6 px-4 py-6 md:gap-8 md:px-6 md:py-8 lg:px-8 lg:py-12">
    <DashboardHeader onAdd={() => setDialog({mode:"add",values:newTransactionValues()})} />
    {feedback ? <FeedbackBanner {...feedback} message={`${feedback.message}${hiddenByFilters ? " It is hidden by your current filters." : ""}`} onDismiss={() => { setFeedback(null); setFeedbackTransaction(null); }} action={hiddenByFilters ? {label:"Reset Filters",onClick:() => { setFilters(DEFAULT_FILTERS); document.getElementById("filter-type")?.focus(); }} : undefined} /> : null}
    {savedRefreshFailed ? <FeedbackBanner tone="warning" message={`${refreshVerb}, but the dashboard could not refresh.`} action={{label:"Retry",onClick:() => void retryFailed()}} /> : bothFailed ? <FeedbackBanner tone="error" message="The dashboard could not load. Please try again." action={{label:"Retry all",onClick:() => void refreshBoth()}} /> : null}
    <SummarySection summary={summary.data} loading={summary.loading && !summary.data} updating={summary.loading && !!summary.data} error={summary.status === "error" && !summary.data} stale={(summary.status === "error" && !!summary.data) || conflictingCounts} staleMessage={conflictingCounts ? "The list and summary may be out of date. Refresh to check your transactions." : undefined} errorMessage={summary.error?.message} onRetry={() => void (conflictingCounts ? refreshBoth() : summary.reload())} />
    <TransactionPanel transactions={list.data?.data ?? []} count={list.data?.meta.count} overallCount={summary.status === "success" && !conflictingCounts ? summary.data?.transactionCount : undefined} filters={filters} updating={list.hasLoaded} queryErrors={list.error?.code === "VALIDATION_ERROR" ? list.error.details.filter(detail => detail.field === "type" || detail.field === "category").map(detail => detail.field) : undefined} loading={list.loading} error={list.status === "error" && !list.loading} errorMessage={list.error?.message} onFilterChange={setFilters} onAdd={() => setDialog({mode:"add",values:newTransactionValues()})} onEdit={transaction => setDialog({mode:"edit",id:transaction.id,values:editableValues(transaction)})} onDelete={transaction => { setDeleteFeedback(undefined); setDeleteBlocked(false); setDialog({mode:"delete",transaction}); }} onRetry={() => void list.reload()} />
    {dialog?.mode === "delete" ? <DeleteConfirmation transaction={dialog.transaction} pending={pending} blocked={deleteBlocked} feedback={deleteFeedback} onConfirm={() => void remove()} onCancel={closeDialog} /> : dialog ? <TransactionDialog mode={dialog.mode} initialValues={dialog.values} pending={pending} scenario="normal" onSubmit={save} onClose={closeDialog} onRefresh={async () => { if(!await refreshBoth(true)) throw new Error("Read failed"); }} /> : null}
  </main>;
}
