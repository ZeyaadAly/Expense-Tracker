import type { AuthError, AuthErrorCode } from "./types";

export class AuthConfigurationError extends Error {}
const messages: Record<AuthErrorCode, string> = {
  configuration: "V2 Auth requires a valid NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in the browser.",
  invalid_credentials: "Email or password is incorrect.",
  email_registered: "This email is already registered. Try signing in.",
  weak_password: "Choose a stronger password.",
  confirmation_required: "Confirm your email before signing in.",
  network: "Unable to reach authentication. Check your connection and try again.",
  invalid_recovery: "Your session or recovery link has expired. Request a new reset link.",
  rate_limited: "Too many attempts. Please wait before trying again.",
  unexpected: "Authentication could not be completed. Please try again.",
};
export function normalizeAuthError(error: unknown): AuthError {
  const value = error && typeof error === "object" ? error as { code?: string; name?: string; status?: number } : {};
  let code: AuthErrorCode = "unexpected";
  if (error instanceof AuthConfigurationError) code = "configuration";
  else if (value.code === "invalid_credentials") code = "invalid_credentials";
  else if (["user_already_exists", "email_exists"].includes(value.code ?? "")) code = "email_registered";
  else if (["weak_password", "same_password"].includes(value.code ?? "")) code = "weak_password";
  else if (value.code === "email_not_confirmed") code = "confirmation_required";
  else if (["session_not_found", "session_expired", "refresh_token_not_found", "refresh_token_already_used", "otp_expired", "bad_jwt"].includes(value.code ?? "") || value.name === "AuthSessionMissingError") code = "invalid_recovery";
  else if (value.status === 429) code = "rate_limited";
  else if (value.name === "AuthRetryableFetchError" || error instanceof TypeError) code = "network";
  return { code, message: messages[code], ...(["weak_password"].includes(code) ? { field: "password" as const } : ["email_registered", "confirmation_required"].includes(code) ? { field: "email" as const } : {}) };
}
