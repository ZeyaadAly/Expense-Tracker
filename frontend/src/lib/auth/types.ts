import type { Session, User } from "@supabase/supabase-js";

export type AuthSession = Session;
export type AuthUser = User;
export type AuthErrorCode =
  | "configuration" | "invalid_credentials" | "email_registered"
  | "weak_password" | "confirmation_required" | "network"
  | "invalid_recovery" | "rate_limited" | "unexpected";
export type AuthError = {
  code: AuthErrorCode;
  message: string;
  field?: "email" | "password";
};
export type AuthResult<T> =
  | { data: T; error: null }
  | { data: null; error: AuthError };
