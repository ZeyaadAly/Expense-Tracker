"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "../../lib/auth/auth-provider";
import { useOptionalProfile } from "../../lib/auth/profile-context";
import { createProfileClient, type Profile } from "../../lib/api/profile";
import { createCategoryClient } from "../../lib/api/categories";
import { createSettingsStore } from "../../lib/settings-store";
import { PageHeader } from "../../components/v2/app-shell";
import { Button, EmptyState, ErrorState, FeedbackBanner, FormField, SegmentedControl, Skeleton, StaleIndicator, TextInput } from "../../components/v2/primitives";
import { PrototypeShell } from "./shell";
import { CategoryDialog, type CategoryAction } from "./settings-category-dialog";

type Store = ReturnType<typeof createSettingsStore>;
type State = ReturnType<Store["getSnapshot"]>;
export function SettingsPage() {
  const { user } = useAuth();
  return user ? <ConnectedSettings key={user.id} userId={user.id} email={user.email ?? ""} /> : null;
}
function ConnectedSettings({ userId, email }: { userId: string; email: string }) {
  const { invalidateSession, signOut } = useAuth();
  const router = useRouter();
  const [profileClient] = useState(() => createProfileClient(userId));
  const [categoryClient] = useState(() => createCategoryClient(userId));
  const [store] = useState(() => createSettingsStore(profileClient, categoryClient));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [action, setAction] = useState<CategoryAction | null>(null);
  const [status, setStatus] = useState<"active" | "archived">("active");
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const logoutPending = useRef(false);
  useEffect(() => store.start(), [store]);
  useEffect(() => { if (state.authError) { invalidateSession(); void signOut(); router.replace("/v2/login?reason=expired"); } }, [state.authError, invalidateSession, signOut, router]);
  if (state.authError) return null;
  async function logout() {
    if (logoutPending.current) return;
    logoutPending.current = true; setSigningOut(true); setSignOutError("");
    const result = await signOut();
    if (result.error) { setSignOutError(result.error.message); setSigningOut(false); logoutPending.current = false; }
    else router.replace("/v2/login");
  }
  const list = state[status];
  return <PrototypeShell liveSettings>
    <PageHeader title="Settings" description="Your workspace, your details." eyebrow="Expense Tracker / Personal workspace" />
    <div className="p4-settings">
      <section className="p4-panel" aria-labelledby="settings-profile-title">
        <h2 id="settings-profile-title">Profile</h2>
        {state.profileNotice && <FeedbackBanner tone="success" title={state.profileNotice} />}
        {state.profile.error && <ErrorState title="Profile could not refresh" description={state.profile.error} onRetry={() => void store.refreshProfile()} />}
        {state.profile.stale && <StaleIndicator />}
        {state.profile.data ? <ProfileForm key={`${userId}:${state.profile.data.updatedAt}`} profile={state.profile.data} email={email} state={state} store={store} /> : state.profile.loading ? <Skeleton variant="account" /> : null}
      </section>
      <section className="p4-panel" aria-labelledby="settings-preferences-title">
        <h2 id="settings-preferences-title">Preferences</h2>
        <dl className="p4-definition"><div><dt>Currency</dt><dd>EGP</dd></div><div><dt>Financial timezone</dt><dd>Africa/Cairo</dd></div><div><dt>Language</dt><dd>English (en)</dd></div></dl>
        <p className="v2-helper">Fixed for V2 core. These preferences cannot be changed here.</p>
      </section>
      <section className="p4-panel" aria-labelledby="settings-accounts-title">
        <h2 id="settings-accounts-title">Accounts</h2>
        <p>Manage accounts, balances, archive and restore from the connected Accounts page.</p>
        <Link className="v2-button v2-button--secondary" href="/v2/accounts">Manage accounts</Link>
      </section>
      <section className="p4-panel" aria-labelledby="settings-categories-title">
        <h2 id="settings-categories-title">Categories</h2>
        {state.categoryNotice && <FeedbackBanner tone="success" title={state.categoryNotice} />}
        {state.categoryFailure && !action && <FeedbackBanner tone={state.categoryFailure.uncertain ? "warning" : "error"} title={state.categoryFailure.message} />}
        <div className="v2-actions"><Button disabled={state.categoryPending || !!state.categoryFailure?.uncertain} onClick={() => { store.clearFailure("category"); setAction({ kind: "create" }); }}>Add custom category</Button><Button variant="secondary" disabled={list.loading || state.categoryPending} onClick={() => void store.refreshCategories(status)}>Refresh categories</Button></div>
        <SegmentedControl label="Category status" value={status === "active" ? "Active" : "Archived"} options={["Active", "Archived"]} onChange={value => setStatus(value.toLowerCase() as "active" | "archived")} />
        {list.error && <ErrorState title="Categories could not refresh" description={list.error} onRetry={() => void store.refreshCategories(status)} />}
        {list.stale && <StaleIndicator />}
        {list.loading && <p role="status">Loading {status} categories…</p>}
        {list.data === null ? list.loading ? <Skeleton variant="transaction" /> : null : list.data.length === 0 ? <EmptyState title={`No ${status} categories.`} description={status === "active" ? "Add a custom category for your transactions and plans." : "Archived custom categories will appear here."} /> : <div className="v2-settings-category-list">{list.data.map(category => <div className="v2-data-row" key={category.id}>
          <div><strong>{category.name}</strong><p className="v2-helper">{category.isSystem ? "System · read-only" : "Custom"} · {category.kind} · {category.status}</p></div>
          {!category.isSystem && <div className="v2-actions">
            {category.status === "active" && <Button variant="text" disabled={state.categoryPending || !!state.categoryFailure?.uncertain} onClick={() => { store.clearFailure("category"); setAction({ kind: "edit", category }); }}>Edit<span className="v2-sr-only"> {category.name}</span></Button>}
            <Button variant="text" disabled={state.categoryPending || !!state.categoryFailure?.uncertain} onClick={() => { store.clearFailure("category"); setAction({ kind: category.status === "active" ? "archive" : "restore", category }); }}>{category.status === "active" ? "Archive" : "Restore"}<span className="v2-sr-only"> {category.name}</span></Button>
          </div>}
        </div>)}</div>}
        {state.categoryFailure?.uncertain && !action && <CategoryInspection state={state} store={store} />}
      </section>
      <section className="p4-panel" aria-labelledby="settings-security-title">
        <h2 id="settings-security-title">Security</h2>
        <p>Use your account email to request a password reset link. The link opens the secure password reset flow.</p>
        <div className="v2-actions"><Link className="v2-button v2-button--secondary" href="/v2/forgot-password">Reset password</Link><Button variant="text" loading={signingOut} onClick={() => void logout()}>Sign out</Button></div>
        {signOutError && <FeedbackBanner tone="error" title={signOutError} />}
      </section>
    </div>
    {action && <CategoryDialog key={`${action.kind}:${"category" in action ? action.category.id : "new"}`} action={action} state={state} store={store} client={categoryClient} close={() => { if (!store.getSnapshot().categoryPending) { setAction(null); store.clearFailure("category"); } }} />}
  </PrototypeShell>;
}
export function CategoryInspection({ state, store }: { state: State; store: Store }) {
  const ready = state.categoryInspectionReady && !state.active.loading && !state.archived.loading && !state.active.error && !state.archived.error;
  return <div className="v2-actions"><Button variant="secondary" disabled={state.active.loading || state.archived.loading} onClick={() => { void store.refreshCategories("active"); void store.refreshCategories("archived"); }}>Refresh both lists and inspect</Button><Button variant="text" disabled={!ready} onClick={() => store.inspected("category")}>I inspected the current categories</Button></div>;
}
export function ProfileForm({ profile, email, state, store }: { profile: Profile; email: string; state: State; store: Store }) {
  const profileContext = useOptionalProfile();
  const id = useId();
  const [draft, setDraft] = useState(profile.displayName ?? "");
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current || state.profilePending || state.profileFailure?.uncertain) return;
    const name = draft.trim();
    const validation = name && (Array.from(name).length > 100 || /[\p{Cc}\p{Cs}]/u.test(name)) ? "Enter 1 to 100 characters, or leave blank. Control characters are not allowed." : "";
    setError(validation); if (validation) { document.getElementById(`${id}-name`)?.focus(); return; }
    pending.current = true; const saved = await store.saveProfile(name || null); pending.current = false;
    if (saved) { const current = store.getSnapshot().profile.data; if (current) profileContext?.setProfile(current); }
  }
  return <form className="v2-form" onSubmit={event => void submit(event)}>
    {state.profileFailure && <FeedbackBanner tone={state.profileFailure.uncertain ? "warning" : "error"} title={state.profileFailure.message} />}
    <FormField id={`${id}-name`} label="Display name" error={error || state.profileFailure?.fields.displayName} hint="Leave blank to clear your display name."><TextInput id={`${id}-name`} value={draft} maxLength={200} disabled={state.profilePending} aria-invalid={!!(error || state.profileFailure?.fields.displayName)} aria-describedby={[`${id}-name-hint`, error || state.profileFailure?.fields.displayName ? `${id}-name-error` : ""].filter(Boolean).join(" ")} onChange={event => { setDraft(event.target.value); setError(""); }} /></FormField>
    <FormField id={`${id}-email`} label="Email" hint="Managed by your sign-in provider."><TextInput id={`${id}-email`} value={email} readOnly /></FormField>
    <div className="v2-actions"><Button type="submit" loading={state.profilePending} disabled={!!state.profileFailure?.uncertain || (draft.trim() || null) === profile.displayName}>Save profile</Button><Button variant="secondary" disabled={state.profile.loading || state.profilePending} onClick={() => void store.refreshProfile()}>Refresh profile</Button></div>
    {state.profileFailure?.uncertain && <Button variant="text" disabled={!state.profileInspectionReady || state.profile.loading || !!state.profile.error} onClick={() => store.inspected("profile")}>I inspected the current profile</Button>}
  </form>;
}
