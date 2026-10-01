import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

// Auth token verification in the next phase will use this server-only client.
export const supabaseAuth = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});
