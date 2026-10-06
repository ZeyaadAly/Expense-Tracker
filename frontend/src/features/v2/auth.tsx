"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Button, FeedbackBanner, FormField, PasswordInput, TextInput } from "../../components/v2/primitives";
import * as auth from "../../lib/auth/auth-service";
import { useAuth } from "../../lib/auth/auth-provider";
import { safeNext } from "../../lib/auth/redirects";
import type { AuthError } from "../../lib/auth/types";
import { createAuthFormSubmitter, validateAuthForm, type AuthRoute } from "./auth-form";
import { profileDrafts } from "../../lib/auth/profile-draft";
export type { AuthRoute } from "./auth-form";
const titles = { login: "Sign in to your workspace", register: "Create your account", "forgot-password": "Reset your password", "reset-password": "Choose a new password" };
export function AuthPage({ route }: { route: AuthRoute }) {
  const router = useRouter();
  const prefix = useId();
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<AuthError | null>(null);
  const [pending, setPending] = useState(false);
  const { session: authSession, loading: initializing, recovery, error: initializationError, signOut: providerSignOut } = useAuth();
  const [recoveryRejected, setRecoveryRejected] = useState(false);
  const recoveryReady = recovery && !recoveryRejected;
  const [success, setSuccess] = useState(false);
  const [notice, setNotice] = useState("");
  const submitter = useRef(createAuthFormSubmitter(auth, profileDrafts.save));
  const mutation = useRef(false);
  const mounted = useRef(false);
  const busy = pending || initializing;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (initializing) return;
    if ((route === "login" || route === "register") && authSession && !recoveryReady) router.replace(safeNext(new URLSearchParams(window.location.search).get("next")));
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    if (["access_token", "refresh_token", "error", "error_code", "token", "token_hash", "code"].some(key => fragment.has(key) || query.has(key))) window.history.replaceState(window.history.state, "", window.location.pathname);
  }, [route, initializing, authSession, recoveryReady, router]);
  const recoveryError: AuthError | null = route === "reset-password" && !initializing && !recoveryReady && !success ? { code: "invalid_recovery", message: "Your recovery link is invalid or has expired. Request a new reset link." } : null;
  const shownError = error ?? initializationError ?? recoveryError;
  const fields = [
    ...(route === "register" ? [{ name: "name", label: "Display name", password: false }] : []),
    ...(route !== "reset-password" ? [{ name: "email", label: "Email", password: false }] : []),
    ...(route !== "forgot-password" ? [{ name: "password", label: route === "reset-password" ? "New password" : "Password", password: true }] : []),
    ...(route === "register" || route === "reset-password" ? [{ name: "confirm", label: "Confirm password", password: true }] : []),
  ];
  useEffect(() => {
    const first = Object.keys(errors)[0];
    if (first && !pending) document.getElementById(`${prefix}-${first}`)?.focus();
  }, [errors, pending, prefix]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.current || busy) return;
    const next = validateAuthForm(route, values);
    setErrors(next); setError(null);
    if (Object.keys(next).length) return;
    mutation.current = true; setPending(true);
    try {
      const result = await submitter.current(route, values, recoveryReady);
      if (!mounted.current) return;
      if (result.kind === "error") {
        setError(result.error);
        if (route === "reset-password" && result.error.code === "invalid_recovery") setRecoveryRejected(true);
        if (result.error.field) setErrors({ [result.error.field]: result.error.message });
      } else if (result.kind === "success") {
        setValues(previous => ({ ...previous, password: "", confirm: "" }));
        if (result.redirect) router.replace(safeNext(new URLSearchParams(window.location.search).get("next")));
        else {
          setSuccess(true);
          if (route === "reset-password") {
            const signedOut = await providerSignOut();
            if (mounted.current && signedOut.error) setError(signedOut.error);
          }
        }
      }
    } finally { mutation.current = false; if (mounted.current) setPending(false); }
  }
  async function testSignOut() {
    if (mutation.current || busy) return;
    mutation.current = true; setPending(true); setError(null);
    try { const result = await providerSignOut(); if (mounted.current) { setError(result.error); if (!result.error) setNotice("Test session signed out."); } }
    finally { mutation.current = false; if (mounted.current) setPending(false); }
  }
  return (
    <main className="p4-auth">
      <section className="p4-auth-story">
        <Link className="v2-brand" href="/v2/login"><span className="v2-mark">e<span>.</span></span>Expense Tracker</Link>
        <div><p className="v2-eyebrow">A clearer view of your money</p><h2>Make room for<br />what matters.</h2><p>Understand your everyday spending. Plan for the next chapter.</p></div>
        <p>EGP · built around your financial life</p>
      </section>
      <section className="p4-auth-form">
        <p className="p4-prototype-label">Real authentication · financial pages still use fictional data</p>
        <h1>{titles[route]}</h1>
        <p className="v2-secondary">{route === "login" ? "Pick up where you left off." : "A little clarity starts here."}</p>
        {initializing && <p role="status" className="v2-helper">Checking authentication…</p>}
        {shownError && <FeedbackBanner tone={shownError.code === "confirmation_required" ? "warning" : "error"} title={shownError.message}>
          {shownError.code === "invalid_recovery" && <Link className="v2-button v2-button--text" href="/v2/forgot-password">Request a new link</Link>}
        </FeedbackBanner>}
        {notice && <FeedbackBanner tone="info" title={notice} />}
        {success ? <FeedbackBanner tone="success" title={route === "register" ? "Check your email to confirm your account." : route === "forgot-password" ? "Check your email" : "Your password has been updated"}>
          {route === "forgot-password" ? "If an account exists for this email, you'll receive password reset instructions." : <Link className="v2-button v2-button--text" href="/v2/login">Return to sign in</Link>}
        </FeedbackBanner> : <form className="v2-form" noValidate aria-busy={pending || undefined} onSubmit={submit}>
          {fields.map(field => {
            const id = `${prefix}-${field.name}`;
            const props = { id, name: field.name, value: values[field.name] ?? "", disabled: busy || (route === "reset-password" && !recoveryReady), required: true,
              "aria-invalid": !!errors[field.name], "aria-describedby": errors[field.name] ? `${id}-error` : undefined,
              autoComplete: field.name === "email" ? "email" : field.password ? route === "login" ? "current-password" : "new-password" : "name",
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => setValues(previous => ({ ...previous, [field.name]: event.target.value })) };
            return <FormField key={field.name} id={id} label={field.label} error={errors[field.name]} required>
              {field.password ? <PasswordInput {...props} /> : <TextInput {...props} type={field.name === "email" ? "email" : "text"} />}
            </FormField>;
          })}
          <Button type="submit" loading={pending} disabled={initializing || (route === "reset-password" && !recoveryReady)}>{route === "login" ? "Sign in" : route === "register" ? "Create account" : route === "forgot-password" ? "Send reset link" : "Update password"}</Button>
          {pending && <p role="status" className="v2-helper">Please wait…</p>}
        </form>}
        <div className="p4-auth-links"><Link href="/v2/login">Sign in</Link><Link href="/v2/register">Create account</Link><Link href="/v2/forgot-password">Forgot password?</Link></div>
        {process.env.NODE_ENV === "development" && <Button variant="text" disabled={busy} onClick={testSignOut}>Sign out test session</Button>}
      </section>
    </main>
  );
}
