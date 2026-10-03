"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { CATEGORIES, CATEGORY_LABELS, DESCRIPTION_LIMIT, cairoToday, validateTransaction, type Category, type FieldErrors, type TransactionInput, type TransactionType } from "@/lib/transactions";
import { Button } from "../ui/button";
import { FeedbackBanner, type Feedback } from "../ui/feedback";

export type FormScenario = "normal" | "submitting" | "validation" | "save-error" | "uncertain" | "edit-missing";

export function FormField({ id, label, helper, error, children }: { id: string; label: string; helper?: string; error?: string; children: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-2">
    <label htmlFor={id} className="text-sm font-medium">{label} <span className="text-muted">(required)</span></label>
    {children}
    {helper ? <p id={`${id}-helper`} className="text-sm leading-5 text-muted">{helper}</p> : null}
    <div className="min-h-0">{error ? <p id={`${id}-error`} className="text-sm leading-5 text-danger">{error}</p> : null}</div>
  </div>;
}

export function TransactionForm({ initialValues, mode, pending, scenario = "normal", onSubmit, onCancel, onRefresh }: { initialValues: TransactionInput; mode: "add" | "edit"; pending: boolean; scenario?: FormScenario; onSubmit: (values: TransactionInput) => Promise<void>; onCancel: () => void; onRefresh: () => void }) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<FieldErrors>(() => scenario === "validation" ? validateTransaction(initialValues, cairoToday()) : {});
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const submissionLock = useRef(false);
  const prefix = useId();
  const fieldId = (field: keyof TransactionInput) => `${prefix}-${field}`;
  const today = cairoToday();
  const unavailable = scenario === "edit-missing";

  function changeValues(next: TransactionInput) {
    setValues(next);
    if (Object.keys(errors).length) setErrors(validateTransaction(next, cairoToday()));
    setFeedback(null);
  }

  function fieldProps(field: keyof TransactionInput) {
    return {
      id: fieldId(field), name: field, required: true, disabled: pending || unavailable,
      "aria-invalid": Boolean(errors[field]),
      "aria-describedby": `${fieldId(field)}-helper${errors[field] ? ` ${fieldId(field)}-error` : ""}`,
      className: `form-control ${errors[field] ? "border-danger" : ""}`,
    };
  }

  const scenarioFeedback: Feedback | null = scenario === "save-error" ? { tone: "error", message: "The transaction could not be saved. Your entries are kept; try again." }
    : scenario === "uncertain" ? { tone: "warning", message: "We could not confirm whether this transaction was saved. Refresh and check your transactions before trying again. Similar records cannot prove which request created them." }
    : unavailable ? { tone: "error", message: "This transaction is no longer available. Close this form and refresh the list." } : null;
  const displayedFeedback = feedback ?? scenarioFeedback;

  return <form ref={formRef} noValidate className="mt-6 flex min-w-0 flex-col gap-4" onSubmit={async (event) => {
    event.preventDefault();
    if (pending || unavailable || submissionLock.current) return;
    const validation = validateTransaction(values, cairoToday());
    setErrors(validation);
    if (Object.keys(validation).length) {
      const first = Object.keys(validation)[0];
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    submissionLock.current = true;
    try { await onSubmit(values); }
    catch { setFeedback({ tone: "error", message: "The preview could not update. Your entries are kept." }); }
    finally { submissionLock.current = false; }
  }}>
    {Object.keys(errors).length ? <div role="alert" className="rounded-control border border-danger bg-danger-surface p-3 text-sm text-danger">
      <p className="font-medium">Check the highlighted fields.</p>
      <ul className="mt-2 space-y-1">{Object.entries(errors).map(([field, message]) => <li key={field}><a className="underline" href={`#${fieldId(field as keyof TransactionInput)}`} onClick={(event) => { event.preventDefault(); document.getElementById(fieldId(field as keyof TransactionInput))?.focus(); }}>{message}</a></li>)}</ul>
    </div> : null}
    <fieldset id={fieldId("type")} tabIndex={-1} disabled={pending || unavailable} aria-invalid={Boolean(errors.type)} aria-describedby={errors.type ? `${fieldId("type")}-error` : undefined} className="min-w-0">
      <legend className="mb-2 text-sm font-medium">Type <span className="text-muted">(required)</span></legend>
      <div className="grid grid-cols-2 gap-2">{(["expense", "income"] as const).map((type) => <label key={type} className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-control border p-3 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus ${values.type === type ? "border-primary bg-info-surface text-info" : "border-control bg-surface"}`}>
        <input type="radio" name="type" value={type} required checked={values.type === type} onChange={() => changeValues({ ...values, type, category: values.category && CATEGORIES[type].includes(values.category) ? values.category : "" })} className="size-4 accent-primary" />
        {type === "expense" ? "Expense" : "Income"}
      </label>)}</div>
      {errors.type ? <p id={`${fieldId("type")}-error`} className="mt-2 text-sm text-danger">{errors.type}</p> : null}
    </fieldset>
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      <FormField id={fieldId("amount")} label="Amount (EGP)" helper="0.01–999,999,999.99; up to 2 decimal places." error={errors.amount}>
        <div className="relative min-w-0">
          <input {...fieldProps("amount")} className={`${fieldProps("amount").className} pr-14`} type="text" inputMode="decimal" placeholder="250.50" value={values.amount} onChange={(event) => changeValues({ ...values, amount: event.target.value })} />
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">EGP</span>
        </div>
      </FormField>
      <FormField id={fieldId("category")} label="Category" helper="Choose a category for the selected type." error={errors.category}>
        <select {...fieldProps("category")} value={values.category} onChange={(event) => changeValues({ ...values, category: event.target.value as Category | "" })}>
          <option value="" disabled>Choose a category</option>{(CATEGORIES[values.type] ?? []).map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>)}
        </select>
      </FormField>
    </div>
    <FormField id={fieldId("date")} label="Date" helper="From 01/01/1900 through today (Cairo)." error={errors.date}>
      <input {...fieldProps("date")} type="date" min="1900-01-01" max={today} value={values.date} onChange={(event) => changeValues({ ...values, date: event.target.value })} />
    </FormField>
    <FormField id={fieldId("description")} label="Description" helper={`1–200 characters after trimming. ${Array.from(values.description.trim()).length}/${DESCRIPTION_LIMIT} characters.`} error={errors.description}>
      <textarea {...fieldProps("description")} className={`${fieldProps("description").className} min-h-24`} rows={3} placeholder="Grocery shopping" value={values.description} onChange={(event) => changeValues({ ...values, description: event.target.value })} />
    </FormField>
    {displayedFeedback ? <FeedbackBanner {...displayedFeedback} action={scenario === "uncertain" ? { label: "Refresh dashboard", onClick: onRefresh } : undefined} /> : null}
    <div className="mt-2 flex flex-col gap-3 md:flex-row md:justify-end">
      <Button type="submit" pending={pending} disabled={unavailable} className="w-full md:w-auto">{pending ? "Saving…" : mode === "add" ? "Add transaction" : "Save changes"}</Button>
      <Button variant="secondary" disabled={pending} onClick={onCancel} className="w-full md:w-auto">Cancel</Button>
    </div>
  </form>;
}

export function newTransactionValues(): TransactionInput {
  return { type: "expense", amount: "", category: "", date: cairoToday(), description: "" };
}

export function editableValues(transaction: TransactionInput): TransactionInput {
  return { type: transaction.type as TransactionType, amount: transaction.amount, category: transaction.category, date: transaction.date, description: transaction.description };
}
