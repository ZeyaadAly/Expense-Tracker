"use client";

import type { AuthChangeEvent, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "./supabase-client";
import { AuthConfigurationError, normalizeAuthError } from "./errors";
import type { AuthResult, AuthSession, AuthUser } from "./types";

const allowedOrigins = new Set(["http://localhost:3000", "https://expensetracker-inky-mu.vercel.app"]);
export function authRedirect(origin: string, path: "/v2/login" | "/v2/reset-password") {
  if (!allowedOrigins.has(origin)) throw new AuthConfigurationError("Unapproved Auth redirect origin");
  return new URL(path, origin).href;
}

// Injectable boundary permits provider contract tests without real users/emails.
export function createAuthService(
  getClient: () => Pick<SupabaseClient, "auth"> = getSupabaseBrowserClient,
  getOrigin: () => string = () => window.location.origin,
) {
  async function run<T>(operation: () => Promise<{ data: T; error: unknown }>): Promise<AuthResult<T>> {
    try {
      const result = await operation();
      return result.error ? { data: null, error: normalizeAuthError(result.error) } : { data: result.data, error: null };
    } catch (error) { return { data: null, error: normalizeAuthError(error) }; }
  }
  return {
    // Display-name draft stays with the caller until later verified profile integration.
    signUpWithEmail: (email: string, password: string) => run(async () => {
      const result = await getClient().auth.signUp({ email, password, options: { emailRedirectTo: authRedirect(getOrigin(), "/v2/login") } });
      return { data: { user: result.data.user, session: result.data.session, confirmationRequired: !result.data.session }, error: result.error };
    }),
    signInWithEmail: (email: string, password: string) => run<{ user: AuthUser | null; session: AuthSession | null }>(() => getClient().auth.signInWithPassword({ email, password })),
    signOut: () => run(async () => ({ data: null, error: (await getClient().auth.signOut({ scope: "local" })).error })),
    requestPasswordReset: (email: string) => run(() => getClient().auth.resetPasswordForEmail(email, { redirectTo: authRedirect(getOrigin(), "/v2/reset-password") })),
    updatePassword: (password: string) => run<{ user: AuthUser | null }>(() => getClient().auth.updateUser({ password })),
    getSession: () => run(async () => { const r = await getClient().auth.getSession(); return { data: r.data.session, error: r.error }; }),
    getUser: () => run(async () => { const r = await getClient().auth.getUser(); return { data: r.data.user, error: r.error }; }),
    getAccessToken: () => run(async () => { const r = await getClient().auth.getSession(); return { data: r.data.session?.access_token ?? null, error: r.error }; }),
    subscribe: (listener: (event: AuthChangeEvent, session: AuthSession | null) => void): AuthResult<() => void> => {
      try {
        let active = true;
        // Deliver outside the provider callback lock: consumers may call auth helpers.
        const { data } = getClient().auth.onAuthStateChange((event, session) => {
          setTimeout(() => { if (active) listener(event, session); }, 0);
        });
        return { data: () => { active = false; data.subscription.unsubscribe(); }, error: null };
      } catch (error) { return { data: null, error: normalizeAuthError(error) }; }
    },
  };
}

export const { signUpWithEmail, signInWithEmail, signOut, requestPasswordReset,
  updatePassword, getSession, getUser, getAccessToken, subscribe } = createAuthService();
