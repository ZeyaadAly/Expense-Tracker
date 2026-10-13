"use client";
import { useId, useRef, useState } from "react";
import { createCategoryClient, validateCategoryInput, type Category, type CategoryInput } from "../../lib/api/categories";
import { createSettingsStore } from "../../lib/settings-store";
import { Button, DialogShell, FeedbackBanner, FormField, Select, TextInput } from "../../components/v2/primitives";

export type CategoryAction = {kind:"create"} | {kind:"edit"|"archive"|"restore";category:Category};
type Store = ReturnType<typeof createSettingsStore>;
type State = ReturnType<Store["getSnapshot"]>;
export function CategoryDialog({action,state,store,client,close}:{action:CategoryAction;state:State;store:Store;client:ReturnType<typeof createCategoryClient>;close:()=>void}) {
  const id = useId(), category = "category" in action ? action.category : undefined, form = action.kind === "create" || action.kind === "edit";
  const [draft,setDraft] = useState<CategoryInput>({name:category?.name ?? "",kind:category?.kind ?? "expense",icon:category?.icon ?? null,color:category?.color ?? null});
  const [errors,setErrors] = useState<Record<string,string>>({});
  const pending = useRef(false);
  const title = form ? action.kind === "create" ? "Add custom category" : `Edit ${category!.name}` : `${action.kind === "archive" ? "Archive" : "Restore"} ${category!.name}?`;
  async function submit(event?:React.FormEvent<HTMLFormElement>) {
    event?.preventDefault(); if (pending.current || state.categoryPending || state.categoryFailure?.uncertain) return;
    const validation = form ? validateCategoryInput(draft) : {}; setErrors(validation);
    if (Object.keys(validation).length) { document.getElementById(`${id}-${Object.keys(validation)[0]}`)?.focus(); return; }
    pending.current = true;
    const input = {name:draft.name.trim(),kind:draft.kind,icon:draft.icon?.trim() || null,color:draft.color?.trim() || null};
    const saved = await store.mutateCategory(signal => action.kind === "create" ? client.createCategory(input,{signal}) : action.kind === "edit" ? client.updateCategory(category!.id,input,{signal}) : action.kind === "archive" ? client.archiveCategory(category!.id,{signal}) : client.restoreCategory(category!.id,{signal}), action.kind === "archive" ? "Category archived. Linked active recurring schedules were paused; restoring does not resume them." : action.kind === "restore" ? "Category restored. Paused recurring schedules must be resumed separately." : "Category saved.");
    pending.current = false; if (saved) close();
    else { const field = Object.keys(store.getSnapshot().categoryFailure?.fields ?? {})[0]; if (field) document.getElementById(`${id}-${field}`)?.focus(); }
  }
  return <DialogShell title={title} description={action.kind === "archive" ? "Historical transactions keep this category. Linked active recurring schedules will pause. Restoring the category will not resume them." : action.kind === "restore" ? "The category becomes available again. Resume any paused recurring schedules separately." : "A custom category can be used for income, expenses or both. A category already used by financial records cannot change kind."} state={state.categoryPending ? "pending" : state.categoryFailure?.uncertain ? "uncertain" : "default"} onClose={close}>
    {state.categoryFailure && <FeedbackBanner tone={state.categoryFailure.uncertain ? "warning" : "error"} title={state.categoryFailure.message} />}
    {form ? <form onSubmit={event => void submit(event)}>
      <FormField id={`${id}-name`} label="Category name" required error={errors.name || state.categoryFailure?.fields.name}><TextInput id={`${id}-name`} data-initial-focus value={draft.name} maxLength={160} disabled={state.categoryPending} aria-invalid={!!(errors.name || state.categoryFailure?.fields.name)} aria-describedby={errors.name || state.categoryFailure?.fields.name ? `${id}-name-error` : undefined} onChange={event => setDraft({...draft,name:event.target.value})} /></FormField>
      <FormField id={`${id}-kind`} label="Kind" required error={errors.kind || state.categoryFailure?.fields.kind}><Select id={`${id}-kind`} value={draft.kind} disabled={state.categoryPending} aria-invalid={!!(errors.kind || state.categoryFailure?.fields.kind)} aria-describedby={errors.kind || state.categoryFailure?.fields.kind ? `${id}-kind-error` : undefined} onChange={event => setDraft({...draft,kind:event.target.value as CategoryInput["kind"]})}><option value="expense">Expense</option><option value="income">Income</option><option value="both">Both</option></Select></FormField>
      <FormField id={`${id}-icon`} label="Icon" hint="Optional label, up to 64 characters." error={errors.icon || state.categoryFailure?.fields.icon}><TextInput id={`${id}-icon`} value={draft.icon ?? ""} disabled={state.categoryPending} aria-invalid={!!(errors.icon || state.categoryFailure?.fields.icon)} aria-describedby={[`${id}-icon-hint`,errors.icon || state.categoryFailure?.fields.icon ? `${id}-icon-error` : ""].filter(Boolean).join(" ")} onChange={event => setDraft({...draft,icon:event.target.value || null})} /></FormField>
      <FormField id={`${id}-color`} label="Color" hint="Optional color token, up to 16 characters." error={errors.color || state.categoryFailure?.fields.color}><TextInput id={`${id}-color`} value={draft.color ?? ""} disabled={state.categoryPending} aria-invalid={!!(errors.color || state.categoryFailure?.fields.color)} aria-describedby={[`${id}-color-hint`,errors.color || state.categoryFailure?.fields.color ? `${id}-color-error` : ""].filter(Boolean).join(" ")} onChange={event => setDraft({...draft,color:event.target.value || null})} /></FormField>
      <div className="v2-actions"><Button variant="secondary" disabled={state.categoryPending} onClick={close}>Cancel</Button><Button type="submit" loading={state.categoryPending} disabled={!!state.categoryFailure?.uncertain}>Save category</Button></div>
    </form> : <div className="v2-actions"><Button data-initial-focus variant="secondary" disabled={state.categoryPending} onClick={close}>Cancel</Button><Button variant={action.kind === "archive" ? "danger" : "primary"} loading={state.categoryPending} disabled={!!state.categoryFailure?.uncertain} onClick={() => void submit()}>{action.kind === "archive" ? "Archive category" : "Restore category"}</Button></div>}
    {state.categoryFailure?.uncertain && <div className="v2-actions"><Button variant="secondary" disabled={state.active.loading || state.archived.loading} onClick={() => {void store.refreshCategories("active");void store.refreshCategories("archived");}}>Refresh and inspect categories</Button><Button variant="text" disabled={!state.categoryInspectionReady || state.active.loading || state.archived.loading || !!state.active.error || !!state.archived.error} onClick={() => {store.inspected("category");close();}}>I inspected the current categories</Button></div>}
  </DialogShell>;
}
