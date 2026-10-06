import type { createAuthService } from "../../lib/auth/auth-service";
import type { AuthError } from "../../lib/auth/types";
export type AuthRoute = "login" | "register" | "forgot-password" | "reset-password";
export type AuthService = ReturnType<typeof createAuthService>;
export function validateAuthForm(route: AuthRoute, values: Record<string, string>) {
  const errors: Record<string, string> = {};
  const required = route === "register" ? ["name", "email", "password", "confirm"] : route === "login" ? ["email", "password"] : route === "forgot-password" ? ["email"] : ["password", "confirm"];
  for (const field of required) if (!values[field]?.trim()) errors[field] = "This field is required.";
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = "Enter a valid email address.";
  if (route !== "login" && values.password && values.password.length < 8) errors.password = "Use at least eight characters.\nChoose a password you do not use elsewhere.";
  if ((route === "register" || route === "reset-password") && values.confirm !== values.password) errors.confirm = "Passwords must match.";
  if (route === "register" && (values.name?.trim().length ?? 0) > 100) errors.name = "Use no more than 100 characters.";
  return errors;
}
export type SubmitOutcome = { kind: "ignored" } | { kind: "invalid"; errors: Record<string, string> } | { kind: "error"; error: AuthError } | { kind: "success"; redirect: boolean };
export function createAuthFormSubmitter(service: AuthService) {
  let pending = false;
  return async (route: AuthRoute, values: Record<string, string>, recoveryReady = false): Promise<SubmitOutcome> => {
    if (pending) return { kind: "ignored" };
    const errors = validateAuthForm(route, values);
    if (Object.keys(errors).length) return { kind: "invalid", errors };
    if (route === "reset-password" && !recoveryReady) return { kind: "error", error: { code: "invalid_recovery", message: "Your recovery link is invalid or has expired. Request a new reset link." } };
    pending = true;
    try {
      const email = values.email?.trim() ?? "";
      const result = route === "login" ? await service.signInWithEmail(email, values.password) : route === "register" ? await service.signUpWithEmail(email, values.password) : route === "forgot-password" ? await service.requestPasswordReset(email) : await service.updatePassword(values.password);
      if (result.error) return { kind: "error", error: result.error };
      if (route === "login" && !(result.data && "session" in result.data && result.data.session)) return { kind: "error", error: { code: "unexpected", message: "Sign in did not create a session. Please try again." } };
      return { kind: "success", redirect: route === "login" };
    } finally { pending = false; }
  };
}
