export const protectedPaths = new Set(["dashboard", "transactions", "accounts", "recurring", "analytics", "budgets", "goals", "settings"].map(path => `/v2/${path}`));
export function isProtectedPath(path:string) {
  return protectedPaths.has(path)||/^\/v2\/accounts\/[^/]+$/.test(path);
}
export function safeNext(value: string | null | undefined) {
  if (!value || !value.startsWith("/v2/") || /[\\\u0000-\u0020]/.test(value)) return "/v2/dashboard";
  try {
    const url = new URL(value, "https://v2.invalid");
    if (url.origin !== "https://v2.invalid" || !isProtectedPath(url.pathname) || value.split(/[?#]/)[0] !== url.pathname) return "/v2/dashboard";
    return url.pathname + url.search;
  } catch { return "/v2/dashboard"; }
}
