"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AuthConfigurationError } from "./errors";

export function validateAuthConfig(url?: string, key?: string) {
  try {
    const parsed = new URL(url ?? "");
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/" || parsed.hostname.includes("YOUR_PROJECT_REF".toLowerCase()) || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key ?? "")) throw new Error();
    return { url: parsed.origin, key: key! };
  } catch {
    throw new AuthConfigurationError("Invalid public Auth configuration");
  }
}

// Lazy initialization keeps absent V2 config from affecting V1 or fixture routes.
export function createBrowserClientGetter(
  readConfig: () => { url?: string; key?: string },
  isBrowser: () => boolean,
  factory: typeof createClient = createClient,
) {
  let client: SupabaseClient | undefined;
  return () => {
    if (!isBrowser()) throw new AuthConfigurationError("Browser Auth only");
    if (!client) {
      const values = readConfig();
      const config = validateAuthConfig(values.url, values.key);
      client = factory(config.url, config.key, { auth: {
        persistSession: true, autoRefreshToken: true,
        detectSessionInUrl: true, flowType: "implicit",
      } });
    }
    return client;
  };
}
export const getSupabaseBrowserClient = createBrowserClientGetter(
  () => ({ url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY }),
  () => typeof window !== "undefined",
);
