import { validationError, type FieldError } from "../utils/api-error.js";
import type { ProfileInput } from "../types/profile.js";

export function validateProfileBody(input: unknown, bootstrap = false): ProfileInput | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw validationError([{ field: "body", message: "Provide a JSON object." }]);
  const body = input as Record<string, unknown>;
  const errors: FieldError[] = [];
  for (const field of Object.keys(body)) if (bootstrap || field !== "displayName") errors.push({ field, message: "This field is not allowed." });
  if (!bootstrap && !Object.hasOwn(body, "displayName")) errors.push({ field: "displayName", message: "This field is required." });
  const name = typeof body.displayName === "string" ? body.displayName.trim() : null;
  if (!bootstrap && body.displayName !== null && (typeof body.displayName !== "string" || !name || Array.from(name).length > 100 || Array.from(name).some(c => { const n=c.codePointAt(0)!; return n<32 || n===127 || (n>=0xD800 && n<=0xDFFF); }))) {
    errors.push({ field: "displayName", message: "Enter 1 to 100 characters after trimming, or null. Control characters are not allowed." });
  }
  if (errors.length) throw validationError(errors);
  return bootstrap ? undefined : { displayName: name };
}
